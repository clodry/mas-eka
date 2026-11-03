const crypto = require('crypto');
const { Pool, types } = require('pg');

// COUNT(*)/SUM(...) приходят из Postgres как BIGINT (OID 20) — pg возвращает
// их строкой, чтобы не терять точность на числах больше 2^53. В этом проекте
// такие значения никогда не бывают настолько большими, а код везде ожидает
// обычный Number (сравнения вида `if (c === 0)`), поэтому парсим как int.
types.setTypeParser(20, (val) => parseInt(val, 10));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // DATABASE_SSL=require — для управляемых БД (Render, Railway, Supabase и т.п.),
  // которые требуют TLS, но выдают сертификат, не проверяемый стандартной цепочкой.
  ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined
});

pool.on('error', (err) => {
  // Ошибки на простаивающих соединениях пула не должны ронять процесс.
  console.error('Postgres pool error:', err.message);
});

// Переводит SQL с плейсхолдерами '?' (стиль better-sqlite3) в позиционные
// '$1, $2, ...', которые понимает pg. Это позволило перенести почти все
// SQL-запросы проекта в Postgres без переписывания самого текста запроса.
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function all(sql, ...params) {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows;
}

async function get(sql, ...params) {
  const { rows } = await pool.query(toPgSql(sql), params);
  return rows[0];
}

async function run(sql, ...params) {
  const res = await pool.query(toPgSql(sql), params);
  return { rowCount: res.rowCount, rows: res.rows };
}

async function exec(sql) {
  await pool.query(sql);
}

// Первое изображение в массиве блоков — используется как превью,
// если админ не выбрал превью вручную.
function firstImageSrc(blocks) {
  if (!Array.isArray(blocks)) return null;
  const found = blocks.find((b) => b && b.type === 'image' && b.src);
  return found ? found.src : null;
}

// Случайный короткий id для поста/автора (8 URL-safe символов, ~48 бит
// энтропии) — используется вместо последовательного номера, чтобы адрес
// редактирования /admin/posts/edit/{id} нельзя было угадать перебором и
// чтобы он не выдавал количество записей в системе.
function makeRandomId() {
  return crypto.randomBytes(6).toString('base64url');
}

async function generateUniquePostId() {
  let id = makeRandomId();
  while (await get('SELECT 1 FROM posts WHERE id = ?', id)) {
    id = makeRandomId();
  }
  return id;
}

async function generateUniqueAuthorId() {
  let id = makeRandomId();
  while (await get('SELECT 1 FROM authors WHERE id = ?', id)) {
    id = makeRandomId();
  }
  return id;
}

async function generateUniqueProjectId() {
  let id = makeRandomId();
  while (await get('SELECT 1 FROM portfolio_projects WHERE id = ?', id)) {
    id = makeRandomId();
  }
  return id;
}

// Отложенный пост (status='scheduled'), время публикации которого уже
// наступило, должен вести себя как опубликованный везде на публичной части
// сайта (список блога, страница поста, sitemap) — хотя в самой БД у него
// по-прежнему status='scheduled', чтобы админ видел его настоящий статус
// в панели до момента фактической публикации.
function effectivePostStatus(row) {
  if (!row) return row;
  if (row.status === 'scheduled' && row.published_at && row.published_at <= new Date().toISOString()) {
    return 'published';
  }
  return row.status || 'published';
}

function isPostPublic(row) {
  return effectivePostStatus(row) === 'published';
}

