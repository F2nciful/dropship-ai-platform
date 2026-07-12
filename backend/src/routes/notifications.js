const express = require('express');
const db = require('../database.js');
const { requireAuth } = require('../middleware/auth.js');

const router = express.Router();
router.use(requireAuth);

// The 5 named event types from the spec, plus the app's pre-existing generic UI-severity
// notifications (success/warning/error/info — used for background activity like Shopify
// sync results that don't cleanly map to one of the 5 named categories). Both are valid
// "type" values; the frontend picks an icon/color per type either way.
const VALID_TYPES = [
  'product_added', 'search_complete', 'limit_reached', 'upgrade_successful', 'error_alert',
  'success', 'warning', 'error', 'info',
];

router.get('/', (req, res) => {
  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.user.id)
    .map((n) => ({ ...n, read: Boolean(n.read) }));
  const unreadCount = db
    .prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read = 0')
    .get(req.user.id).c;
  res.json({ success: true, notifications, unreadCount });
});

// Creates a notification for client-observed events (search complete, product added, error
// during search/analysis) — these happen against the separate FastAPI service, which
// Express has no visibility into, so the frontend calls this right after such an event
// resolves. Server-observable events (limit reached, plan upgraded) are created directly
// by the routes that observe them instead (see utils/notify.js).
router.post('/', (req, res) => {
  const { type, message } = req.body;
  if (!VALID_TYPES.includes(type) || !message) {
    return res.status(400).json({ success: false, message: `type must be one of ${VALID_TYPES.join(', ')}, and message is required` });
  }
  const result = db
    .prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)')
    .run(req.user.id, type, message);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.post('/read-all', (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

router.post('/:id/read', (req, res) => {
  const result = db
    .prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true });
});

// Clear all — must be registered before the single-id DELETE route below it'd otherwise
// shadow, but Express matches literal segments before params regardless of order here
// since '/' has no param, so this is safe either way; kept above for readability.
router.delete('/', (req, res) => {
  db.prepare('DELETE FROM notifications WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

router.delete('/:id', (req, res) => {
  const result = db
    .prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true });
});

module.exports = router;
