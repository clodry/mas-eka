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
    eyebrow: 'Мастерская ЕКА',
    line1: 'От идеи до',
    line2: 'пространства,',
    line3: 'которое работает',
    lead: 'Проектируем архитектуру, развиваем территории и создаём продуманные пространственные решения с учётом контекста, функций и потребностей людей.',
    // Фон первого экрана. Здесь стоит ВРЕМЕННАЯ заглушка — единственная
    // фотография объекта, которая есть в проекте, и она всего 512 px по
    // ширине, поэтому на весь экран растягивается мягко. Замените своим
    // горизонтальным снимком (от 1920 px) в «Настройки сайта».
    photo: '/img/1611724480_jekspertiza-3.jpg',
    photoAlt: 'Строительство объекта: монтаж металлического каркаса'
  },
  about: {
    eyebrow: 'О нас',
    title: 'Мастерская, где идея становится пространственным решением',
    desc: 'Мы объединяем архитектурное мышление, анализ территории и проектный подход, чтобы создавать решения, отвечающие задачам места и потребностям людей.',
    p1: 'Наша задача — находить обоснованные решения, в которых функциональность, эстетика и особенности места дополняют друг друга.\nКаждый проект начинается с изучения задачи и исходных условий. Далее определяются концепция, ключевые решения и состав проектных работ. Этапы, сроки и результаты фиксируются в соответствии с договорённостями с заказчиком.',
    stats: [
      { value: 12, suffix: '', label: 'лет на строительном рынке' },
      { value: 86, suffix: '', label: 'сданных объектов' },
      { value: 14, suffix: '', label: 'специалистов в команде' },
      { value: 98, suffix: '%', label: 'клиентов сдают повторный заказ' }
    ],
    values: [
      { tag: 'МАТЕРИАЛЫ', title: 'Только проверенные поставщики', text: 'Бетон, арматура и кровельные материалы — с сертификатами и актами на каждую партию.' },
      { tag: 'ТОЧНОСТЬ', title: 'Разметка и допуски по проекту', text: 'Отклонения по уровню и вертикали контролируются на каждом этапе, а не только при сдаче.' },
      { tag: 'СРОКИ', title: 'График, который держит бригада', text: 'Смещения фиксируются в отчёте заранее — без сюрпризов в последнюю неделю.' }
    ]
  },
  contacts: {
    tagline: 'Строительство и капитальный ремонт частных домов под ключ.',
    phone: '+7 (000) 000-00-00',
    email: 'info@masterskaya-eka.example',
    address: 'г. Ваш город, ул. Примерная, 1'
  },
  seo: {
    home: {
      title: 'Мастерская ЕКА — Глвыная',
      description:
        'ЕКА — МАСТЕРСКАЯ ПРОСТРАНСТВЕННОГО ПЛАНИРОВАНИЯ, ДИЗАЙНА И АРХИТЕКТУРЫ'
    },
    blog: {
      title: 'Блог — Мастерская ЕКА',
      description:
        'Заметки из мастерской ЕКА: реальные решения, материалы и чек-листы с наших строительных объектов.',
      h1: 'Заметки из мастерской'
    },
    robotsTxt: 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/'
  },
  // Слоты под счётчики и подтверждение прав в вебмастерских — редактируются
  // в «Настройки сайта». yandexMetrikaCode / googleAnalyticsCode — это
  // готовый веб-код счётчика целиком (со <script> внутри), как его выдают
  // Яндекс.Метрика и Google Analytics при создании счётчика — вставляется
  // в <head> публичных страниц как есть. yandexVerification /
  // googleVerification — только значение content для мета-тега
  // подтверждения прав в Яндекс.Вебмастере и Google Search Console.
  analytics: {
    yandexMetrikaCode: '',
    googleAnalyticsCode: '',
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

  // Трекер посещений: одна строка на событие. type = 'visit' (открытие
  // любой страницы сайта) или 'post_view' (открытие конкретного поста).
  // visitor_id — случайный id из cookie, не привязан к личности, нужен
  // только чтобы отличать уникальных посетителей от общего числа визитов.
  await exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id SERIAL PRIMARY KEY,
      type TEXT NOT NULL,
      post_id TEXT,
      path TEXT,
      visitor_id TEXT,
      created_at TEXT NOT NULL
    );
  `);
  await exec(`CREATE INDEX IF NOT EXISTS idx_analytics_type_created ON analytics_events(type, created_at);`);
  await exec(`CREATE INDEX IF NOT EXISTS idx_analytics_post ON analytics_events(post_id);`);

  const { c } = await get('SELECT COUNT(*) as c FROM posts');
  if (c === 0) await seedDemoPosts();

  const siteContentRow = await get('SELECT id FROM site_content WHERE id = 1');
  if (!siteContentRow) {
    await run(
      'INSERT INTO site_content (id, data, updated_at) VALUES (1, ?, ?)',
      JSON.stringify(DEFAULT_SITE_CONTENT),
      new Date().toISOString()
    );
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
      'Мастерская ЕКА',
      'masterskaya-eka',
      'Прораб, руководитель бригады',
      'Ведём объекты от заливки фундамента до сдачи ключей: следим за материалами, сроками и качеством каждого узла.',
      '/images/builder.jpg',
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

async function seedDemoPosts() {
  const now = new Date().toISOString();
  const demoPosts = [
    {
      title: 'Как мы выбираем материалы для фундамента',
      slug: 'kak-my-vybiraem-materialy-dlya-fundamenta',
      excerpt:
        'Три критерия, по которым мастерская ЕКА отбирает бетон и арматуру перед закладкой основания.',
      tags: ['Фундамент', 'Материалы'],
      blocks: [
        {
          type: 'paragraph',
          text: 'Это демонстрационный пост — замените его на настоящую статью через админ-панель. Здесь можно рассказать про марки бетона, класс арматуры и то, как погодные условия влияют на график заливки фундамента.'
        }
      ]
    },
    {
      title: 'Чек-лист перед началом стройки',
      slug: 'cheklist-pered-nachalom-stroyki',
      excerpt: 'Что нужно согласовать с заказчиком до того, как бригада выйдет на объект.',
      tags: ['Чек-листы'],
      blocks: [
        { type: 'paragraph', text: 'Демонстрационный текст. Опишите этапы согласования проекта, необходимые документы и типичные сроки.' }
      ]
    },
    {
      title: 'Отделка мансарды: на что обратить внимание',
      slug: 'otdelka-mansardy-na-chto-obratit-vnimanie',
      excerpt: 'Особенности утепления и отделки мансардных помещений в частном доме.',
      tags: ['Отделка', 'Кровля'],
      blocks: [
        { type: 'paragraph', text: 'Демонстрационный текст про пароизоляцию, выбор утеплителя и вентиляцию кровельного пирога.' }
      ]
    }
  ];

  for (const post of demoPosts) {
    const id = await generateUniquePostId();
    await run(
      `INSERT INTO posts (id, title, slug, excerpt, content_blocks, preview_image, tags, status, published_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      post.title,
      post.slug,
      post.excerpt,
      JSON.stringify(post.blocks),
      firstImageSrc(post.blocks),
      JSON.stringify(post.tags || []),
      'published',
      now,
      now,
      now
    );
  }
}

