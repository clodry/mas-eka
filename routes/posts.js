const express = require('express');
const multer = require('multer');
const path = require('path');
const sanitizeHtml = require('sanitize-html');

const { all, get, run, firstImageSrc, generateUniquePostId, getPostViewCounts, effectivePostStatus } = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../utils/asyncHandler');
const slugify = require('../utils/slugify');
const {
  ensureUploadDirs,
  imageStorage,
  imageFileFilter,
  fontStorage,
  fontFileFilter,
  isSafeUploadRef,
  removeUploadedFile
} = require('../utils/uploads');

const router = express.Router();

// Разрешённая разметка для абзацев rich-text редактора: жирный, курсив,
// подчёркивание, зачёркивание, ссылки, списки, а также span с ограниченным
// набором инлайн-стилей — только размер и семейство шрифта (для выбора
// размера текста и применения загруженного пользователем шрифта). Всё
// остальное (script, style, on*-атрибуты, произвольные теги/CSS-свойства)
// вырезается.
const SANITIZE_OPTIONS = {
  allowedTags: ['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'a', 'br', 'ul', 'ol', 'li', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'], span: ['style'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedStyles: {
    '*': {
      'font-size': [/^\d+(\.\d+)?(px|em|rem|%)$/],
      'font-family': [/^[a-zA-Z0-9_\-\s'",.]{1,120}$/]
    }
  },
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' })
  }
};

function sanitizeParagraphHtml(html) {
  return sanitizeHtml(String(html || ''), SANITIZE_OPTIONS).trim();
}

function isBlankHtml(html) {
  return sanitizeHtml(String(html || ''), { allowedTags: [], allowedAttributes: {} }).trim().length === 0;
}

// Принимает теги как JSON-массив ('["Кровля","Фундамент"]') или строку через
// запятую ('Кровля, Фундамент') — так проще отправлять и из формы, и из кода.
// Нормализует: обрезает пробелы, убирает пустые и дубликаты (без учёта регистра),
// ограничивает длину и количество, чтобы не раздувать sitemap/JSON-LD.
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

// Имя сохраняемого файла и допустимые расширения — в utils/uploads.js:
// расширение берётся только из белого списка, поэтому подложить в /uploads/
// исполняемый браузером файл (.html, .svg) под видом картинки нельзя.
ensureUploadDirs();

const upload = multer({
  storage: multer.diskStorage(imageStorage()),
  limits: { fileSize: 5 * 1024 * 1024, files: 30 },
  fileFilter: imageFileFilter
});

// ===== Загрузка пользовательских шрифтов для rich-text редактора =====
const uploadFont = multer({
  storage: multer.diskStorage(fontStorage()),
  limits: { fileSize: 4 * 1024 * 1024, files: 1 },
  fileFilter: fontFileFilter
});

// Уникальное безопасное имя font-family, полученное из имени файла +
// случайный суффикс — исключает совпадения и CSS-инъекции через имя файла.
function makeFontFamilyName(originalname) {
  const base = path
    .basename(originalname, path.extname(originalname))
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40) || 'Font';
  return `Custom_${base}_${Date.now().toString(36)}`;
}

// Принимает список шрифтов, загруженных в этом посте, как JSON-строку.
// Отсеивает записи без корректных family/url (url обязан указывать на
// собственную папку uploads/fonts — никаких внешних адресов).
function parseCustomFonts(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch (e) {
      list = [];
    }
  }

  const seen = new Set();
  const out = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const family = String(item.family || '').trim();
    const url = String(item.url || '').trim();
    if (!/^[a-zA-Z0-9_]{1,80}$/.test(family)) continue;
    if (!/^\/uploads\/fonts\/[a-zA-Z0-9_.\-]+$/.test(url)) continue;
    if (seen.has(family)) continue;
    seen.add(family);
    out.push({ family, url, originalName: String(item.originalName || '').slice(0, 120) });
    if (out.length >= 10) break;
  }
  return out;
}

// Оставляет только те шрифты, чьё имя (family) реально встречается в HTML
// сохраняемых блоков статьи — чтобы в базе не копились шрифты, которые
// загрузили, но потом удалили из текста или отменили редактирование.
function keepFontsUsedInBlocks(fonts, blocks) {
  const html = (blocks || []).map((b) => (b.type === 'paragraph' ? b.html : '')).join(' ');
  return fonts.filter((f) => html.includes(f.family));
}

