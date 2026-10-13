// Защита от CSRF: любой изменяющий данные запрос должен приходить с нашей же
// страницы. Сессионная cookie помечена SameSite=Lax, и этого достаточно для
// современных браузеров, но проверка источника закрывает случаи, когда на
// SameSite полагаться нельзя (старый браузер, редкая связка редиректов),
// и стоит ровно один сравниваемый заголовок.
const { getSiteUrl } = require('../utils/siteUrl');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(value) {
  try {
    return new URL(value).host;
  } catch (e) {
    return null;
  }
}

module.exports = function verifyOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const allowed = new Set();
  const configured = hostOf(getSiteUrl(req));
  if (configured) allowed.add(configured);
  const hostHeader = req.get('x-forwarded-host') || req.get('host');
  if (hostHeader) allowed.add(hostHeader);

  // Origin браузер присылает на всех межсайтовых и на fetch-запросах;
  // Referer — запасной вариант для обычной отправки формы.
  const origin = req.get('origin');
  const referer = req.get('referer');
  const sourceHost = origin ? hostOf(origin) : referer ? hostOf(referer) : null;

  if (!sourceHost) {
    return res.status(403).json({ error: 'Запрос отклонён: не указан источник запроса' });
  }
  if (!allowed.has(sourceHost)) {
    return res.status(403).json({ error: 'Запрос отклонён: посторонний источник запроса' });
  }

  next();
};
