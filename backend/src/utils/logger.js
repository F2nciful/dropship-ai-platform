const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '../../logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function write(level, message, meta = {}) {
  const entry = JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() });
  fs.appendFile(path.join(LOG_DIR, 'app.log'), entry + '\n', () => {});
  if (level === 'error') fs.appendFile(path.join(LOG_DIR, 'error.log'), entry + '\n', () => {});
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  consoleFn(`[${level.toUpperCase()}] ${message}`, Object.keys(meta).length ? meta : '');
}

module.exports = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  // TODO(sentry): once a Sentry DSN is available, swap this module's write() body for
  // Sentry.captureException/captureMessage — every call site in the app goes through
  // this one module, so that's the only file that needs to change.
  error: (msg, meta) => write('error', msg, meta),
};
