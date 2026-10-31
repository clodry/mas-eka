const express = require('express');
const fs = require('fs');
const path = require('path');

const { all, get, getSiteContent, logAnalyticsEvent, effectivePostStatus } = require('../db/database');
const { getSiteUrl, absoluteUrl } = require('../utils/siteUrl');
const { getOrSetVisitorId } = require('../utils/analytics');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const DEFAULT_OG_IMAGE = '/images/brand/hero-blueprint.jpg';
const SITE_NAME = 'Мастерская ЕКА';

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatDateRu(iso) {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function renderBlocksHtml(blocks) {
  if (!Array.isArray(blocks)) return '';
  return blocks
    .map((b) => {
      if (b.type === 'image' && b.src) {
        const caption = b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : '';
        return `<figure class="post-figure">
          <img src="${escapeHtml(b.src)}" alt="${escapeHtml(b.caption || '')}">
          ${caption}
        </figure>`;
      }
      if (b.type === 'paragraph' && (b.html || b.text)) {
        const content = b.html !== undefined ? b.html : escapeHtml(b.text);
        return `<p>${content}</p>`;
      }
      return '';
    })
    .join('');
}

function parsePostBlocks(row) {
  try {
    return JSON.parse(row.content_blocks || '[]');
  } catch (e) {
    return [];
  }
}

function parsePostTags(row) {
  try {
    return JSON.parse(row.tags || '[]');
  } catch (e) {
    return [];
  }
}

function renderFontFacesCss(customFonts) {
  return (Array.isArray(customFonts) ? customFonts : [])
    .map((f) => {
      const ext = (f.url || '').split('.').pop().toLowerCase();
      const format = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext] || 'truetype';
      return `@font-face { font-family: '${f.family}'; src: url('${escapeHtml(f.url)}') format('${format}'); font-display: swap; }`;
    })
    .join('\n');
}

function parsePostCustomFonts(row) {
  try {
    return JSON.parse(row.custom_fonts || '[]');
  } catch (e) {
    return [];
  }
}

function serializePostRow(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    blocks: parsePostBlocks(row),
    tags: parsePostTags(row),
    previewImage: row.preview_image,
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    h1: row.h1 || '',
    publishedAt: row.published_at || row.created_at,
    authorId: row.author_id || null,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function getAuthorRow(authorId) {
  if (!authorId) return null;
  return get('SELECT * FROM authors WHERE id = ?', authorId);
}

// Подставляет {{SITE_URL}} в статический HTML-шаблон абсолютным адресом сайта,
// вычисленным для текущего запроса (или взятым из SITE_URL в .env).
function renderStaticTemplate(req, res, filePath, extraTokens) {
  const html = fs.readFileSync(filePath, 'utf8');
  const tokens = { SITE_URL: getSiteUrl(req), ...(extraTokens || {}) };
  const replaced = html.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(tokens, key) ? tokens[key] : match
  );
  res.type('html').send(replaced);
}

function renderStatsHtml(stats) {
  return (stats || [])
    .map(
      (s) => `            <div class="stat reveal tilt" data-tilt-max="6">
              <div class="num"><span data-count="${escapeHtml(s.value)}" data-suffix="${escapeHtml(s.suffix || '')}">0</span></div>
              <div class="label">${escapeHtml(s.label)}</div>
            </div>`
    )
    .join('\n');
}

// Мета-теги подтверждения прав в Яндекс.Вебмастере и Google Search Console —
// значение сохраняется в настройках как просто код подтверждения (без
// разметки), сюда подставляется как content мета-тега.
function renderVerificationMetaHtml(content) {
  const a = (content && content.analytics) || {};
  const tags = [];
  if (a.yandexVerification) tags.push(`<meta name="yandex-verification" content="${escapeHtml(a.yandexVerification)}">`);
  if (a.googleVerification) tags.push(`<meta name="google-site-verification" content="${escapeHtml(a.googleVerification)}">`);
  return tags.join('\n');
}

