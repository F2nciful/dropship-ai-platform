const db = require('../database.js');

// Creates a DB-backed notification for a user. Server-observable events (limit reached,
// plan upgraded, admin-changed plan) call this directly from the route that observes them;
// client-observed events (search complete, product added, error alert) are created via the
// frontend calling POST /api/notifications after the relevant FastAPI call resolves, since
// Express has no visibility into that separate service's results.
function createNotification(userId, type, message) {
  db.prepare('INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)').run(userId, type, message);
}

module.exports = { createNotification };
