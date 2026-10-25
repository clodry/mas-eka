const express = require('express');
const multer = require('multer');

const { all, get, run, generateUniqueProjectId } = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../utils/asyncHandler');
const slugify = require('../utils/slugify');
const { ensureUploadDirs, imageStorage, imageFileFilter, removeUploadedFile } = require('../utils/uploads');

const router = express.Router();

ensureUploadDirs();

// cover — одно фото-обложка, gallery — до 20 дополнительных фото проекта.
const upload = multer({
  storage: multer.diskStorage(imageStorage()),
  limits: { fileSize: 5 * 1024 * 1024, files: 21 },
  fileFilter: imageFileFilter
});
const uploadFields = upload.fields([
  { name: 'cover', maxCount: 1 },
  { name: 'gallery', maxCount: 20 }
]);

const PROJECT_STATUSES = ['published', 'draft'];

function isAdminRequest(req) {
  return !!(req.session && req.session.isAdmin);
}

// Теги/категория приходят как JSON-массив или строка через запятую — тот же
// формат, что и у тегов блога (routes/posts.js), для единообразия в админке.
function parseTags(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      list = Array.isArray(parsed) ? parsed : raw.split(',');
    } catch (e) {
      list = raw.split(',');
    }
  }
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const tag = String(item || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length >= 12) break;
  }
  return out;
}

// Список ссылок на доп. фото, присланных как JSON-массив уже загруженных
// (сохранённых ранее) путей — используется при редактировании, когда часть
// галереи оставляют как есть, а часть заменяют/дополняют новыми файлами.
function parseKeptGallery(raw) {
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {
      list = [];
    }
  }
  return list.filter((src) => typeof src === 'string' && src.startsWith('/uploads/')).slice(0, 20);
}

function resolveSlug({ title, requestedSlug, isTaken }) {
  const custom = String(requestedSlug || '').trim();
  return slugify(custom || title, isTaken);
}

function serializeProject(row) {
  if (!row) return row;
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
  let gallery = [];
  try { gallery = JSON.parse(row.gallery || '[]'); } catch (e) { gallery = []; }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    description: row.description || '',
    category: row.category || '',
    location: row.location || '',
    year: row.year || '',
    tags,
    coverImage: row.cover_image,
    gallery,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    h1: row.h1 || '',
    status: row.status || 'published',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// GET /api/portfolio — публичный список (черновики видит только админ)
router.get('/', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10);
  const tagFilter = typeof req.query.tag === 'string' ? req.query.tag.trim().toLowerCase() : null;
  const admin = isAdminRequest(req);

  let rows = await all('SELECT * FROM portfolio_projects ORDER BY created_at DESC');
  if (!admin) rows = rows.filter((row) => row.status === 'published');

  let projects = rows.map(serializeProject);

  if (tagFilter) {
    projects = projects.filter((p) => p.tags.some((t) => t.toLowerCase() === tagFilter) || p.category.toLowerCase() === tagFilter);
  }
  if (limit) projects = projects.slice(0, limit);

  res.json(projects);
}));

// GET /api/portfolio/tags/all — категории+теги с количеством, для фильтра
router.get('/tags/all', asyncHandler(async (req, res) => {
  const rows = await all(`SELECT tags, category FROM portfolio_projects WHERE status = 'published'`);
  const counts = new Map();
  rows.forEach((row) => {
    let tags = [];
    try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
    const all = row.category ? [row.category, ...tags] : tags;
    const seen = new Set();
    all.forEach((tag) => {
      const key = tag.toLowerCase();
      if (seen.has(key)) return; // не считать дважды, если категория совпала с тегом в этом же проекте
      seen.add(key);
      counts.set(tag, (counts.get(tag) || 0) + 1);
    });
  });
  const result = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
  res.json(result);
}));

// GET /api/portfolio/:slug — один проект (черновик — только админу)
router.get('/:slug', asyncHandler(async (req, res) => {
  const row = await get('SELECT * FROM portfolio_projects WHERE slug = ?', req.params.slug);
  if (!row) return res.status(404).json({ error: 'Проект не найден' });
  if (row.status !== 'published' && !isAdminRequest(req)) {
    return res.status(404).json({ error: 'Проект не найден' });
  }
  res.json(serializeProject(row));
}));