// Контент главной страницы по умолчанию — используется при первом запуске
// и как основа для любых полей, которые ещё не сохранялись через админку.
const DEFAULT_SITE_CONTENT = {
  hero: {
    eyebrow: 'АРХИТЕКТУРА · ПРОСТРАНСТВО · ДИЗАЙН',
    line1: 'От идеи до',
    line2: 'пространства,',
    line3: 'которое работает',
    lead: 'Проектируем архитектуру, развиваем территории и создаём продуманные пространственные решения с учётом контекста, функций и потребностей людей.',
    // Поле больше не выводится ни в одном шаблоне (HERO_PHOTO/HERO_PHOTO_ALT
    // токены из public/index.html убраны — фон первого экрана теперь canvas
    // с изолиниями, см. public/js/hero-isolines.js). Оставлено в схеме на
    // случай, если понадобится снова — текст заменён на нейтральный.
    photo: '/img/1611724480_jekspertiza-3.jpg',
    photoAlt: 'Архитектурная мастерская ЕКА'
  },
  about: {
    eyebrow: 'О мастерской ЕКА',
    title: 'Мастерская, где идея становится пространственным решением',
    desc: 'Создаём пространственные решения на базе архитектурного анализа территории и задач заказчика, соответствующие градостроительным ограничениям, функционалу и пользовательским сценариям.',
    p1: 'Баланс функциональности, эстетики и контекста — основа каждого решения.',
    p2: 'Фиксируем критические параметры на этапе концепции — исключаем переделки на стадии РД и строительства.',
    // Пусто сознательно: реальных цифр (число проектов, лет практики,
    // размер команды) нет, а компания зарегистрирована в октябре 2024 —
    // прежние «12 лет на рынке / 86 объектов» были неправдой. Пустой
    // массив ничего не ломает (renderStatsHtml отдаёт пустую строку,
    // секция .stats-grid просто не рендерит карточки) и не врёт.
    // Добавьте реальные { value, suffix, label } через «Настройки сайта»,
    // когда данные появятся.
    stats: [],
    values: [
      { tag: 'КОНТЕКСТ', title: 'Анализ территории и задачи', text: 'Каждый проект начинается с изучения участка, окружения и реальных потребностей — решение рождается из контекста, а не из готового шаблона.' },
      { tag: 'ФУНКЦИОНАЛЬНОСТЬ', title: 'Пространство работает на задачу', text: 'Планировка и форма подчинены сценариям использования — удобству, а не только эстетике.' },
      { tag: 'ПРОЦЕСС', title: 'Прозрачные этапы и сроки', text: 'Концепция, ключевые решения и состав работ фиксируются на старте — заказчик видит весь путь проекта.' }
    ]
  },
  contacts: {
    tagline: 'Архитектурное проектирование и пространственное планирование — от концепции до рабочей документации.',
    // Телефон/email/адрес — реальные реквизиты ООО «МППДА "ЕКА"» по открытым
    // источникам (ЕГРЮЛ-агрегаторы). Сверьте с актуальной выпиской/визиткой
    // перед запуском — индекс адреса в разных источниках указан по-разному
    // (413093 / 413090).
    phone: '+7 965 885-27-95',
    email: 'eka-arxmaster@yandex.ru',
    address: '413093, Саратовская область, Марксовский р-н, г. Маркс, ул. Счастливая, д. 15'
  },
  seo: {
    home: {
      title: 'Мастерская ЕКА — архитектурная студия',
      description:
        'Мастерская ЕКА — архитектурное проектирование и пространственное планирование: от идеи до рабочей документации.'
    },
    blog: {
      title: 'Блог — Мастерская ЕКА',
      description:
        'Заметки мастерской ЕКА об архитектуре, пространственном планировании и дизайне: решения, подходы и разборы проектов.',
      h1: 'Заметки из мастерской'
    },
    portfolio: {
      title: 'Портфолио — Мастерская ЕКА',
      description: 'Реализованные и текущие проекты мастерской ЕКА: архитектура, пространственное планирование и дизайн.',
      h1: 'Портфолио'
    },
    robotsTxt: 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/'
  },
  // Только значения meta-тегов для подтверждения прав в вебмастерах.
  analytics: {
    yandexVerification: '',
    googleVerification: ''
  }
};