// Готовый веб-код счётчиков (Яндекс.Метрика / Google Analytics) — вставляется
// в <head> как есть, ровно тем кодом, который админ скопировал из личного
// кабинета счётчика. Пусто, если поле не заполнено в настройках.
function renderAnalyticsHeadHtml(content) {
  const a = (content && content.analytics) || {};
  return [a.yandexMetrikaCode, a.googleAnalyticsCode].filter(Boolean).join('\n');
}

function renderValuesHtml(values) {
  return (values || [])
    .map(
      (v) => `          <div class="value-row">
            <div class="tag">${escapeHtml(v.tag)}</div>
            <div>
              <h3>${escapeHtml(v.title)}</h3>
              <p>${escapeHtml(v.text)}</p>
            </div>
          </div>`
    )
    .join('\n');
}

function parseJsonArray(raw) {
  try {
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) {
    return [];
  }
}

function serializeProjectRow(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    description: row.description || '',
    category: row.category || '',
    location: row.location || '',
    year: row.year || '',
    tags: parseJsonArray(row.tags),
    coverImage: row.cover_image,
    gallery: parseJsonArray(row.gallery),
    seoTitle: row.seo_title || '',
    seoDescription: row.seo_description || '',
    h1: row.h1 || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

// Описание проекта — обычный текст из textarea в админке (без rich-text,
// как в статьях блога): абзацы разделяются пустой строкой, перенос строки
// внутри абзаца — через <br>. Текст экранируется целиком.
function renderDescriptionHtml(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function renderGalleryHtml(gallery) {
  if (!Array.isArray(gallery) || !gallery.length) return '';
  return `<div class="project-gallery">${gallery
    .map((src) => `<figure class="post-figure"><img src="${escapeHtml(src)}" alt=""></figure>`)
    .join('')}</div>`;
}

function renderProjectMetaHtml(project) {
  const items = [project.category, project.location, project.year].filter(Boolean);
  return items.length ? `<div class="project-meta">${items.map((i) => `<span>${escapeHtml(i)}</span>`).join('')}</div>` : '';
}

// Главная страница — контент (герой/о нас/контакты) подтягивается из
// site_content в БД (редактируется в админке), плюс абсолютные canonical/og:*
router.get('/', asyncHandler(async (req, res) => {
  const content = await getSiteContent();
  renderStaticTemplate(req, res, path.join(__dirname, '../public/index.html'), {
    SEO_HOME_TITLE: escapeHtml(content.seo.home.title),
    SEO_HOME_DESCRIPTION: escapeHtml(content.seo.home.description),
    HERO_EYEBROW: escapeHtml(content.hero.eyebrow),
    HERO_LINE1: escapeHtml(content.hero.line1),
    HERO_LINE2: escapeHtml(content.hero.line2 === 'пространства' ? 'пространства,' : content.hero.line2),
    HERO_LINE3: escapeHtml(content.hero.line3),
    HERO_LEAD: escapeHtml(content.hero.lead),
    HERO_PHOTO: escapeHtml(content.hero.photo),
    HERO_PHOTO_ALT: escapeHtml(content.hero.photoAlt),
    ABOUT_EYEBROW: escapeHtml(content.about.eyebrow),
    ABOUT_TITLE: escapeHtml(content.about.title),
    ABOUT_DESC: escapeHtml(content.about.desc),
    ABOUT_P1: escapeHtml(content.about.p1),
    ABOUT_P2: escapeHtml(content.about.p2),
    STATS_HTML: renderStatsHtml(content.about.stats),
    VALUES_HTML: renderValuesHtml(content.about.values),
    FOOTER_TAGLINE: escapeHtml(content.contacts.tagline),
    FOOTER_PHONE: escapeHtml(content.contacts.phone),
    FOOTER_PHONE_HREF: escapeHtml(content.contacts.phone.replace(/[^\d+]/g, '')),
    FOOTER_EMAIL: escapeHtml(content.contacts.email),
    COPYRIGHT_YEAR: String(new Date().getFullYear()),
    VERIFICATION_META_HTML: renderVerificationMetaHtml(content),
    ANALYTICS_HEAD_HTML: renderAnalyticsHeadHtml(content)
  });
}));

// Старый адрес /index.html постоянно перенаправляем на чистый '/'
router.get('/index.html', (req, res) => res.redirect(301, '/'));

// Старые ссылки /blog.html?post=slug → /blog/slug;
// иначе отдаём список статей с абсолютными canonical/og:url/og:image
router.get('/blog', asyncHandler(async (req, res) => {
  const slug = req.query.post;
  if (slug && typeof slug === 'string') {
    return res.redirect(301, `/blog/${encodeURIComponent(slug)}`);
  }
  const content = await getSiteContent();
  renderStaticTemplate(req, res, path.join(__dirname, '../public/blog.html'), {
    SEO_BLOG_TITLE: escapeHtml(content.seo.blog.title),
    SEO_BLOG_DESCRIPTION: escapeHtml(content.seo.blog.description),
    SEO_BLOG_H1: escapeHtml(content.seo.blog.h1),
    FOOTER_TAGLINE: escapeHtml(content.contacts.tagline),
    FOOTER_PHONE: escapeHtml(content.contacts.phone),
    FOOTER_PHONE_HREF: escapeHtml(content.contacts.phone.replace(/[^\d+]/g, '')),
    FOOTER_EMAIL: escapeHtml(content.contacts.email),
    COPYRIGHT_YEAR: String(new Date().getFullYear()),
    VERIFICATION_META_HTML: renderVerificationMetaHtml(content),
    ANALYTICS_HEAD_HTML: renderAnalyticsHeadHtml(content)
  });
}));

// Старый адрес /blog.html постоянно перенаправляем на чистый /blog
// (старые ссылки вида ?post=slug ведут сразу на /blog/slug, минуя лишний редирект)
router.get('/blog.html', (req, res) => {
  const slug = req.query.post;
  if (slug && typeof slug === 'string') {
    return res.redirect(301, `/blog/${encodeURIComponent(slug)}`);
  }
  const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  res.redirect(301, `/blog${query}`);
});

// Список проектов портфолио — контент карточек подгружается на клиенте
// (public/js/portfolio.js), здесь только SEO-оболочка, как и у /blog.
router.get('/portfolio', asyncHandler(async (req, res) => {
  const content = await getSiteContent();
  renderStaticTemplate(req, res, path.join(__dirname, '../public/portfolio.html'), {
    SEO_PORTFOLIO_TITLE: escapeHtml(content.seo.portfolio.title),
    SEO_PORTFOLIO_DESCRIPTION: escapeHtml(content.seo.portfolio.description),
    SEO_PORTFOLIO_H1: escapeHtml(content.seo.portfolio.h1),
    FOOTER_TAGLINE: escapeHtml(content.contacts.tagline),
    FOOTER_PHONE: escapeHtml(content.contacts.phone),
    FOOTER_PHONE_HREF: escapeHtml(content.contacts.phone.replace(/[^\d+]/g, '')),
    FOOTER_EMAIL: escapeHtml(content.contacts.email),
    COPYRIGHT_YEAR: String(new Date().getFullYear()),
    VERIFICATION_META_HTML: renderVerificationMetaHtml(content),
    ANALYTICS_HEAD_HTML: renderAnalyticsHeadHtml(content)
  });
}));

// Текст robots.txt редактируется в админке («Настройки сайта») и хранится в БД.
// Строку Sitemap всегда подставляем сами (с актуальным адресом сайта для
// текущего запроса) — чтобы админ не мог случайно испортить или забыть её,
// даже если он полностью переписал остальной текст.
router.get('/robots.txt', asyncHandler(async (req, res) => {
  const base = getSiteUrl(req);
  const content = await getSiteContent();
  const body = String(content.seo.robotsTxt || '').replace(/\r\n/g, '\n').trim();
  const withoutSitemap = body
    .split('\n')
    .filter((line) => !/^sitemap:/i.test(line.trim()))
    .join('\n')
    .trim();

  res.type('text/plain').send(`${withoutSitemap}\n\nSitemap: ${base}/sitemap.xml\n`);
}));

router.get('/sitemap.xml', asyncHandler(async (req, res) => {
  const base = getSiteUrl(req);
  // Черновики и ещё не наступившие отложенные публикации в sitemap не попадают.
  const allPosts = await all('SELECT slug, status, published_at, updated_at, preview_image FROM posts ORDER BY created_at DESC');
  const posts = allPosts.filter((p) => effectivePostStatus(p) === 'published');
  const authors = await all('SELECT slug, updated_at FROM authors ORDER BY created_at ASC');
  const allProjects = await all(`SELECT slug, status, updated_at, cover_image FROM portfolio_projects ORDER BY created_at DESC`);
  const projects = allProjects.filter((p) => p.status === 'published');

  // Свежесть главной/списка блога привязываем к последней опубликованной
  // (обновлённой) статье — так поисковики видят, что раздел живой.
  const latestUpdate = posts.length
    ? posts.reduce((max, p) => (p.updated_at > max ? p.updated_at : max), posts[0].updated_at)
    : null;
  const latestDate = latestUpdate ? latestUpdate.split('T')[0] : null;

  const urls = [
    { loc: `${base}/`, lastmod: latestDate, changefreq: 'monthly', priority: '1.0' },
    { loc: `${base}/blog`, lastmod: latestDate, changefreq: 'weekly', priority: '0.8' },
    { loc: `${base}/portfolio`, changefreq: 'weekly', priority: '0.8' },
    ...projects.map((p) => ({
      loc: `${base}/portfolio/${p.slug}`,
      lastmod: p.updated_at.split('T')[0],
      changefreq: 'monthly',
      priority: '0.6',
      image: p.cover_image ? absoluteUrl(req, p.cover_image) : null
    })),
    ...posts.map((p) => ({
      loc: `${base}/blog/${p.slug}`,
      lastmod: p.updated_at.split('T')[0],
      changefreq: 'monthly',
      priority: '0.6',
      image: p.preview_image ? absoluteUrl(req, p.preview_image) : null
    })),
    // Мини-профили авторов — тоже реальные индексируемые страницы, они
    // подтверждают поисковикам, что у статей есть настоящие авторы (E-E-A-T).
    ...authors.map((a) => ({
      loc: `${base}/author/${a.slug}`,
      lastmod: a.updated_at.split('T')[0],
      changefreq: 'monthly',
      priority: '0.4'
    }))
  ];

  const body = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>${u.image ? `\n    <image:image>\n      <image:loc>${escapeXml(u.image)}</image:loc>\n    </image:image>` : ''}
  </url>`
    )
    .join('\n');

  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${body}
</urlset>`);
}));

router.get('/blog/:slug', asyncHandler(async (req, res) => {
  const row = await get('SELECT * FROM posts WHERE slug = ?', req.params.slug);
  // Черновики и ещё не наступившие отложенные публикации отдаём как 404 —
  // их адрес не должен быть доступен посторонним до реальной публикации.
  if (!row || effectivePostStatus(row) !== 'published') {
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }

  const post = serializePostRow(row);
  const authorRow = await getAuthorRow(row.author_id);

  // Прямой заход на страницу поста (переход по ссылке, обновление страницы,
  // поисковик) — считаем просмотром поста. Переходы по клику внутри блога
  // (без перезагрузки) считаются отдельно на клиенте через /api/analytics/view.
  try {
    const visitorId = getOrSetVisitorId(req, res);
    await logAnalyticsEvent({ type: 'post_view', postId: row.id, path: `/blog/${row.slug}`, visitorId });
  } catch (e) {
    console.error('analytics track error:', e.message);
  }

  const content = await getSiteContent();
  const blogH1 = escapeHtml(content.seo.blog.h1);
  const verificationMetaHtml = renderVerificationMetaHtml(content);
  const analyticsHeadHtml = renderAnalyticsHeadHtml(content);
  const pageUrl = absoluteUrl(req, `/blog/${post.slug}`);
  const ogImage = absoluteUrl(req, post.previewImage || DEFAULT_OG_IMAGE);
  // SEO title/description/H1 — необязательные переопределения из админки;
  // если не заданы, используем обычные заголовок и анонс поста.
  const seoTitleRaw = post.seoTitle || post.title;
  const seoDescriptionRaw = post.seoDescription || post.excerpt;
  const h1Raw = post.h1 || post.title;
  const description = escapeHtml(seoDescriptionRaw);
  const title = escapeHtml(seoTitleRaw);
  const h1 = escapeHtml(h1Raw);
  const articleHtml = renderBlocksHtml(post.blocks);

  // E-E-A-T: если у статьи выбран реальный автор — указываем его как Person
  // со ссылкой на мини-профиль (url), а не безликую организацию. Поисковики
  // лучше доверяют статьям с подтверждённым автором.
  const authorUrl = authorRow ? absoluteUrl(req, `/author/${authorRow.slug}`) : null;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: h1Raw,
    description: seoDescriptionRaw,
    datePublished: post.publishedAt,
    dateModified: post.updated_at,
    image: ogImage,
    author: authorRow
      ? { '@type': 'Person', name: authorRow.name, url: authorUrl, ...(authorRow.role ? { jobTitle: authorRow.role } : {}) }
      : { '@type': 'Organization', name: SITE_NAME },
    publisher: { '@type': 'Organization', name: SITE_NAME },
    mainEntityOfPage: pageUrl,
    ...(post.tags.length ? { keywords: post.tags.join(', ') } : {})
  };

  const authorHtml = authorRow
    ? `<a class="post-author" href="/author/${escapeHtml(authorRow.slug)}">
        ${authorRow.photo ? `<img class="post-author-photo" src="${escapeHtml(authorRow.photo)}" alt="${escapeHtml(authorRow.name)}">` : ''}
        <span class="post-author-info"><span class="post-author-name">${escapeHtml(authorRow.name)}</span>${authorRow.role ? `<span class="post-author-role">${escapeHtml(authorRow.role)}</span>` : ''}</span>
      </a>`
    : '';

  const tagsHtml = post.tags.length
    ? `<div class="post-tags">${post.tags
        .map((t) => `<a class="post-tag" href="/blog?tag=${encodeURIComponent(t)}">${escapeHtml(t)}</a>`)
        .join('')}</div>`
    : '';

  const blogCss = fs.readFileSync(path.join(__dirname, '../public/blog.html'), 'utf8');
  const styleMatch = blogCss.match(/<style>([\s\S]*?)<\/style>/);
  const inlineStyles = styleMatch ? styleMatch[1] : '';
  const fontFacesCss = renderFontFacesCss(parsePostCustomFonts(row));

  res.type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${SITE_NAME}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:locale" content="ru_RU">
<meta property="article:published_time" content="${post.publishedAt}">
<meta property="article:modified_time" content="${post.updated_at}">
${authorRow ? `<meta property="article:author" content="${escapeHtml(absoluteUrl(req, `/author/${authorRow.slug}`))}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<link rel="icon" href="/images/brand/favicon-96x96.png">
<link rel="stylesheet" href="/css/style.css">
${verificationMetaHtml}
${analyticsHeadHtml}
<style>${inlineStyles}</style>
${fontFacesCss ? `<style>${fontFacesCss}</style>` : ''}
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>

<header class="navbar">
  <div class="wrap">
    <a href="/" class="brand" aria-label="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА» — на главную">
      <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»" width="89" height="34">
    </a>
    <button class="nav-toggle" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="primary-navigation">
      <span></span><span></span>
    </button>
    <nav class="nav-links" id="primary-navigation" aria-label="Основная навигация">
      <a href="/">Главная</a>
      <a href="/portfolio">Портфолио</a>
      <a href="/blog">Блог</a>
      <a href="/#about">О нас</a>
    </nav>
  </div>
</header>

<main>
  <div id="blogList" class="blog-list hidden">
    <section class="blog-hero">
      <div class="wrap"><h1>${blogH1}</h1></div>
    </section>
  </div>

  <div id="postView" class="post-full active">
    <div class="wrap">
      <a href="/blog" id="backToList" class="back-link">← Все статьи</a>
      <article id="postContent">
        <span class="date">${formatDateRu(post.publishedAt)}</span>
        <h1>${h1}</h1>
        ${authorHtml}
        ${tagsHtml}
        <div class="content">${articleHtml}</div>
      </article>
    </div>
  </div>
</main>

<footer>
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="brand">
          <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="ЕКА" width="89" height="34">
          <div class="brand-name">${SITE_NAME}</div>
        </div>
        <p class="brand-descriptor">Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»</p>
        <p>${escapeHtml(content.contacts.tagline)}</p>
      </div>
      <div class="footer-col">
        <h4>Контакты</h4>
        <a href="tel:${escapeHtml(content.contacts.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(content.contacts.phone)}</a>
        <a href="mailto:${escapeHtml(content.contacts.email)}">${escapeHtml(content.contacts.email)}</a>
      </div>
      <div class="footer-col">
        <h4>Разделы</h4>
        <a href="/">Главная</a>
        <a href="/portfolio">Портфолио</a>
        <a href="/blog">Блог</a>
        <a href="/#about">О нас</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${SITE_NAME}</span>
      <span style="color:var(--text-faint)">ООО «МППДА "ЕКА"» · ИНН 6449109445 · ОГРН 1246400012726</span>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
<script src="/js/blog.js"></script>
</body>
</html>`);
}));

