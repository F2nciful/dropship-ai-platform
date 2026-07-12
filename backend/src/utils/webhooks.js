const db = require('../database.js');
const logger = require('./logger.js');

// Skeleton only — per the explicit "don't actually send webhooks yet" requirement, this
// resolves which registered webhooks *would* receive an event and logs the payload that
// would be POSTed, but performs no real HTTP call. Swapping in a real send later (axios,
// with retry/HMAC-signing) means editing only this function.
async function triggerWebhooks(eventType, payload) {
  const rows = db.prepare('SELECT * FROM webhooks WHERE is_active = 1').all();
  for (const row of rows) {
    let types;
    try {
      types = JSON.parse(row.event_types || '["*"]');
    } catch {
      types = ['*'];
    }
    if (!types.includes('*') && !types.includes(eventType)) continue;

    const body = { event_type: eventType, ...payload, timestamp: new Date().toISOString() };
    logger.info('Webhook skeleton — would POST (not actually sent)', { url: row.url, body });
  }
}

module.exports = { triggerWebhooks };
