const jwt = require('jsonwebtoken');
const db = require('../database.js');

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-in-production';

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    // Re-read the user fresh from the DB on every request (not just trusting the JWT's
    // embedded claims) since role/plan can change mid-session via the admin panel.
    const user = db
      .prepare(
        `SELECT users.id, users.name, users.email, users.role, users.plan_id,
                users.products_used_this_month, users.usage_period_start, users.subscription_start_date,
                plans.key AS plan_key, plans.name AS plan_name, plans.max_products_per_month,
                plans.monthly_price, plans.first_month_price, plans.description AS plan_description
         FROM users LEFT JOIN plans ON plans.id = users.plan_id
         WHERE users.id = ?`
      )
      .get(decoded.userId);

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
