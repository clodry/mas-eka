const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = path.resolve(process.argv[2] || '.env');
const re = /^SESSION_SECRET\s*=[^\r\n]*/m;
const source = fs.readFileSync(file, 'utf8');

if (!re.test(source)) {
  console.error('не найдена строка SESSION_SECRET');
  process.exit(1);
}

const fresh = crypto.randomBytes(32).toString('hex');
fs.writeFileSync(file, source.replace(re, 'SESSION_SECRET=' + fresh), 'utf8');
console.log('SESSION_SECRET заменён на новый (64 hex-символа) в ' + path.basename(file));
