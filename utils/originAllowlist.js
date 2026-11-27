const { IS_PRODUCTION } = require('./config');

function normalizeOrigin(value) {
  try {
    const normalized = String(value || '').trim();
    const parsed = new URL(normalized.includes('://') ? normalized : `https://${normalized}`);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.origin;
  } catch (e) {
    return null;
  }
}

function getAllowedOrigins() {
  const configured = [
    process.env.SITE_URL,
    ...(process.env.CORS_ORIGINS || '').split(','),
    process.env.RAILWAY_PUBLIC_DOMAIN
  ].filter(Boolean);
  const origins = new Set(configured.map(normalizeOrigin).filter(Boolean));
  if (!IS_PRODUCTION) {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }
  return origins;
}

module.exports = { normalizeOrigin, getAllowedOrigins };