// POST /api/portfolio — создать проект (только админ)
router.post('/', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const excerpt = String(req.body.excerpt || '').trim();
  if (!title || !excerpt) {
    return res.status(400).json({ error: 'Заполните название и краткое описание проекта' });
  }

  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  const galleryFiles = files.gallery || [];

  const coverImage = coverFile ? `/uploads/${coverFile.filename}` : null;
  const gallery = galleryFiles.map((f) => `/uploads/${f.filename}`);

  const status = PROJECT_STATUSES.includes(req.body.status) ? req.body.status : 'published';
  const tags = parseTags(req.body.tags);

  const isTaken = async (s) => !!(await get('SELECT 1 FROM portfolio_projects WHERE slug = ?', s));
  const slug = await resolveSlug({ title, requestedSlug: req.body.slug, isTaken });
  const id = await generateUniqueProjectId();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO portfolio_projects
       (id, title, slug, excerpt, description, category, location, year, tags, cover_image, gallery, seo_title, seo_description, h1, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title, slug, excerpt,
    String(req.body.description || '').trim(),
    String(req.body.category || '').trim().slice(0, 80),
    String(req.body.location || '').trim().slice(0, 120),
    String(req.body.year || '').trim().slice(0, 20),
    JSON.stringify(tags),
    coverImage,
    JSON.stringify(gallery),
    String(req.body.seoTitle || '').trim().slice(0, 70) || null,
    String(req.body.seoDescription || '').trim().slice(0, 200) || null,
    String(req.body.h1 || '').trim().slice(0, 150) || null,
    status, now, now
  );

  const project = await get('SELECT * FROM portfolio_projects WHERE id = ?', id);
  res.status(201).json(serializeProject(project));
}));

// PUT /api/portfolio/:id — редактировать проект (только админ)
router.put('/:id', requireAuth, uploadFields, asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM portfolio_projects WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Проект не найден' });

  const files = req.files || {};
  const coverFile = files.cover && files.cover[0];
  const newGalleryFiles = files.gallery || [];

  let coverImage = existing.cover_image;
  if (coverFile) {
    if (existing.cover_image) removeUploadedFile(existing.cover_image);
    coverImage = `/uploads/${coverFile.filename}`;
  } else if (req.body.removeCover === '1') {
    if (existing.cover_image) removeUploadedFile(existing.cover_image);
    coverImage = null;
  }

  // Галерея: то, что клиент прислал в galleryKept (уже сохранённые фото,
  // которые оставили как есть) + свежезагруженные файлы. Всё, что было в
  // старой галерее, но не попало ни туда, ни туда — файл удаляем с диска.
  const keptGallery = parseKeptGallery(req.body.galleryKept);
  const newGalleryUrls = newGalleryFiles.map((f) => `/uploads/${f.filename}`);
  const gallery = [...keptGallery, ...newGalleryUrls].slice(0, 20);

  let oldGallery = [];
  try { oldGallery = JSON.parse(existing.gallery || '[]'); } catch (e) { oldGallery = []; }
  const keptSet = new Set(keptGallery);
  oldGallery.filter((src) => !keptSet.has(src)).forEach(removeUploadedFile);

  const title = String(req.body.title || '').trim() || existing.title;
  const excerpt = String(req.body.excerpt || '').trim() || existing.excerpt;
  const status = PROJECT_STATUSES.includes(req.body.status) ? req.body.status : existing.status;
  const tags = req.body.tags !== undefined ? parseTags(req.body.tags) : JSON.parse(existing.tags || '[]');

  const isTaken = async (s) => !!(await get('SELECT 1 FROM portfolio_projects WHERE slug = ? AND id != ?', s, req.params.id));
  const slug =
    req.body.slug !== undefined
      ? await resolveSlug({ title, requestedSlug: req.body.slug, isTaken })
      : existing.slug;

  await run(
    `UPDATE portfolio_projects SET
       title = ?, slug = ?, excerpt = ?, description = ?, category = ?, location = ?, year = ?,
       tags = ?, cover_image = ?, gallery = ?, seo_title = ?, seo_description = ?, h1 = ?, status = ?, updated_at = ?
     WHERE id = ?`,
    title, slug, excerpt,
    req.body.description !== undefined ? String(req.body.description).trim() : existing.description,
    req.body.category !== undefined ? String(req.body.category).trim().slice(0, 80) : existing.category,
    req.body.location !== undefined ? String(req.body.location).trim().slice(0, 120) : existing.location,
    req.body.year !== undefined ? String(req.body.year).trim().slice(0, 20) : existing.year,
    JSON.stringify(tags),
    coverImage,
    JSON.stringify(gallery),
    req.body.seoTitle !== undefined ? (String(req.body.seoTitle).trim().slice(0, 70) || null) : existing.seo_title,
    req.body.seoDescription !== undefined ? (String(req.body.seoDescription).trim().slice(0, 200) || null) : existing.seo_description,
    req.body.h1 !== undefined ? (String(req.body.h1).trim().slice(0, 150) || null) : existing.h1,
    status,
    new Date().toISOString(),
    req.params.id
  );

  const updated = await get('SELECT * FROM portfolio_projects WHERE id = ?', req.params.id);
  res.json(serializeProject(updated));
}));

// DELETE /api/portfolio/:id — удалить проект и все его файлы (только админ)
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM portfolio_projects WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Проект не найден' });

  if (existing.cover_image) removeUploadedFile(existing.cover_image);
  let gallery = [];
  try { gallery = JSON.parse(existing.gallery || '[]'); } catch (e) { gallery = []; }
  gallery.forEach(removeUploadedFile);

  await run('DELETE FROM portfolio_projects WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

module.exports = router;