// Создаёт схему при первом запуске. В отличие от прежней версии на SQLite,
// здесь нет миграции с «очень старой» схемы (content TEXT/image TEXT/целочисленный
// id) — на Postgres проект стартует со свежей схемой. ADD COLUMN IF NOT EXISTS
// оставлен только на случай будущих обновлений уже работающей базы.
async function initDb() {
  await exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      content_blocks TEXT NOT NULL DEFAULT '[]',
      preview_image TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      custom_fonts TEXT NOT NULL DEFAULT '[]',
      seo_title TEXT,
      seo_description TEXT,
      h1 TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      author_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  // На случай обновления базы, созданной более ранней версией этого файла.
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags TEXT NOT NULL DEFAULT '[]'`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS custom_fonts TEXT NOT NULL DEFAULT '[]'`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_title TEXT`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS seo_description TEXT`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS h1 TEXT`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published'`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS published_at TEXT`);
  await exec(`UPDATE posts SET published_at = created_at WHERE published_at IS NULL`);
  await exec(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS author_id TEXT`);

  await exec(`
    CREATE TABLE IF NOT EXISTS site_content (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Авторы статей — нужны для E-E-A-T (Experience, Expertise, Authoritativeness,
  // Trust): у каждой статьи может быть выбран реальный автор со своей
  // мини-страницей (роль/квалификация, био, ссылка-подтверждение — соцсеть,
  // профиль на профильном ресурсе и т.п.), на которую поисковики и читатели
  // могут посмотреть и убедиться, что за текстом стоит реальный специалист.
  await exec(`
    CREATE TABLE IF NOT EXISTS authors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      photo TEXT,
      social_url TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Портфолио: отдельные от постов блога работы — показываются на /portfolio
  // и /portfolio/:slug. description — обычный текст (без rich-text разметки
  // статей блога), разбивается на абзацы при рендере переносом строки через
  // пустую строку; gallery — JSON-массив ссылок на доп. фото проекта.
  await exec(`
    CREATE TABLE IF NOT EXISTS portfolio_projects (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      excerpt TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      year TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '[]',
      cover_image TEXT,
      gallery TEXT NOT NULL DEFAULT '[]',
      seo_title TEXT,
      seo_description TEXT,
      h1 TEXT,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  // Только агрегированная статистика по дням: никакой истории действий,
  // cookie или идентификаторов посетителей.
  await exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      day DATE NOT NULL,
      kind TEXT NOT NULL,
      post_id TEXT NOT NULL DEFAULT '',
      views BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (day, kind, post_id)
    );
  `);

  // Переносим старую статистику в суточные суммы и удаляем журнал,
  // содержавший постоянные visitor_id и точное время каждого просмотра.
  const legacyAnalytics = await get(`SELECT to_regclass('analytics_events') AS table_name`);
  if (legacyAnalytics && legacyAnalytics.table_name) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO analytics_daily (day, kind, post_id, views)
        SELECT (created_at::timestamptz AT TIME ZONE 'UTC')::date,
               CASE WHEN type = 'post_view' THEN 'post_view' ELSE 'visit' END,
               CASE WHEN type = 'post_view' THEN COALESCE(post_id, '') ELSE '' END,
               COUNT(*)
        FROM analytics_events
        GROUP BY 1, 2, 3
        ON CONFLICT (day, kind, post_id)
        DO UPDATE SET views = analytics_daily.views + EXCLUDED.views
      `);
      await client.query('DROP TABLE analytics_events');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  const siteContentRow = await get('SELECT id FROM site_content WHERE id = 1');
  if (!siteContentRow) {
    await run(
      'INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?)',
      JSON.stringify(DEFAULT_SITE_CONTENT),
      new Date().toISOString()
    );
  }

  // Удаляем ранее сохранённый код внешней аналитики из настроек сайта.
  const savedContentRow = await get('SELECT data FROM site_content WHERE id = 1');
  try {
    const savedContent = JSON.parse(savedContentRow.data);
    const analytics = savedContent.analytics || {};
    if (analytics.yandexMetrikaCode || analytics.googleAnalyticsCode) {
      delete analytics.yandexMetrikaCode;
      delete analytics.googleAnalyticsCode;
      savedContent.analytics = analytics;
      await run(
        'UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1',
        JSON.stringify(savedContent),
        new Date().toISOString()
      );
    }
  } catch (error) {
    console.error('Не удалось очистить старые коды аналитики в настройках сайта:', error.message);
  }

  await ensureDefaultAuthor();
}

// Гарантирует, что в базе есть хотя бы один автор, и подставляет его во все
// посты без выбранного автора (в т.ч. созданные до появления этого поля) —
// чтобы на сайте не было статей без указанного автора.
async function ensureDefaultAuthor() {
  const { c } = await get('SELECT COUNT(*) as c FROM authors');
  let defaultAuthorId;

  if (c === 0) {
    const now = new Date().toISOString();
    defaultAuthorId = await generateUniqueAuthorId();
    await run(
      `INSERT INTO authors (id, name, slug, role, bio, photo, social_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      defaultAuthorId,
      'Ксения Евсеева',
      'kseniya-evseeva',
      'Директор',
      // Пусто по умолчанию — заполняется в админке («Авторы»). При пустой
      // строке блок био просто не выводится на странице (см. routes/seo.js).
      '',
      // null, а не путь-заглушка — при null блок с фото не рендерится вовсе
      // (author.photo ? <img...> : ''), а не показывает битую картинку.
      null,
      '',
      now,
      now
    );
  } else {
    const row = await get('SELECT id FROM authors ORDER BY created_at ASC LIMIT 1');
    defaultAuthorId = row.id;
  }

  await run('UPDATE posts SET author_id = ? WHERE author_id IS NULL', defaultAuthorId);
}

