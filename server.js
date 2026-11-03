require('dotenv').config();

const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const multer = require('multer');

const { initDb, incrementAnalyticsCounter } = require('./db/database');
const authRouter = require('./routes/auth');
const postsRouter = require('./routes/posts');
const authorsRouter = require('./routes/authors');
const portfolioRouter = require('./routes/portfolio');
const siteContentRouter = require('./routes/siteContent');
const seoRouter = require('./routes/seo');
const analyticsRouter = require('./routes/analytics');
const verifyOrigin = require('./middleware/verifyOrigin');
const { isTrackablePagePath } = require('./utils/analytics');
const { IS_PRODUCTION, COOKIE_SECURE, SESSION_COOKIE_NAME } = require('./utils/config');

// ===== Проверка обязательных секретов при старте =====
// Раньше при отсутствии SESSION_SECRET подставлялась строка-заглушка прямо из
// кода: зная её, кто угодно мог подписать себе cookie администратора. Поэтому
// в продакшене без нормального секрета приложение просто не стартует, а в
// разработке генерируется случайный секрет на время работы процесса (после
// перезапуска сессии слетают — для локальной работы это нормально).
const WEAK_SECRETS = ['change-me-in-dot-env', 'замените-на-длинную-случайную-строку'];

function resolveSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16 && !WEAK_SECRETS.includes(secret)) return secret;

  if (IS_PRODUCTION) {
    console.error(
      'SESSION_SECRET не задан или слишком короткий. Задайте в .env длинную случайную строку (минимум 16 символов) — см. README.'
    );
    process.exit(1);
  }

  console.warn(
    'ВНИМАНИЕ: SESSION_SECRET не задан — сгенерирован временный секрет на время работы процесса. Сессии не переживут перезапуск. Задайте SESSION_SECRET в .env.'
  );
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_SECRET = resolveSessionSecret();

if (!process.env.ADMIN_PASSWORD_HASH) {
  const message =
    'ADMIN_PASSWORD_HASH не задан — вход в админ-панель работать не будет. Получите хэш: npm run hash-password -- "ваш-пароль"';
  if (IS_PRODUCTION) {
    console.error(message);
    process.exit(1);
  }
  console.warn(`ВНИМАНИЕ: ${message}`);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.disable('x-powered-by');

// ===== Базовые защитные заголовки =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (COOKIE_SECURE) {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  next();
});

app.use(express.json({ limit: '256kb' }));
app.use(express.urlencoded({ extended: true, limit: '256kb' }));

app.use(
  session({
    name: SESSION_COOKIE_NAME,
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: COOKIE_SECURE,
      maxAge: 1000 * 60 * 60 * 8 // 8 часов
    }
  })
);

// Изменяющие данные запросы принимаем только со своих же страниц.
app.use(verifyOrigin);

// Дневная статистика агрегирована и не содержит историю по посетителям.
app.use((req, res, next) => {
  if (req.method !== 'GET' || !isTrackablePagePath(req.path)) return next();

  // Удаляем прежнюю аналитику cookie у тех, кто посещал сайт раньше.
  if (/(^|;\s*)eka_vid=/.test(req.headers.cookie || '')) {
    res.clearCookie('eka_vid', { path: '/', httpOnly: true, sameSite: 'lax', secure: COOKIE_SECURE });
  }

  res.on('finish', () => {
    const delivered = (res.statusCode >= 200 && res.statusCode < 300) || res.statusCode === 304;
    if (!delivered) return;
    incrementAnalyticsCounter({ kind: 'visit' }).catch((e) => {
      console.error('analytics track error:', e.message);
    });
  });

  next();
});

app.use(seoRouter);

// Красивые адреса админ-панели: /admin, /admin/newpost, /admin/posts, /admin/settings.
// Все они отдают одну и ту же страницу (views/admin.html), а нужный раздел
// открывается на стороне браузера скриптом admin.js по адресу страницы.
//
// Разметка панели лежит в views/, а не в public/ — иначе express.static
// отдавал бы её по адресу /admin.html в обход проверки сессии.
//
// Вход в панель всегда происходит через /admin/auth: если сессии нет —
// любой /admin* адрес редиректит сюда, а сама страница логина, если
// пользователь уже авторизован, редиректит обратно в панель.
function isAdminSession(req) {
  return !!(req.session && req.session.isAdmin);
}

app.get('/admin/auth', (req, res) => {
  if (isAdminSession(req)) {
    return res.redirect('/admin/posts');
  }
  res.sendFile(path.join(__dirname, 'views', 'admin-login.html'));
});

app.get(['/admin', '/admin/newpost', '/admin/posts', '/admin/authors', '/admin/portfolio', '/admin/settings', '/admin/posts/edit/:id', '/admin/posts/:id'], (req, res) => {
  if (!isAdminSession(req)) {
    return res.redirect('/admin/auth');
  }
  res.sendFile(path.join(__dirname, 'views', 'admin.html'));
});

// Скрипт и стили панели тоже отдаём только по сессии — иначе устройство
// админки читается кем угодно прямо из статики. Файлы страницы входа
// (admin-login.*) остаются публичными: без них нельзя было бы войти.
// Отвечаем 404, а не 403, чтобы не подтверждать существование файлов.
const ADMIN_ONLY_ASSETS = new Set(['/js/admin.js', '/css/admin.css']);

app.use((req, res, next) => {
  if (ADMIN_ONLY_ASSETS.has(req.path) && !isAdminSession(req)) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRouter);
app.use('/api/posts', postsRouter);
app.use('/api/authors', authorsRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/site-content', siteContentRouter);
app.use('/api/analytics', analyticsRouter);

// Обработка ошибок. Наружу отдаём только те сообщения, которые предназначены
// пользователю (ошибки загрузки файлов, некорректный запрос); всё остальное —
// обезличенная 500, а подробности с трассировкой уходят в лог сервера. Раньше
// сюда попадал текст любой внутренней ошибки, включая пути на диске.
const MULTER_MESSAGES = {
  LIMIT_FILE_SIZE: 'Файл слишком большой',
  LIMIT_FILE_COUNT: 'Слишком много файлов в одном запросе',
  LIMIT_PART_COUNT: 'Слишком много частей в запросе',
  LIMIT_UNEXPECTED_FILE: 'Неожиданное поле с файлом'
};

app.use((err, req, res, next) => {
  if (!err) return next();

  console.error(`Ошибка ${req.method} ${req.originalUrl}:`, err.stack || err.message);

  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: MULTER_MESSAGES[err.code] || 'Не удалось загрузить файл' });
  }

  const status = Number(err.status || err.statusCode);
  if (err.expose === true && status >= 400 && status < 500) {
    return res.status(status).json({ error: err.message });
  }

  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// Страница 404: любой адрес, не совпавший ни с одним маршрутом выше.
// Для /api/* отдаём JSON, для остальных — оформленную HTML-страницу 404.html.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Не найдено' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// initDb создаёт таблицы в Postgres (если их ещё нет) и сидирует демо-данные
// при первом запуске — сервер не должен начинать принимать запросы раньше,
// чем эта схема готова, поэтому app.listen вызывается только после await.
initDb()
  .then(() => {
    // Явно слушаем 0.0.0.0, а не только loopback: на Railway (и похожих
    // платформах) без этого прокси-сервер снаружи не может достучаться до
    // контейнера, хотя сам процесс в логах выглядит запущенным нормально.
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`сервер запущен: http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Не удалось подключиться к Postgres / создать схему:', err.message);
    process.exit(1);
  });
