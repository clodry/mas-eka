const express = require('express');
const multer = require('multer');

const { all, get, run, generateUniqueAuthorId } = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../utils/asyncHandler');
const slugify = require('../utils/slugify');
const { ensureUploadDirs, imageStorage, imageFileFilter, removeUploadedFile } = require('../utils/uploads');

const router = express.Router();

ensureUploadDirs();

const upload = multer({
  storage: multer.diskStorage(imageStorage()),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter
});

function serializeAuthor(row, postCount) {
  if (!row) return row;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    role: row.role || '',
    bio: row.bio || '',
    photo: row.photo || null,
    socialUrl: row.social_url || '',
    postCount: postCount || 0,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function resolveSlug({ name, requestedSlug, isTaken }) {
  const custom = String(requestedSlug || '').trim();
  return slugify(custom || name, isTaken);
}

// Ссылка-подтверждение автора попадает в href на публичной странице и в
// поле sameAs разметки JSON-LD. Экранирование HTML само по себе не мешает
// адресу вида javascript:..., поэтому разрешаем только http и https.
function safeExternalUrl(raw) {
  const value = String(raw || '').trim().slice(0, 300);
  if (!value) return '';
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : '';
  } catch (e) {
    return '';
  }
}

// Количество опубликованных статей у каждого автора — показывается в
// админке рядом со списком авторов. Считаем именно опубликованные:
// черновики и ещё не наступившие отложенные публикации в это число не
// входят, иначе на публичной странице автора статей меньше, чем в счётчике.
async function getPublishedPostCounts() {
  const now = new Date().toISOString();
  const rows = await all(
    `SELECT author_id, COUNT(*) as c FROM posts
     WHERE author_id IS NOT NULL
       AND (status = 'published' OR (status = 'scheduled' AND published_at IS NOT NULL AND published_at <= ?))
     GROUP BY author_id`,
    now
  );
  const map = {};
  rows.forEach((r) => { map[r.author_id] = r.c; });
  return map;
}

// GET /api/authors — публичный список авторов (нужен и для мини-профилей
// на сайте, и для выпадающего списка выбора автора статьи в админке)
router.get('/', asyncHandler(async (req, res) => {
  const rows = await all('SELECT * FROM authors ORDER BY created_at ASC');
  const counts = await getPublishedPostCounts();
  res.json(rows.map((row) => serializeAuthor(row, counts[row.id])));
}));

// GET /api/authors/:slug — мини-профиль одного автора (публично)
router.get('/:slug', asyncHandler(async (req, res) => {
  const row = await get('SELECT * FROM authors WHERE slug = ?', req.params.slug);
  if (!row) return res.status(404).json({ error: 'Автор не найден' });
  const counts = await getPublishedPostCounts();
  res.json(serializeAuthor(row, counts[row.id]));
}));

// POST /api/authors — добавить автора (только админ)
router.post('/', requireAuth, upload.single('photo'), asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Укажите имя автора' });

  const role = String(req.body.role || '').trim().slice(0, 120);
  const bio = String(req.body.bio || '').trim().slice(0, 600);
  const socialUrl = safeExternalUrl(req.body.socialUrl);
  const photo = req.file ? `/uploads/${req.file.filename}` : null;

  const isTaken = async (s) => !!(await get('SELECT 1 FROM authors WHERE slug = ?', s));
  const slug = await resolveSlug({ name, requestedSlug: req.body.slug, isTaken });
  const id = await generateUniqueAuthorId();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO authors (id, name, slug, role, bio, photo, social_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, name, slug, role, bio, photo, socialUrl, now, now
  );

  const author = await get('SELECT * FROM authors WHERE id = ?', id);
  res.status(201).json(serializeAuthor(author));
}));

// PUT /api/authors/:id — редактировать автора (только админ)
router.put('/:id', requireAuth, upload.single('photo'), asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM authors WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Автор не найден' });

  const name = String(req.body.name || '').trim() || existing.name;
  const role = req.body.role !== undefined ? String(req.body.role).trim().slice(0, 120) : existing.role;
  const bio = req.body.bio !== undefined ? String(req.body.bio).trim().slice(0, 600) : existing.bio;
  const socialUrl =
    req.body.socialUrl !== undefined ? safeExternalUrl(req.body.socialUrl) : existing.social_url;

  let photo = existing.photo;
  if (req.file) {
    if (existing.photo) removeUploadedFile(existing.photo);
    photo = `/uploads/${req.file.filename}`;
  } else if (req.body.removePhoto === '1') {
    if (existing.photo) removeUploadedFile(existing.photo);
    photo = null;
  }

  const isTaken = async (s) => !!(await get('SELECT 1 FROM authors WHERE slug = ? AND id != ?', s, req.params.id));
  const slug =
    req.body.slug !== undefined ? await resolveSlug({ name, requestedSlug: req.body.slug, isTaken }) : existing.slug;

  await run(
    `UPDATE authors SET name = ?, slug = ?, role = ?, bio = ?, photo = ?, social_url = ?, updated_at = ?
     WHERE id = ?`,
    name, slug, role, bio, photo, socialUrl, new Date().toISOString(), req.params.id
  );

  const updated = await get('SELECT * FROM authors WHERE id = ?', req.params.id);
  res.json(serializeAuthor(updated));
}));

// DELETE /api/authors/:id — удалить автора (только админ). Нельзя удалить
// последнего автора в системе — у каждой статьи должен быть указан автор.
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM authors WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Автор не найден' });

  const { c } = await get('SELECT COUNT(*) as c FROM authors');
  if (c <= 1) {
    return res.status(400).json({ error: 'Нельзя удалить единственного автора — сначала добавьте другого' });
  }

  const fallback = await get('SELECT id FROM authors WHERE id != ? ORDER BY created_at ASC LIMIT 1', req.params.id);
  await run('UPDATE posts SET author_id = ? WHERE author_id = ?', fallback.id, req.params.id);

  if (existing.photo) removeUploadedFile(existing.photo);
  await run('DELETE FROM authors WHERE id = ?', req.params.id);
  res.json({ ok: true, reassignedTo: fallback.id });
}));

module.exports = router;
