// Простой ограничитель частоты, работающий в памяти процесса — без внешних
// зависимостей. Нужен прежде всего форме входа: до его появления пароль
// администратора можно было подбирать с любой скоростью, сколько угодно раз
// подряд. Второе применение — открытые для всех записи в таблицу посещений,
// которые иначе можно накручивать и раздувать базу бесконечно.
//
// Счётчик живёт в одном процессе: если приложение запускать в нескольких
// экземплярах (кластер, несколько нод), у каждого будет свой счётчик — тогда
// ограничение стоит вынести на уровень nginx или общего хранилища.

// Потолок на число отслеживаемых ключей, чтобы перебор с тысяч адресов не
// превратился в бесконтрольный рост памяти.
const MAX_TRACKED_KEYS = 20000;

// Счётчик «сколько раз ключ (обычно IP) обращался за текущее окно».
// Возвращает { take(key), reset(key) }: take уменьшает остаток и говорит,
// разрешено ли действие.
function createCounter({ windowMs, max }) {
  const hits = new Map();

  function prune(now) {
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  }

  const timer = setInterval(() => prune(Date.now()), windowMs);
  if (typeof timer.unref === 'function') timer.unref();

  return {
    take(key) {
      const now = Date.now();
      let entry = hits.get(key);

      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        if (hits.size >= MAX_TRACKED_KEYS) prune(now);
        if (hits.size >= MAX_TRACKED_KEYS) hits.clear();
        hits.set(key, entry);
      }

      if (entry.count >= max) {
        return { allowed: false, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
      }

      entry.count += 1;
      return { allowed: true, retryAfter: 0 };
    },

    reset(key) {
      hits.delete(key);
    }
  };
}

function createRateLimit({ windowMs, max, message }) {
  const counter = createCounter({ windowMs, max });

  return function rateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const result = counter.take(key);

    // Успешный вход сбрасывает счётчик (см. routes/auth.js): администратор,
    // опечатавшийся пару раз, ограничения не замечает, а перебор — упирается.
    req.rateLimit = { reset: () => counter.reset(key) };

    if (!result.allowed) {
      res.set('Retry-After', String(result.retryAfter));
      return res.status(429).json({ error: message, retryAfter: result.retryAfter });
    }

    next();
  };
}

module.exports = createRateLimit;
module.exports.createCounter = createCounter;