// Глубоко подмешивает сохранённые значения поверх дефолтов — так что если в
// сохранённом JSON не хватает какого-то нового поля (после апдейта кода),
// страница всё равно не сломается и отрисует дефолт для этого поля.
function mergeContent(defaults, saved) {
  if (Array.isArray(defaults)) return Array.isArray(saved) ? saved : defaults;
  if (defaults && typeof defaults === 'object') {
    const out = {};
    for (const key of Object.keys(defaults)) {
      out[key] = mergeContent(defaults[key], saved && typeof saved === 'object' ? saved[key] : undefined);
    }
    return out;
  }
  return saved !== undefined && saved !== null && saved !== '' ? saved : defaults;
}

async function getSiteContent() {
  const row = await get('SELECT data FROM site_content WHERE id = 1');
  let saved = {};
  try { saved = row ? JSON.parse(row.data) : {}; } catch (e) { saved = {}; }

  // Обновляем только прежние тексты по умолчанию. Если заказчик уже менял
  // содержание блока «О нас», его редактура остаётся без изменений.
  const legacyAboutCopy = {
    eyebrow: ['О нас', 'О мастерской ЕКА'],
    desc: [
      'Мы объединяем архитектурное мышление, анализ территории и проектный подход, чтобы создавать решения, отвечающие задачам места и потребностям людей.',
      'Создаём пространственные решения на базе архитектурного анализа территории и задач заказчика, соответствующие градостроительным ограничениям, функционалу и пользовательским сценариям.'
    ],
    p1: [
      'Наша задача — находить обоснованные решения, в которых функциональность, эстетика и особенности места дополняют друг друга.',
      'Баланс функциональности, эстетики и контекста — основа каждого решения.'
    ],
    p2: [
      'Каждый проект начинается с изучения задачи и исходных условий. Далее определяются концепция, ключевые решения и состав проектных работ. Этапы, сроки и результаты фиксируются в соответствии с договорённостями с заказчиком.',
      'Фиксируем критические параметры на этапе концепции — исключаем переделки на стадии РД и строительства.'
    ]
  };
  let migrated = false;
  if (saved.about && typeof saved.about === 'object') {
    for (const [key, [previous, current]] of Object.entries(legacyAboutCopy)) {
      if (saved.about[key] === previous) {
        saved.about[key] = current;
        migrated = true;
      }
    }
  }
  if (migrated && row) {
    await run(
      'UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1',
      JSON.stringify(saved),
      new Date().toISOString()
    );
  }
  return mergeContent(DEFAULT_SITE_CONTENT, saved);
}

