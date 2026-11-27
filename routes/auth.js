const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const createRateLimit = require('../middleware/rateLimit');
const { SESSION_COOKIE_NAME, COOKIE_SECURE } = require('../utils/config');

const router = express.Router();

// Не больше 10 попыток входа с одного адреса за 15 минут. Счётчик сбрасывается
// сразу после успешного входа, поэтому администратор, опечатавшийся пару раз,
// ограничения не замечает — а подбор пароля упирается в потолок.
const loginRateLimit = createRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Слишком много попыток входа. Попробуйте ещё раз через несколько минут.'
});

// Хэш-заглушка: если логин не совпал, bcrypt.compare всё равно выполняется —
// иначе ответ при неверном логине приходил бы заметно быстрее, чем при верном
// логине и неверном пароле, и по времени ответа логин можно было бы подобрать.
const configuredRounds = Number((process.env.ADMIN_PASSWORD_HASH || '').match(/^\$2[aby]\$(\d{2})\$/)?.[1]);
const dummyRounds = Number.isInteger(configuredRounds) ? Math.min(14, Math.max(10, configuredRounds)) : 10;
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-constant-time-compare', dummyRounds);

router.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const login = typeof req.body.login === 'string' ? req.body.login : '';
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const validLogin = process.env.ADMIN_LOGIN || 'admin';
    const validHash = process.env.ADMIN_PASSWORD_HASH;

    if (!validHash) {
      return res.status(500).json({
        error: 'Пароль администратора не настроен. Задайте ADMIN_PASSWORD_HASH в .env (см. README).'
      });
    }

    if (!login || login.length > 80 || !password || Buffer.byteLength(password, 'utf8') > 72) {
      return res.status(400).json({ error: 'Проверьте логин и пароль' });
    }

    const loginOk = login === validLogin;
    const passwordOk = await bcrypt.compare(password, loginOk ? validHash : DUMMY_HASH);

    if (!loginOk || !passwordOk) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    // Сессию выдаём под новым идентификатором: если гостю заранее подсунули
    // чужой идентификатор сессии (фиксация сессии), после входа он становится
    // недействительным и в панель по нему не попасть.
    req.session.regenerate((regenerateErr) => {
      if (regenerateErr) return next(regenerateErr);

      req.session.isAdmin = true;
      req.session.save((saveErr) => {
        if (saveErr) return next(saveErr);
        if (req.rateLimit) req.rateLimit.reset();

        // Cookie с флагом Secure браузер принимает только по HTTPS. Если сайт
        // при этом работает по http, вход формально успешен, но сессия не
        // сохраняется — и панель бесконечно возвращает на форму входа.
        // Явно подсказываем это в логе, иначе причина совсем не очевидна.
        if (COOKIE_SECURE && !req.secure) {
          console.warn(
            'Вход выполнен по HTTP, но cookie сессии помечена Secure — браузер её не сохранит. Поднимите сайт за HTTPS (и пробрасывайте X-Forwarded-Proto) либо задайте COOKIE_SECURE=false в .env.'
          );
        }

        res.json({ ok: true });
      });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.json({ ok: true });
  });
});

router.get('/csrf', (req, res) => {
  if (!req.session || !req.session.isAdmin) {
    return res.status(401).json({ error: 'Требуется авторизация' });
  }
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token: req.session.csrfToken });
});

router.get('/status', (req, res) => {
  res.json({ isAdmin: !!(req.session && req.session.isAdmin) });
});

module.exports = router;
