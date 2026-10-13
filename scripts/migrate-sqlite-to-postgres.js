/**
 * Разовый перенос данных из старой SQLite-базы (db/data.sqlite) в PostgreSQL.
 *
 * Нужен только один раз, при переходе на Postgres — если у вас уже были
 * реальные посты/авторы/статистика в db/data.sqlite. На пустом/новом проекте
 * этот скрипт не нужен: Postgres сам засеется демо-постами при первом
 * запуске сервера.
 *
 * Важно: этот скрипт требует временно установленного better-sqlite3
 * (его больше нет в package.json, т.к. проект переехал на Postgres).
 * Использование:
 *
 *   npm install better-sqlite3 --no-save
 *   DATABASE_URL=postgresql://... node scripts/migrate-sqlite-to-postgres.js /путь/к/db/data.sqlite
 *   npm uninstall better-sqlite3
 *
 * Скрипт идемпотентен в разумных пределах: при повторном запуске строки
 * с уже существующим id/slug будут пропущены (ON CONFLICT DO NOTHING),
 * а не задублируются.
 */

require('dotenv').config();
const path = require('path');
const { Pool } = require('pg');

const sqlitePath = process.argv[2] || path.join(__dirname, '../db/data.sqlite');

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error(
    'better-sqlite3 не установлен. Выполните:\n  npm install better-sqlite3 --no-save\nи запустите скрипт снова.'
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('Не задан DATABASE_URL — укажите строку подключения к Postgres в .env или в переменной окружения.');
  process.exit(1);
}

async function main() {
  const sqlite = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_SSL === 'require' ? { rejectUnauthorized: false } : undefined
  });

  // Схема в Postgres уже должна существовать — запустите `node server.js`
  // хотя бы раз (он создаёт таблицы автоматически) перед миграцией данных,
  // либо выполните initDb() из db/database.js отдельно.

  console.log(`Источник: ${sqlitePath}`);

  const authors = sqlite.prepare('SELECT * FROM authors').all();
  let authorsCopied = 0;
  for (const a of authors) {
    const res = await pool.query(
      `INSERT INTO authors (id, name, slug, role, bio, photo, social_url, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO NOTHING`,
      [a.id, a.name, a.slug, a.role, a.bio, a.photo, a.social_url, a.created_at, a.updated_at]
    );
    authorsCopied += res.rowCount;
  }
  console.log(`Авторы: перенесено ${authorsCopied} из ${authors.length}`);

  const posts = sqlite.prepare('SELECT * FROM posts').all();
  let postsCopied = 0;
  for (const p of posts) {
    const res = await pool.query(
      `INSERT INTO posts (id, title, slug, excerpt, content_blocks, preview_image, tags, custom_fonts, seo_title, seo_description, h1, status, published_at, author_id, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING`,
      [
        p.id, p.title, p.slug, p.excerpt, p.content_blocks, p.preview_image,
        p.tags, p.custom_fonts, p.seo_title, p.seo_description, p.h1,
        p.status, p.published_at, p.author_id, p.created_at, p.updated_at
      ]
    );
    postsCopied += res.rowCount;
  }
  console.log(`Посты: перенесено ${postsCopied} из ${posts.length}`);

  const events = sqlite.prepare('SELECT * FROM analytics_events').all();
  let eventsCopied = 0;
  for (const ev of events) {
    const res = await pool.query(
      `INSERT INTO analytics_events (type, post_id, path, visitor_id, created_at) VALUES ($1,$2,$3,$4,$5)`,
      [ev.type, ev.post_id, ev.path, ev.visitor_id, ev.created_at]
    );
    eventsCopied += res.rowCount;
  }
  console.log(`События аналитики: перенесено ${eventsCopied} из ${events.length}`);

  const siteContent = sqlite.prepare('SELECT * FROM site_content WHERE id = 1').get();
  if (siteContent) {
    await pool.query(
      `UPDATE site_content SET data = $1, updated_at = $2 WHERE id = 1`,
      [siteContent.data, siteContent.updated_at]
    );
    console.log('Контент главной страницы (site_content): перенесён');
  }

  await pool.end();
  sqlite.close();
  console.log('\nГотово. Проверьте данные, затем можно удалить db/data.sqlite* и выполнить `npm uninstall better-sqlite3`.');
}

main().catch((err) => {
  console.error('Ошибка миграции:', err);
  process.exit(1);
});
