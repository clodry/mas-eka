// Public page paths eligible for aggregate view counts.
function isTrackablePagePath(p) {
  if (p.startsWith('/api/')) return false;
  if (p.startsWith('/admin')) return false;
  if (p.startsWith('/uploads/')) return false;
  if (p === '/sitemap.xml' || p === '/robots.txt') return false;
  if (p !== '/' && /\.[a-zA-Z0-9]+$/.test(p)) return false;
  return true;
}

module.exports = { isTrackablePagePath };