// GET /portfolio/:slug — страница одного проекта. По структуре близко к
// /blog/:slug (SEO-теги, JSON-LD, стили из portfolio.html), но без авторского
// блока/тегов блога — вместо них строка категория/локация/год и галерея.
router.get('/portfolio/:slug', asyncHandler(async (req, res) => {
  const row = await get('SELECT * FROM portfolio_projects WHERE slug = ?', req.params.slug);
  if (!row || row.status !== 'published') {
    return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
  }

  const project = serializeProjectRow(row);
  const content = await getSiteContent();
  const portfolioH1 = escapeHtml(content.seo.portfolio.h1);
  const verificationMetaHtml = renderVerificationMetaHtml(content);
  const analyticsHeadHtml = renderAnalyticsHeadHtml(content);
  const pageUrl = absoluteUrl(req, `/portfolio/${project.slug}`);
  const ogImage = absoluteUrl(req, project.coverImage || DEFAULT_OG_IMAGE);

  const seoTitleRaw = project.seoTitle || project.title;
  const seoDescriptionRaw = project.seoDescription || project.excerpt;
  const h1Raw = project.h1 || project.title;
  const description = escapeHtml(seoDescriptionRaw);
  const title = escapeHtml(seoTitleRaw);
  const h1 = escapeHtml(h1Raw);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: h1Raw,
    description: seoDescriptionRaw,
    image: ogImage,
    dateCreated: project.created_at,
    dateModified: project.updated_at,
    creator: { '@type': 'Organization', name: SITE_NAME },
    url: pageUrl,
    ...(project.location ? { locationCreated: project.location } : {}),
    ...(project.tags.length ? { keywords: project.tags.join(', ') } : {})
  };

  const portfolioCss = fs.readFileSync(path.join(__dirname, '../public/portfolio.html'), 'utf8');
  const styleMatch = portfolioCss.match(/<style>([\s\S]*?)<\/style>/);
  const inlineStyles = styleMatch ? styleMatch[1] : '';

  res.type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${SITE_NAME}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:locale" content="ru_RU">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
<link rel="icon" href="/images/brand/favicon-96x96.png">
<link rel="stylesheet" href="/css/style.css">
${verificationMetaHtml}
${analyticsHeadHtml}
<style>${inlineStyles}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>

<header class="navbar">
  <div class="wrap">
    <a href="/" class="brand" aria-label="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА» — на главную">
      <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»" width="89" height="34">
    </a>
    <button class="nav-toggle" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="primary-navigation">
      <span></span><span></span>
    </button>
    <nav class="nav-links" id="primary-navigation" aria-label="Основная навигация">
      <a href="/">Главная</a>
      <a href="/portfolio">Портфолио</a>
      <a href="/blog">Блог</a>
      <a href="/#about">О нас</a>
    </nav>
  </div>
</header>

<main>
  <div id="portfolioList" class="portfolio-list hidden">
    <section class="blog-hero">
      <div class="wrap"><h1>${portfolioH1}</h1></div>
    </section>
  </div>

  <div id="projectView" class="post-full active">
    <div class="wrap">
      <a href="/portfolio" id="backToList" class="back-link">← Все проекты</a>
      <article id="projectContent">
        <h1>${h1}</h1>
        ${renderProjectMetaHtml(project)}
        ${project.coverImage ? `<figure class="post-figure project-cover"><img src="${escapeHtml(project.coverImage)}" alt=""></figure>` : ''}
        <div class="content">${renderDescriptionHtml(project.description)}</div>
        ${renderGalleryHtml(project.gallery)}
      </article>
    </div>
  </div>
</main>

<footer>
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="brand">
          <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="ЕКА" width="89" height="34">
          <div class="brand-name">${SITE_NAME}</div>
        </div>
        <p class="brand-descriptor">Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»</p>
        <p>${escapeHtml(content.contacts.tagline)}</p>
      </div>
      <div class="footer-col">
        <h4>Контакты</h4>
        <a href="tel:${escapeHtml(content.contacts.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(content.contacts.phone)}</a>
        <a href="mailto:${escapeHtml(content.contacts.email)}">${escapeHtml(content.contacts.email)}</a>
      </div>
      <div class="footer-col">
        <h4>Разделы</h4>
        <a href="/">Главная</a>
        <a href="/portfolio">Портфолио</a>
        <a href="/blog">Блог</a>
        <a href="/#about">О нас</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${SITE_NAME}</span>
      <span style="color:var(--text-faint)">ООО «МППДА "ЕКА"» · ИНН 6449109445 · ОГРН 1246400012726</span>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
<script src="/js/portfolio.js"></script>
</body>
</html>`);
}));

// GET /author/:slug — мини-профиль автора: роль/квалификация, био, ссылка-
// подтверждение (соцсеть/профиль) и список его опубликованных статей.
// Это отдельная индексируемая страница — конкретное подтверждение E-E-A-T
// («экспертность» и «доверие»), на которую можно сослаться со страницы статьи.
router.get('/author/:slug', asyncHandler(async (req, res) => {
  const author = await get('SELECT * FROM authors WHERE slug = ?', req.params.slug);
  if (!author) return res.status(404).sendFile(path.join(__dirname, '../public/404.html'));

  const allAuthorPosts = await all('SELECT * FROM posts WHERE author_id = ? ORDER BY COALESCE(published_at, created_at) DESC', author.id);
  const posts = allAuthorPosts
    .filter((p) => effectivePostStatus(p) === 'published')
    .map(serializePostRow);

  const content = await getSiteContent();
  const verificationMetaHtml = renderVerificationMetaHtml(content);
  const analyticsHeadHtml = renderAnalyticsHeadHtml(content);
  const pageUrl = absoluteUrl(req, `/author/${author.slug}`);
  const title = escapeHtml(`${author.name}${author.role ? ` — ${author.role}` : ''}`);
  const descriptionRaw = author.bio
    ? author.bio
    : `Автор статей блога ${SITE_NAME}${author.role ? `: ${author.role}` : ''}.`;
  const description = escapeHtml(descriptionRaw.slice(0, 200));
  const authorPhoto = absoluteUrl(req, author.photo || DEFAULT_OG_IMAGE);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    mainEntity: {
      '@type': 'Person',
      name: author.name,
      url: pageUrl,
      image: authorPhoto,
      ...(author.role ? { jobTitle: author.role } : {}),
      ...(author.bio ? { description: author.bio } : {}),
      ...(author.social_url ? { sameAs: [author.social_url] } : {}),
      worksFor: { '@type': 'Organization', name: SITE_NAME }
    }
  };

  const postsHtml = posts.length
    ? posts
        .map(
          (p) => `
    <article class="post-card">
      <a href="/blog/${escapeHtml(p.slug)}" class="post-link">
        <div class="thumb">${p.previewImage ? `<img src="${escapeHtml(p.previewImage)}" alt="" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
        <div class="body">
          <span class="date">${formatDateRu(p.publishedAt)}</span>
          <h3>${escapeHtml(p.title)}</h3>
          <p>${escapeHtml(p.excerpt)}</p>
          <span class="read-more">Читать далее →</span>
        </div>
      </a>
    </article>`
        )
        .join('')
    : '<p style="color:var(--text-muted)">У этого автора пока нет опубликованных статей.</p>';

  const blogCss = fs.readFileSync(path.join(__dirname, '../public/blog.html'), 'utf8');
  const styleMatch = blogCss.match(/<style>([\s\S]*?)<\/style>/);
  const inlineStyles = styleMatch ? styleMatch[1] : '';

  res.type('html').send(`<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${SITE_NAME}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${escapeHtml(pageUrl)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="${escapeHtml(pageUrl)}">
<meta property="og:image" content="${escapeHtml(authorPhoto)}">
<meta property="og:locale" content="ru_RU">
<link rel="icon" href="/images/brand/favicon-96x96.png">
<link rel="stylesheet" href="/css/style.css">
${verificationMetaHtml}
${analyticsHeadHtml}
<style>${inlineStyles}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>

<header class="navbar">
  <div class="wrap">
    <a href="/" class="brand" aria-label="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА» — на главную">
      <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»" width="89" height="34">
    </a>
    <button class="nav-toggle" type="button" aria-label="Открыть меню" aria-expanded="false" aria-controls="primary-navigation">
      <span></span><span></span>
    </button>
    <nav class="nav-links" id="primary-navigation" aria-label="Основная навигация">
      <a href="/">Главная</a>
      <a href="/portfolio">Портфолио</a>
      <a href="/blog">Блог</a>
      <a href="/#about">О нас</a>
    </nav>
  </div>
</header>

<main>
  <section class="author-hero">
    <div class="wrap" style="display:flex; align-items:center; gap:24px; flex-wrap:wrap;">
      ${author.photo ? `<img class="author-hero-photo" src="${escapeHtml(author.photo)}" alt="${escapeHtml(author.name)}">` : ''}
      <div>
        ${author.role ? `<div class="role">${escapeHtml(author.role)}</div>` : ''}
        <h1>${escapeHtml(author.name)}</h1>
        ${author.bio ? `<p class="author-bio">${escapeHtml(author.bio)}</p>` : ''}
        ${author.social_url ? `<a class="author-social" href="${escapeHtml(author.social_url)}" target="_blank" rel="noopener noreferrer">Профиль автора ↗</a>` : ''}
      </div>
    </div>
  </section>
  <section>
    <div class="wrap">
      <p class="author-posts-head">Статьи автора</p>
      <div class="blog-grid">${postsHtml}</div>
    </div>
  </section>
</main>

<footer>
  <div class="wrap">
    <div class="footer-grid">
      <div class="footer-brand">
        <div class="brand">
          <img class="brand-logo" src="/images/brand/logo-mark-blue.png" alt="ЕКА" width="89" height="34">
          <div class="brand-name">${SITE_NAME}</div>
        </div>
        <p class="brand-descriptor">Мастерская пространственного планирования, дизайна и архитектуры «ЕКА»</p>
        <p>${escapeHtml(content.contacts.tagline)}</p>
      </div>
      <div class="footer-col">
        <h4>Контакты</h4>
        <a href="tel:${escapeHtml(content.contacts.phone.replace(/[^\d+]/g, ''))}">${escapeHtml(content.contacts.phone)}</a>
        <a href="mailto:${escapeHtml(content.contacts.email)}">${escapeHtml(content.contacts.email)}</a>
      </div>
      <div class="footer-col">
        <h4>Разделы</h4>
        <a href="/">Главная</a>
        <a href="/portfolio">Портфолио</a>
        <a href="/blog">Блог</a>
        <a href="/#about">О нас</a>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} ${SITE_NAME}</span>
      <span style="color:var(--text-faint)">ООО «МППДА "ЕКА"» · ИНН 6449109445 · ОГРН 1246400012726</span>
    </div>
  </div>
</footer>

<script src="/js/main.js"></script>
</body>
</html>`);
}));

module.exports = router;
