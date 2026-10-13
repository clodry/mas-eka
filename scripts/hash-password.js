// Генерирует bcrypt-хэш пароля для .env (ADMIN_PASSWORD_HASH)
// Использование: npm run hash-password -- "мойПароль123"
const bcrypt = require('bcryptjs');

const password = process.argv[2];

if (!password) {
  console.error('Укажите пароль: npm run hash-password -- "мойПароль123"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);
console.log('\nВставьте эту строку в .env как ADMIN_PASSWORD_HASH:\n');
console.log(hash);
console.log('');
