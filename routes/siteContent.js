const express = require('express');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');

const { getSiteContent, saveSiteContent } = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../utils/asyncHandler');
const { ensureUploadDirs, imageStorage, imageFileFilter, removeUploadedFile } = require('../utils/uploads');

const router = express.Router();

ensureUploadDirs();

const upload = multer({
  storage: multer.diskStorage(imageStorage()),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: imageFileFilter
});

// Все текстовые поля пропускаем через sanitize-html с пустым списком
// разрешённых тегов — это просто текст, HTML тут не нужен и небезопасен.
function plainText(value, fallback = '') {
  if (value === undefined || value === null) return fallback;
  return sanitizeHtml(String(value), { allowedTags: [], allowedAttributes: {} }).trim();
}

function toNumber(value, fallback = 0) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}

// Код счётчиков (Яндекс.Метрика / Google Analytics) — это готовый веб-код
// со <script> внутри, который админ копирует прямо из личного кабинета
// счётчика. sanitizeHtml тут не подходит (вырежет <script>), поэтому просто
// обрезаем длину и пробелы по краям — поле доступно только через
// requireAuth, доверяем содержимому так же, как HTML-блокам статей.
function codeSnippet(value, fallback, maxLength) {
  if (value === undefined) return fallback;
  return String(value).trim().slice(0, maxLength);
}

// Разбирает JSON-массив статистик/ценностей из формы админки; при ошибке
// парсинга или отсутствии поля возвращает undefined — тогда mergeContent
// в db/database.js подставит текущее сохранённое/дефолтное значение.
function parseJsonArray(raw) {
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch (e) {
    return undefined;
  }
}

// GET /api/site-content — публично, отдаёт текущий контент главной страницы
// (используется формой настроек в админке для предзаполнения полей)
router.get('/', asyncHandler(async (req, res) => {
  res.json(await getSiteContent());
}));

// PUT /api/site-content — обновить контент главной страницы (только админ)
router.put('/', requireAuth, upload.single('heroPhoto'), asyncHandler(async (req, res) => {
  const body = req.body || {};
  const current = await getSiteContent();

  const stats = parseJsonArray(body.stats);
  const values = parseJsonArray(body.values);

  const next = {
    hero: {
      eyebrow: plainText(body.heroEyebrow, current.hero.eyebrow),
      line1: plainText(body.heroLine1, current.hero.line1),
      line2: plainText(body.heroLine2, current.hero.line2),
      line3: plainText(body.heroLine3, current.hero.line3),
      lead: plainText(body.heroLead, current.hero.lead),
      photo: req.file ? `/uploads/${req.file.filename}` : current.hero.photo,
      photoAlt: plainText(body.heroPhotoAlt, current.hero.photoAlt)
    },
    about: {
      eyebrow: plainText(body.aboutEyebrow, current.about.eyebrow),
      title: plainText(body.aboutTitle, current.about.title),
      desc: plainText(body.aboutDesc, current.about.desc),
      p1: plainText(body.aboutP1, current.about.p1),
      p2: plainText(body.aboutP2, current.about.p2),
      stats: (stats || current.about.stats)
        .slice(0, 8)
        .map((s) => ({
          value: toNumber(s.value, 0),
          suffix: plainText(s.suffix, '').slice(0, 4),
          label: plainText(s.label, '').slice(0, 60)
        }))
        .filter((s) => s.label),
      values: (values || current.about.values)
        .slice(0, 6)
        .map((v) => ({
          tag: plainText(v.tag, '').slice(0, 24).toUpperCase(),
          title: plainText(v.title, '').slice(0, 80),
          text: plainText(v.text, '').slice(0, 200)
        }))
        .filter((v) => v.title)
    },
    contacts: {
      tagline: plainText(body.contactsTagline, current.contacts.tagline),
      phone: plainText(body.contactsPhone, current.contacts.phone),
      email: plainText(body.contactsEmail, current.contacts.email),
      address: plainText(body.contactsAddress, current.contacts.address)
    },
    seo: {
      home: {
        title: plainText(body.seoHomeTitle, current.seo.home.title).slice(0, 70),
        description: plainText(body.seoHomeDescription, current.seo.home.description).slice(0, 200)
      },
      blog: {
        title: plainText(body.seoBlogTitle, current.seo.blog.title).slice(0, 70),
        description: plainText(body.seoBlogDescription, current.seo.blog.description).slice(0, 200),
        h1: plainText(body.seoBlogH1, current.seo.blog.h1).slice(0, 150)
      },
      // robots.txt редактируется как многострочный текст — plainText не годится
      // (строки с переносами), поэтому только вырезаем опасные HTML-теги/скрипты.
      robotsTxt: sanitizeHtml(String(body.seoRobotsTxt !== undefined ? body.seoRobotsTxt : current.seo.robotsTxt), {
        allowedTags: [],
        allowedAttributes: {}
      }).slice(0, 4000)
    },
    analytics: {
      yandexMetrikaCode: codeSnippet(body.analyticsYandexMetrika, current.analytics.yandexMetrikaCode, 6000),
      googleAnalyticsCode: codeSnippet(body.analyticsGoogleAnalytics, current.analytics.googleAnalyticsCode, 6000),
      yandexVerification: plainText(body.analyticsYandexVerification, current.analytics.yandexVerification).slice(0, 200),
      googleVerification: plainText(body.analyticsGoogleVerification, current.analytics.googleVerification).slice(0, 200)
    }
  };

  // Если загружено новое фото героя — старое (если это был файл из /uploads,
  // а не картинка по умолчанию) больше не используется где-либо ещё, поэтому
  // безопасно удаляем его с диска.
  if (req.file) {
    removeUploadedFile(current.hero.photo);
  }

  const saved = await saveSiteContent(next);
  res.json(saved);
}));

module.exports = router;