// Мини-профиль автора, подмешиваемый в JSON поста — только то, что нужно для
// байлайна и ссылки на мини-профиль на публичной части сайта.
function serializeAuthorRef(authorRow) {
  if (!authorRow) return null;
  return {
    id: authorRow.id,
    name: authorRow.name,
    slug: authorRow.slug,
    role: authorRow.role || '',
    photo: authorRow.photo || null
  };
}

async function getAuthorRow(authorId) {
  if (!authorId) return null;
  return get('SELECT * FROM authors WHERE id = ?', authorId);
}

// authorRow — уже заранее загруженная строка автора (или null), а не id:
// так при сериализации списка постов можно один раз загрузить всех авторов
// пачкой, а не делать по отдельному запросу на каждый пост (N+1).
function serializePost(row, viewCount, authorRow) {
  if (!row) return row;
  let blocks = [];
  try { blocks = JSON.parse(row.content_blocks || '[]'); } catch (e) { blocks = []; }
  let tags = [];
  try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
  let customFonts = [];
  try { customFonts = JSON.parse(row.custom_fonts || '[]'); } catch (e) { customFonts = []; }
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    blocks,
    tags,
    customFonts,
    previewImage: row.preview_image,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    h1: row.h1 || '',
    views: viewCount || 0,
    status: row.status || 'published',
    effectiveStatus: effectivePostStatus(row),
    publishedAt: row.published_at || null,
    authorId: row.author_id || null,
    author: serializeAuthorRef(authorRow || null),
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

const POST_STATUSES = ['published', 'draft', 'scheduled'];

// Готовит поля статуса публикации к сохранению.
// - published: публикуется сразу — если у поста ещё не было даты публикации
//   (черновик/новый пост), ставим текущий момент; при повторном сохранении
//   уже опубликованного поста дата публикации не «прыгает».
// - draft: не показывается на сайте, дата публикации не задана.
// - scheduled: требует publishedAt в будущем — до этого момента пост ведёт
//   себя как черновик, после — как опубликованный (см. effectivePostStatus).
function buildStatusFields(body, existing) {
  const status = POST_STATUSES.includes(body.status) ? body.status : existing ? existing.status : 'published';

  if (status === 'draft') {
    return { status, publishedAt: null };
  }

  if (status === 'scheduled') {
    const raw = String(body.publishedAt || '').trim();
    const date = raw ? new Date(raw) : null;
    if (!date || Number.isNaN(date.getTime())) {
      return { error: 'Укажите корректные дату и время отложенной публикации' };
    }
    if (date.getTime() <= Date.now()) {
      return { error: 'Дата отложенной публикации должна быть в будущем' };
    }
    return { status, publishedAt: date.toISOString() };
  }

  // published
  const already = existing && existing.published_at;
  return { status: 'published', publishedAt: already || new Date().toISOString() };
}

function isAdminRequest(req) {
  return !!(req.session && req.session.isAdmin);
}

// Готовит SEO-поля (title/description/H1) и ЧПУ-адрес (slug) поста к сохранению.
// - seoTitle/seoDescription/h1: необязательные, обрезаются до разумной длины;
//   если не заданы — на странице поста используются title/excerpt.
// - slug: если админ передал свой адрес — он транслитерируется/очищается той же
//   функцией slugify (это разрешает и ручную правку, и вставку кириллицы), если
//   оставил поле пустым — адрес генерируется автоматически из заголовка.
//   Уникальность гарантируется через isTaken (проверка исключает сам редактируемый пост).
function buildSeoFields(body) {
  return {
    seoTitle: String(body.seoTitle || '').trim().slice(0, 70),
    seoDescription: String(body.seoDescription || '').trim().slice(0, 200),
    h1: String(body.h1 || '').trim().slice(0, 150)
  };
}

async function resolveSlug({ title, requestedSlug, isTaken }) {
  const custom = String(requestedSlug || '').trim();
  return slugify(custom || title, isTaken);
}

// Достаёт все src изображений из массива блоков
function imageSrcsOf(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((b) => b && b.type === 'image' && b.src)
    .map((b) => b.src);
}

// Разбирает присланные блоки + файлы в финальный content_blocks для сохранения.
// Возвращает { blocks, idToSrc } — idToSrc нужен, чтобы найти src блока,
// выбранного как превью через кнопку «Добавить как превью».
function buildBlocks(rawBlocksJson, files) {
  let rawBlocks = [];
  try { rawBlocks = JSON.parse(rawBlocksJson || '[]'); } catch (e) { rawBlocks = []; }
  if (!Array.isArray(rawBlocks)) rawBlocks = [];

  const filesByField = {};
  (files || []).forEach((f) => { filesByField[f.fieldname] = f; });

  const idToSrc = {};
  const finalBlocks = [];

  rawBlocks.forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;

    if (raw.type === 'paragraph') {
      const html = sanitizeParagraphHtml(raw.html !== undefined ? raw.html : raw.text);
      if (isBlankHtml(html)) return; // пропускаем пустые абзацы
      finalBlocks.push({ type: 'paragraph', html });
      return;
    }

    if (raw.type === 'image') {
      const file = raw.id ? filesByField[`img_${raw.id}`] : null;
      let src = null;
      if (file) {
        src = `/uploads/${file.filename}`;
      } else if (isSafeUploadRef(raw.existingSrc)) {
        // Только ссылка на наш собственный файл в /uploads: произвольный
        // путь отсюда попал бы и в базу, и в удаление файлов при
        // следующем сохранении поста.
        src = raw.existingSrc;
      }
      if (!src) return; // пустой блок-изображение без файла — пропускаем
      const caption = String(raw.caption || '').trim();
      if (raw.id) idToSrc[raw.id] = src;
      finalBlocks.push({ type: 'image', src, caption });
    }
  });

  return { blocks: finalBlocks, idToSrc };
}

