require('dotenv').config();
const crypto = require('crypto');

const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 16) {
  console.error('Сначала задайте актуальный SESSION_SECRET в локальном .env.');
  process.exit(1);
}

const route = `/manage-${crypto.createHmac('sha256', secret).update('eka-admin-route-v1').digest('hex').slice(0, 32)}`;
const baseUrl = (process.env.SITE_URL || '').replace(/\/$/, '');
console.log(baseUrl ? `${baseUrl}${route}/login` : `${route}/login`);
