// Защита от CSRF: Origin должен точно совпасть с публичным origin сайта.
// Для уже авторизованной сессии дополнительно требуется синхронизирующий
// токен, поэтому одного поддельного Origin вне браузера недостаточно.
const crypto = require('crypto');
const { normalizeOrigin, getAllowedOrigins } = require('../utils/originAllowlist');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

module.exports = function verifyOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('origin');
  const referer = req.get('referer');
  const sourceOrigin = origin ? normalizeOrigin(origin) : referer ? normalizeOrigin(referer) : null;

  if (!sourceOrigin) {
    return res.status(403).json({ error: 'Запрос отклонён: не указан источник запроса' });
  }
  if (!getAllowedOrigins().has(sourceOrigin)) {
    return res.status(403).json({ error: 'Запрос отклонён: посторонний источник запроса' });
  }

  if (req.session && req.session.isAdmin) {
    const expected = req.session.csrfToken;
    const supplied = req.get('x-csrf-token') || '';
    const expectedBuffer = Buffer.from(typeof expected === 'string' ? expected : '');
    const suppliedBuffer = Buffer.from(supplied);
    if (!expectedBuffer.length || expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
      return res.status(403).json({ error: 'Запрос отклонён: неверный CSRF-токен' });
    }
  }

  next();
};