async function saveSiteContent(partialOrFull) {
  const merged = mergeContent(DEFAULT_SITE_CONTENT, partialOrFull);
  await run(
    'UPDATE site_content SET data = ?, updated_at = ? WHERE id = 1',
    JSON.stringify(merged),
    new Date().toISOString()
  );
  return merged;
}

// ===== Трекер посещений =====

// Увеличивает только дневной агрегат; не сохраняет путь, время запроса,
// IP-адрес или идентификатор посетителя.
async function incrementAnalyticsCounter({ kind, postId = '' }) {
  if (!['visit', 'post_view'].includes(kind)) throw new Error('Unknown analytics counter');
  const day = new Date().toISOString().slice(0, 10);
  const key = kind === 'post_view' ? String(postId || '') : '';
  await run(
    `INSERT INTO analytics_daily (day, kind, post_id, views) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, kind, post_id) DO UPDATE SET views = analytics_daily.views + 1`,
    day, kind, key
  );
}

// Сводная статистика для карточек и мини-графика в разделе «Посты» админки.
async function getAnalyticsSummary() {
  const totalVisits = (await get(`SELECT COALESCE(SUM(views), 0) c FROM analytics_daily WHERE kind = 'visit'`)).c;
  const totalPostViews = (await get(`SELECT COALESCE(SUM(views), 0) c FROM analytics_daily WHERE kind = 'post_view'`)).c;
  const today = new Date().toISOString().slice(0, 10);
  const visitsToday = (
    await get(`SELECT COALESCE(SUM(views), 0) c FROM analytics_daily WHERE kind = 'visit' AND day = ?`, today)
  ).c;

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - i);
    const date = from.toISOString().slice(0, 10);
    const row = await get(
      `SELECT COALESCE(SUM(views), 0) c FROM analytics_daily WHERE kind = 'visit' AND day = ?`,
      date
    );
    last7Days.push({ date, visits: row.c });
  }

  const topPostsRaw = await all(
    `SELECT post_id, SUM(views) as views FROM analytics_daily
     WHERE kind = 'post_view' AND post_id <> ''
     GROUP BY post_id ORDER BY views DESC LIMIT 5`
  );
  const topPosts = [];
  for (const r of topPostsRaw) {
    const post = await get('SELECT title, slug FROM posts WHERE id = ?', r.post_id);
    if (post) topPosts.push({ postId: r.post_id, views: r.views, title: post.title, slug: post.slug });
  }

  return { totalVisits, totalPostViews, visitsToday, last7Days, topPosts };
}

// Карта { postId: количество просмотров } — подмешивается к списку постов в админке.
async function getPostViewCounts() {
  const rows = await all(
    `SELECT post_id, SUM(views) as views FROM analytics_daily WHERE kind = 'post_view' AND post_id <> '' GROUP BY post_id`
  );
  const map = {};
  rows.forEach((r) => { map[r.post_id] = r.views; });
  return map;
}

module.exports = {
  pool,
  all,
  get,
  run,
  exec,
  initDb,
  firstImageSrc,
  getSiteContent,
  saveSiteContent,
  generateUniquePostId,
  generateUniqueAuthorId,
  generateUniqueProjectId,
  effectivePostStatus,
  isPostPublic,
  DEFAULT_SITE_CONTENT,
  incrementAnalyticsCounter,
  getAnalyticsSummary,
  getPostViewCounts
};
