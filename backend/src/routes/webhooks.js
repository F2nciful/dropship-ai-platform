const express = require('express');
const db = require('../database.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  const webhooks = db.prepare('SELECT * FROM webhooks WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ success: true, webhooks });
});

function registerWebhook(req, res) {
  const { url, eventTypes } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, message: 'url is required' });
  }
  const result = db
    .prepare('INSERT INTO webhooks (user_id, url, event_types) VALUES (?, ?, ?)')
    .run(req.user.id, url, JSON.stringify(eventTypes && eventTypes.length ? eventTypes : ['*']));
  res.status(201).json({ success: true, id: result.lastInsertRowid });
}

router.post('/', registerWebhook);
// Same handler, exact path from spec — kept as an alias so the existing Settings UI (which
// already calls POST /) doesn't need to change alongside it.
router.post('/register', registerWebhook);

router.delete('/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ success: false, message: 'Webhook not found' });
  }
  res.json({ success: true });
});

module.exports = router;
