function getSiteUrl(req) {
  const fromEnv = process.env.SITE_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');

  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  const host = req.get('x-forwarded-host') || req.get('host');
  return `${proto}://${host}`;
}

function absoluteUrl(req, path) {
  const base = getSiteUrl(req);
  if (!path) return base;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

module.exports = { getSiteUrl, absoluteUrl };
