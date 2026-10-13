// Express 4 не перехватывает отклонённые промисы из async-обработчиков —
// необработанная ошибка просто зависает (или валит процесс). Оборачиваем
// каждый async-роут в этот хелпер, чтобы любая ошибка (в т.ч. из запросов
// к Postgres) штатно попадала в middleware обработки ошибок в server.js.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
