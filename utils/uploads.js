// Единое место, где описано всё, что связано с файлами в public/uploads:
// какие расширения вообще разрешено класть на диск, как назвать сохраняемый
// файл и как безопасно удалить файл по ссылке вида «/uploads/...».
// Раньше это было продублировано в трёх роутерах — с разными проверками.
const crypto = require('crypto');
const fs = require('fs');
const fsp = require('fs/promises');
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

async function fileHasExpectedSignature(file, kind) {
  const handle = await fsp.open(file.path, 'r');
  try {
    const buffer = Buffer.alloc(32);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const head = buffer.subarray(0, bytesRead);
    const ext = path.extname(String(file.originalname || '')).toLowerCase();
    if (kind === 'image') {
      if (ext === '.jpg' || ext === '.jpeg') return head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
      if (ext === '.png') return head.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      if (ext === '.gif') return head.subarray(0, 6).toString('ascii').match(/^GIF8[79]a$/) !== null;
      if (ext === '.webp') return head.subarray(0, 4).toString('ascii') === 'RIFF' && head.subarray(8, 12).toString('ascii') === 'WEBP';
      if (ext === '.avif') return head.subarray(4, 8).toString('ascii') === 'ftyp' && head.subarray(8, 32).includes(Buffer.from('avif'));
      return false;
    }
    if (kind === 'font') {
      const tag = head.subarray(0, 4).toString('ascii');
      return tag === 'OTTO' || tag === 'wOFF' || tag === 'wOF2' || head.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0]));
    }
    return false;
  } finally {
    await handle.close();
  }
}

function validateUploadedFiles(kind) {
  return async (req, res, next) => {
    const files = Array.isArray(req.files)
      ? req.files
      : req.file
        ? [req.file]
        : Object.values(req.files || {}).flat();
    try {
      for (const file of files) {
        if (!(await fileHasExpectedSignature(file, kind))) {
          await Promise.all(files.map((item) => fsp.unlink(item.path).catch(() => {})));
          return res.status(400).json({ error: kind === 'font' ? 'Содержимое не является файлом шрифта' : 'Содержимое не соответствует формату изображения' });
        }
      }
      next();
    } catch (err) {
      await Promise.all(files.map((item) => fsp.unlink(item.path).catch(() => {})));
      next(err);
    }
  };
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
  validateUploadedFiles,
  imageStorage,
  fontStorage,
  resolveUploadPath,
  isSafeUploadRef,
  removeUploadedFile
};
