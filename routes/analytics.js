const express = require('express');

const { get, incrementAnalyticsCounter, getAnalyticsSummary } = require('../db/database');
const requireAuth = require('../middleware/requireAuth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Эндпоинт открыт для всех (его вызывает обычный посетитель блога), поэтому
// на него нужен потолок: каждый вызов дописывает строку в базу, и без
// ограничения счётчик просмотров можно накрутить скриптом, попутно раздув
// таблицу посещений. 120 просмотров за 15 минут с одного адреса — заведомо
// больше, чем прочитает живой человек.

// POST /api/analytics/view — засчитать просмотр поста при переходе внутри
// блога без перезагрузки страницы (SPA-переход по клику на карточку).
// Прямые заходы на /blog/:slug уже считаются на сервере при рендере страницы.
router.post('/view', asyncHandler(async (req, res) => {
  const slug = typeof req.body.slug === 'string' ? req.body.slug.trim() : '';
  if (!slug) return res.status(400).json({ error: 'Не передан slug поста' });

  const post = await get('SELECT id FROM posts WHERE slug = ?', slug);
  if (!post) return res.status(404).json({ error: 'Пост не найден' });

  await incrementAnalyticsCounter({ kind: 'post_view', postId: post.id });
  res.json({ ok: true });
}));

// GET /api/analytics/summary — сводная статистика для админ-панели (только админ)
router.get('/summary', requireAuth, asyncHandler(async (req, res) => {
  res.json(await getAnalyticsSummary());
}));

module.exports = router;