// Определяет итоговое превью-фото. Приоритет:
// 1) отдельно загруженное фото превью (поле previewUpload)
// 2) уже сохранённое ранее отдельное фото превью (previewExistingSrc, при редактировании)
// 3) фото из статьи, отмеченное кнопкой «Добавить как превью» (previewId -> idToSrc)
// 4) авто: первое фото в статье
function resolvePreviewImage({ files, body, idToSrc, finalBlocks }) {
  const previewFile = (files || []).find((f) => f.fieldname === 'previewUpload');
  if (previewFile) return `/uploads/${previewFile.filename}`;

  if (isSafeUploadRef(body.previewExistingSrc)) return body.previewExistingSrc;

  if (body.previewId && idToSrc[body.previewId]) return idToSrc[body.previewId];

  return firstImageSrc(finalBlocks);
}

// POST /api/posts/upload-font — загрузить файл шрифта (только админ),
// используется rich-text редактором статьи. Возвращает сгенерированное
// имя font-family и адрес файла — их подставляет клиент в inline-стиль
// выделенного текста и передаёт со списком шрифтов при сохранении поста.
router.post('/upload-font', requireAuth, uploadFont.single('font'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл шрифта не получен' });
  const family = makeFontFamilyName(req.file.originalname);
  res.json({
    family,
    url: `/uploads/fonts/${req.file.filename}`,
    originalName: req.file.originalname
  });
});

// GET /api/posts?limit=3&tag=Кровля — список постов, опционально
// отфильтрованный по тегу (без учёта регистра). Для гостей отдаём только
// опубликованные (и уже наступившие отложенные) статьи; авторизованному
// админу — вообще все, включая черновики, чтобы панель показывала полный
// список с реальными статусами.
router.get('/', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit, 10);
  const tagFilter = typeof req.query.tag === 'string' ? req.query.tag.trim().toLowerCase() : null;
  const admin = isAdminRequest(req);

  let rows = await all('SELECT * FROM posts ORDER BY COALESCE(published_at, created_at) DESC');
  if (!admin) rows = rows.filter((row) => effectivePostStatus(row) === 'published');

  const [viewCounts, authors] = await Promise.all([getPostViewCounts(), all('SELECT * FROM authors')]);
  const authorsById = {};
  authors.forEach((a) => { authorsById[a.id] = a; });

  let posts = rows.map((row) => serializePost(row, viewCounts[row.id], authorsById[row.author_id]));

  if (tagFilter) {
    posts = posts.filter((p) => p.tags.some((t) => t.toLowerCase() === tagFilter));
  }
  if (limit) {
    posts = posts.slice(0, limit);
  }

  res.json(posts);
}));

