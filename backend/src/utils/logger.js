/* Minimal structured logger. Never pass secrets, tokens or raw documents to it. */
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const current = process.env.NODE_ENV === 'test' ? 'error' : process.env.LOG_LEVEL || 'info';

function log(level, message, meta) {
  if (levels[level] > levels[current]) return;
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
  const out = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  if (meta !== undefined) out(line, meta);
  else out(line);
}

module.exports = {
  error: (m, meta) => log('error', m, meta),
  warn: (m, meta) => log('warn', m, meta),
  info: (m, meta) => log('info', m, meta),
  debug: (m, meta) => log('debug', m, meta),
};
