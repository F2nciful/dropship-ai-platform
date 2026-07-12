const db = require('../database.js');

// Records a structured admin action (distinct from the file-based app.log and from
// subscription_events, which records the plan change itself rather than "an admin did
// this") — feeds the unified admin logs viewer.
function logAdminAction(adminId, action, details) {
  db.prepare('INSERT INTO admin_logs (admin_id, action, details) VALUES (?, ?, ?)').run(
    adminId,
    action,
    typeof details === 'string' ? details : JSON.stringify(details || {})
  );
}

module.exports = { logAdminAction };
