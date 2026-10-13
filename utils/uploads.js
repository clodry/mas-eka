// Единое место, где описано всё, что связано с файлами в public/uploads:
// какие расширения вообще разрешено класть на диск, как назвать сохраняемый
// файл и как безопасно удалить файл по ссылке вида «/uploads/...».
// Раньше это было продублировано в трёх роутерах — с разными проверками.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const FONTS_DIR = path.join(UPLOADS_DIR, 'fonts');

// Список расширений намеренно узкий. Проверять один только MIME-тип нельзя:
// его присылает клиент, и файл «evil.html» с заголовком image/png раньше
// сохранялся как .html и отдавался статикой из /uploads/ как обычная
// страница — то есть становился хранимой XSS на нашем же домене. .svg по
// той же причине не разрешён: браузер исполняет скрипты внутри него.
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];

// Символы, которых не бывает в ссылке на наш файл, — заданы кодами, чтобы
// не путаться в экранировании (см. resolveUploadPath).
const NUL = String.fromCharCode(0);
const BACKSLASH = String.fromCharCode(92);

// Ошибка, текст которой можно показать пользователю (в отличие от внутренних
// ошибок сервера, которые наружу отдаются обезличенно) — см. обработчик
// ошибок в server.js.
function badRequest(message) {
  const err = new Error(message);
  err.status = 400;
  err.expose = true;
  return err;
}

function ensureUploadDirs() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.mkdirSync(FONTS_DIR, { recursive: true });
}

// Имя файла придумываем сами и расширение берём только из белого списка —
// в имя, пришедшее от клиента, попадать нечему.
function makeUploadFilename(originalname, allowedExtensions) {
  const ext = path.extname(String(originalname || '')).toLowerCase();
  const safeExt = allowedExtensions.includes(ext) ? ext : allowedExtensions[0];
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safeExt}`;
}

function imageFileFilter(req, file, cb) {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (!/^image\//.test(file.mimetype) || !IMAGE_EXTENSIONS.includes(ext)) {
    return cb(badRequest(`Разрешены только изображения: ${IMAGE_EXTENSIONS.join(', ')}`));
  }
  cb(null, true);
}

function fontFileFilter(req, file, cb) {
  const ext = path.extname(String(file.originalname || '')).toLowerCase();
  if (!FONT_EXTENSIONS.includes(ext)) {
    return cb(badRequest(`Разрешены только файлы шрифтов: ${FONT_EXTENSIONS.join(', ')}`));
  }
  cb(null, true);
}

// Хранилище multer для картинок и для шрифтов — с безопасным именем файла.
function imageStorage() {
  return {
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, makeUploadFilename(file.originalname, IMAGE_EXTENSIONS))
  };
}

function fontStorage() {
  return {
    destination: (req, file, cb) => cb(null, FONTS_DIR),
    filename: (req, file, cb) => cb(null, makeUploadFilename(file.originalname, FONT_EXTENSIONS))
  };
}

// Превращает ссылку «/uploads/...» в абсолютный путь на диске — или в null,
// если ссылка выводит за пределы папки загрузок. Проверки одного лишь
// startsWith('/uploads/') недостаточно: строка '/uploads/../../server.js'
// её проходила, а path.join после этого указывал уже наружу — то есть
// удалением поста можно было стереть произвольный файл проекта.
function resolveUploadPath(src) {
  if (typeof src !== 'string' || !src.startsWith('/uploads/')) return null;

  let decoded;
  try {
    decoded = decodeURIComponent(src);
  } catch (e) {
    return null;
  }
  // Нулевой байт обрывает путь на уровне файловой системы, обратный слэш на
  // Windows работает как разделитель каталогов — ни того, ни другого в
  // ссылке на наш файл быть не может.
  if (src.includes(NUL) || decoded.includes(NUL) || decoded.includes(BACKSLASH)) return null;

  // Пустые сегменты и «.»/«..» в пути не нужны ни одному настоящему файлу.
  const segments = decoded.split('/').slice(1);
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;

  const full = path.resolve(PUBLIC_DIR, `.${decoded}`);
  if (full !== UPLOADS_DIR && !full.startsWith(UPLOADS_DIR + path.sep)) return null;
  return full;
}

// Ссылка указывает на наш собственный загруженный файл (а не на внешний
// адрес и не наружу из папки загрузок) — этим проверяются значения,
// приходящие из формы админки и сохраняемые потом в базу.
function isSafeUploadRef(src) {
  return resolveUploadPath(src) !== null;
}

function removeUploadedFile(src) {
  const full = resolveUploadPath(src);
  if (!full) return;
  fs.unlink(full, () => {});
}

module.exports = {
  PUBLIC_DIR,
  UPLOADS_DIR,
  FONTS_DIR,
  IMAGE_EXTENSIONS,
  FONT_EXTENSIONS,
  badRequest,
  ensureUploadDirs,
  makeUploadFilename,
  imageFileFilter,
  fontFileFilter,
  imageStorage,
  fontStorage,
  resolveUploadPath,
  isSafeUploadRef,
  removeUploadedFile
};
