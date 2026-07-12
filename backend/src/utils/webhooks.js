const axios = require('axios');
const db = require('../database.js');
const logger = require('./logger.js');

// Fire-and-forget POST to every active webhook subscribed to this event type (or "*").
// Delivery failures are logged, never thrown — a broken webhook URL must never break the
// action that triggered it.
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

    axios
      .post(row.url, { event: eventType, data: payload, timestamp: new Date().toISOString() }, { timeout: 5000 })
      .catch((err) => {
        logger.warn('Webhook delivery failed', { url: row.url, eventType, error: err.message });
      });
  }
}

module.exports = { triggerWebhooks };
