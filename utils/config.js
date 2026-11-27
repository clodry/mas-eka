// Общие настройки окружения, нужные сразу в нескольких местах (server.js,
// routes/auth.js, utils/analytics.js) — чтобы флаги cookie и имя сессионной
// cookie не расходились между модулями.
require('dotenv').config();

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Cookie помечаются Secure (передаются только по HTTPS) автоматически в
// продакшене. Явный COOKIE_SECURE=true/false перекрывает это поведение —
// В разработке его можно включить отдельно для проверки HTTPS-прокси.
// В продакшене Secure нельзя отключить настройкой: сессионная cookie должна
// передаваться только по HTTPS.
const COOKIE_SECURE = IS_PRODUCTION || process.env.COOKIE_SECURE === 'true';

const SESSION_COOKIE_NAME = 'eka.sid';

module.exports = { IS_PRODUCTION, COOKIE_SECURE, SESSION_COOKIE_NAME };