// ===== Трекер посещений =====

// Записывает одно событие посещения. type: 'visit' | 'post_view'.
async function logAnalyticsEvent({ type, postId = null, path = null, visitorId = null }) {
  await run(
    `INSERT INTO analytics_events (type, post_id, path, visitor_id, created_at) VALUES (?, ?, ?, ?, ?)`,
    type, postId, path, visitorId, new Date().toISOString()
  );
}

// Начало дня (00:00 локального времени сервера) N дней назад в виде ISO-строки —
// используется и для «сегодня» (daysAgo=0), и для построения графика за неделю.
function startOfDayIso(daysAgo) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// Сводная статистика для карточек и мини-графика в разделе «Посты» админки.
async function getAnalyticsSummary() {
  const totalVisits = (await get(`SELECT COUNT(*) c FROM analytics_events WHERE type = 'visit'`)).c;
  const totalPostViews = (await get(`SELECT COUNT(*) c FROM analytics_events WHERE type = 'post_view'`)).c;
  const uniqueVisitors = (
    await get(`SELECT COUNT(DISTINCT visitor_id) c FROM analytics_events WHERE type = 'visit' AND visitor_id IS NOT NULL`)
  ).c;
  const visitsToday = (
    await get(`SELECT COUNT(*) c FROM analytics_events WHERE type = 'visit' AND created_at >= ?`, startOfDayIso(0))
  ).c;

  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const from = startOfDayIso(i);
    const to = startOfDayIso(i - 1);
    const row = await get(
      `SELECT COUNT(*) c FROM analytics_events WHERE type = 'visit' AND created_at >= ? AND created_at < ?`,
      from, to
    );
    last7Days.push({ date: from.slice(0, 10), visits: row.c });
  }

  const topPostsRaw = await all(
    `SELECT post_id, COUNT(*) as views FROM analytics_events
     WHERE type = 'post_view' AND post_id IS NOT NULL
     GROUP BY post_id ORDER BY views DESC LIMIT 5`
  );
  const topPosts = [];
  for (const r of topPostsRaw) {
    const post = await get('SELECT title, slug FROM posts WHERE id = ?', r.post_id);
    if (post) topPosts.push({ postId: r.post_id, views: r.views, title: post.title, slug: post.slug });
  }

  return { totalVisits, totalPostViews, uniqueVisitors, visitsToday, last7Days, topPosts };
}

// Карта { postId: количество просмотров } — подмешивается к списку постов в админке.
async function getPostViewCounts() {
  const rows = await all(
    `SELECT post_id, COUNT(*) as views FROM analytics_events WHERE type = 'post_view' AND post_id IS NOT NULL GROUP BY post_id`
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
  effectivePostStatus,
  isPostPublic,
  DEFAULT_SITE_CONTENT,
  logAnalyticsEvent,
  getAnalyticsSummary,
  getPostViewCounts
};