// GET /api/posts/tags/all — список всех тегов с количеством постов (публично),
// используется для фильтра в блоге и в подсказках при вводе тегов в админке
router.get('/tags/all', asyncHandler(async (req, res) => {
  const rows = await all('SELECT tags FROM posts');
  const counts = new Map();
  rows.forEach((row) => {
    let tags = [];
    try { tags = JSON.parse(row.tags || '[]'); } catch (e) { tags = []; }
    tags.forEach((tag) => counts.set(tag, (counts.get(tag) || 0) + 1));
  });
  const result = Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'ru'));
  res.json(result);
}));

// GET /api/posts/:slug — один пост по slug. Черновики и ещё не наступившие
// отложенные публикации доступны только авторизованному админу.
router.get('/:slug', asyncHandler(async (req, res) => {
  const post = await get('SELECT * FROM posts WHERE slug = ?', req.params.slug);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });
  if (effectivePostStatus(post) !== 'published' && !isAdminRequest(req)) {
    return res.status(404).json({ error: 'Пост не найден' });
  }
  const [viewCounts, authorRow] = await Promise.all([getPostViewCounts(), getAuthorRow(post.author_id)]);
  res.json(serializePost(post, viewCounts[post.id], authorRow));
}));

// POST /api/posts — создать пост (только админ)
router.post('/', requireAuth, upload.any(), asyncHandler(async (req, res) => {
  const { title, excerpt } = req.body;

  if (!title || !excerpt) {
    return res.status(400).json({ error: 'Заполните заголовок и анонс поста' });
  }

  const { blocks, idToSrc } = buildBlocks(req.body.blocks, req.files);

  if (!blocks.length) {
    return res.status(400).json({ error: 'Добавьте хотя бы один абзац текста или фото' });
  }

  const previewImage = resolvePreviewImage({ files: req.files, body: req.body, idToSrc, finalBlocks: blocks });
  const tags = parseTags(req.body.tags);
  const customFonts = keepFontsUsedInBlocks(parseCustomFonts(req.body.customFonts), blocks);
  const { seoTitle, seoDescription, h1 } = buildSeoFields(req.body);

  const statusFields = buildStatusFields(req.body, null);
  if (statusFields.error) return res.status(400).json({ error: statusFields.error });

  const authorId = String(req.body.authorId || '').trim() || null;
  if (authorId && !(await get('SELECT 1 FROM authors WHERE id = ?', authorId))) {
    return res.status(400).json({ error: 'Выбранный автор не найден' });
  }

  const isTaken = async (s) => !!(await get('SELECT 1 FROM posts WHERE slug = ?', s));
  const slug = await resolveSlug({ title, requestedSlug: req.body.slug, isTaken });
  const id = await generateUniquePostId();
  const now = new Date().toISOString();

  await run(
    `INSERT INTO posts (id, title, slug, excerpt, content_blocks, preview_image, tags, custom_fonts, seo_title, seo_description, h1, status, published_at, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, title, slug, excerpt, JSON.stringify(blocks), previewImage, JSON.stringify(tags), JSON.stringify(customFonts),
    seoTitle, seoDescription, h1, statusFields.status, statusFields.publishedAt, authorId, now, now
  );

  const post = await get('SELECT * FROM posts WHERE id = ?', id);
  const authorRow = await getAuthorRow(post.author_id);
  res.status(201).json(serializePost(post, 0, authorRow));
}));

// PUT /api/posts/:id — редактировать пост (только админ)
router.put('/:id', requireAuth, upload.any(), asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пост не найден' });

  const { title, excerpt } = req.body;
  const now = new Date().toISOString();

  const { blocks, idToSrc } = buildBlocks(req.body.blocks, req.files);

  if (!blocks.length) {
    return res.status(400).json({ error: 'Добавьте хотя бы один абзац текста или фото' });
  }

  const previewImage = resolvePreviewImage({ files: req.files, body: req.body, idToSrc, finalBlocks: blocks });

  // Удаляем файлы старых изображений статьи, которых больше нет в новом наборе блоков
  let oldBlocks = [];
  try { oldBlocks = JSON.parse(existing.content_blocks || '[]'); } catch (e) { oldBlocks = []; }
  const oldSrcs = imageSrcsOf(oldBlocks);
  const newSrcs = new Set(imageSrcsOf(blocks));
  oldSrcs.filter((src) => !newSrcs.has(src)).forEach(removeUploadedFile);

  // Если старое превью было отдельно загруженным фото (не входит ни в старые,
  // ни в новые блоки статьи) и больше не используется — удаляем его файл
  const oldPreview = existing.preview_image;
  if (oldPreview && oldPreview !== previewImage && !newSrcs.has(oldPreview)) {
    removeUploadedFile(oldPreview);
  }

  const tags = req.body.tags !== undefined ? parseTags(req.body.tags) : JSON.parse(existing.tags || '[]');
  const customFonts =
    req.body.customFonts !== undefined
      ? keepFontsUsedInBlocks(parseCustomFonts(req.body.customFonts), blocks)
      : JSON.parse(existing.custom_fonts || '[]');

  // Удаляем файлы шрифтов, которые использовались раньше, но в новой версии
  // текста больше не встречаются.
  let oldFonts = [];
  try { oldFonts = JSON.parse(existing.custom_fonts || '[]'); } catch (e) { oldFonts = []; }
  const newFontFamilies = new Set(customFonts.map((f) => f.family));
  oldFonts.filter((f) => !newFontFamilies.has(f.family)).forEach((f) => removeUploadedFile(f.url));

  const { seoTitle, seoDescription, h1 } = buildSeoFields(req.body);

  const statusFields = buildStatusFields(req.body, existing);
  if (statusFields.error) return res.status(400).json({ error: statusFields.error });

  let authorId = existing.author_id;
  if (req.body.authorId !== undefined) {
    authorId = String(req.body.authorId || '').trim() || null;
    if (authorId && !(await get('SELECT 1 FROM authors WHERE id = ?', authorId))) {
      return res.status(400).json({ error: 'Выбранный автор не найден' });
    }
  }

  const isTaken = async (s) => !!(await get('SELECT 1 FROM posts WHERE slug = ? AND id != ?', s, req.params.id));
  const slug =
    req.body.slug !== undefined
      ? await resolveSlug({ title: title || existing.title, requestedSlug: req.body.slug, isTaken })
      : existing.slug;

  await run(
    `UPDATE posts SET title = ?, slug = ?, excerpt = ?, content_blocks = ?, preview_image = ?, tags = ?, custom_fonts = ?, seo_title = ?, seo_description = ?, h1 = ?, status = ?, published_at = ?, author_id = ?, updated_at = ?
     WHERE id = ?`,
    title || existing.title,
    slug,
    excerpt || existing.excerpt,
    JSON.stringify(blocks),
    previewImage,
    JSON.stringify(tags),
    JSON.stringify(customFonts),
    seoTitle,
    seoDescription,
    h1,
    statusFields.status,
    statusFields.publishedAt,
    authorId,
    now,
    req.params.id
  );

  const updated = await get('SELECT * FROM posts WHERE id = ?', req.params.id);
  const authorRow = await getAuthorRow(updated.author_id);
  res.json(serializePost(updated, 0, authorRow));
}));

// DELETE /api/posts/:id — удалить пост (только админ)
router.delete('/:id', requireAuth, asyncHandler(async (req, res) => {
  const existing = await get('SELECT * FROM posts WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Пост не найден' });

  let blocks = [];
  try { blocks = JSON.parse(existing.content_blocks || '[]'); } catch (e) { blocks = []; }
  const srcs = imageSrcsOf(blocks);
  srcs.forEach(removeUploadedFile);
  if (existing.preview_image && !srcs.includes(existing.preview_image)) {
    removeUploadedFile(existing.preview_image);
  }

  let fonts = [];
  try { fonts = JSON.parse(existing.custom_fonts || '[]'); } catch (e) { fonts = []; }
  fonts.forEach((f) => removeUploadedFile(f.url));

  await run('DELETE FROM posts WHERE id = ?', req.params.id);
  res.json({ ok: true });
}));

module.exports = router;