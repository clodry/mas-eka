const crypto = require('crypto');

const { COOKIE_SECURE } = require('./config');

const VISITOR_COOKIE = 'eka_vid';
const VISITOR_COOKIE_MAX_AGE = 1000 * 60 * 60 * 24 * 365; // 1 год

// Простой парсинг Cookie-заголовка — в проекте нет cookie-parser,
// а нужно нам только одно значение.
function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  return header.split(';').reduce((acc, part) => {
    const idx = part.indexOf('=');
    if (idx === -1) return acc;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

// Возвращает анонимный id посетителя из cookie, либо создаёт новый и
// выставляет его в ответ. Не содержит и не привязан ни к каким личным
// данным — используется только чтобы отличать уникальных посетителей
// от общего числа визитов в статистике.
function getOrSetVisitorId(req, res) {
  const cookies = parseCookies(req);
  if (cookies[VISITOR_COOKIE]) return cookies[VISITOR_COOKIE];

  const id = crypto.randomBytes(16).toString('hex');
  res.cookie(VISITOR_COOKIE, id, {
    maxAge: VISITOR_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: COOKIE_SECURE
  });
  return id;
}

// Определяет, нужно ли считать этот GET-запрос визитом сайта: только
// «страничные» адреса — не API, не админка, не статические файлы
// (картинки/css/js/шрифты и т.д., у которых в пути есть расширение).
function isTrackablePagePath(p) {
  if (p.startsWith('/api/')) return false;
  if (p.startsWith('/admin')) return false;
  if (p.startsWith('/uploads/')) return false;
  if (p === '/sitemap.xml' || p === '/robots.txt') return false;
  if (p !== '/' && /\.[a-zA-Z0-9]+$/.test(p)) return false;
  return true;
}

module.exports = { parseCookies, getOrSetVisitorId, isTrackablePagePath, VISITOR_COOKIE };
