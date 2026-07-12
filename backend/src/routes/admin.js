const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../database.js');
const { requireAuth, requireAdmin } = require('../middleware/auth.js');

const router = express.Router();
router.use(requireAuth, requireAdmin);

router.get('/users', (req, res) => {
  const users = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.role, users.plan_id,
              users.products_used_this_month, users.subscription_start_date, users.created_at,
              plans.key AS plan_key, plans.name AS plan_name
       FROM users LEFT JOIN plans ON plans.id = users.plan_id
       ORDER BY users.id`
    )
    .all();
  res.json({ success: true, users });
});

router.get('/users/:id', (req, res) => {
  const user = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.role, users.plan_id,
              users.products_used_this_month, users.subscription_start_date, users.created_at,
              plans.key AS plan_key, plans.name AS plan_name
       FROM users LEFT JOIN plans ON plans.id = users.plan_id
       WHERE users.id = ?`
    )
    .get(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });

  const usageEvents = db
    .prepare('SELECT * FROM usage_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.params.id);
  const subscriptionEvents = db
    .prepare('SELECT * FROM subscription_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(req.params.id);

  res.json({ success: true, user, usageEvents, subscriptionEvents });
});

router.delete('/users/:id', (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
  }
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true });
});

router.get('/stats', (req, res) => {
  const totalUsers = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  const usersByPlan = db
    .prepare(
      `SELECT plans.key AS plan_key, plans.name AS plan_name, plans.monthly_price, COUNT(users.id) AS user_count
       FROM plans LEFT JOIN users ON users.plan_id = plans.id
       GROUP BY plans.id ORDER BY plans.id`
    )
    .all();
  const revenueProxy = usersByPlan.reduce((sum, p) => sum + p.monthly_price * p.user_count, 0);
  const activeSearches24h = db
    .prepare("SELECT COUNT(*) AS c FROM usage_events WHERE created_at >= datetime('now','-1 day')")
    .get().c;

  res.json({
    success: true,
    total_users: totalUsers,
    revenue_proxy: Math.round(revenueProxy * 100) / 100,
    revenue_proxy_note: 'Computed from plan prices, not real Stripe transactions',
    active_searches_24h: activeSearches24h,
    users_by_plan: usersByPlan,
  });
});

router.get('/health', async (req, res) => {
  let expressHealth;
  try {
    db.prepare('SELECT 1').get();
    expressHealth = { ok: true };
  } catch (err) {
    expressHealth = { ok: false, error: err.message };
  }

  let fastapiHealth;
  try {
    const resp = await axios.get('http://127.0.0.1:8000/api/health', { timeout: 3000 });
    fastapiHealth = { ok: true, data: resp.data };
  } catch (err) {
    fastapiHealth = { ok: false, error: err.message };
  }

  res.json({ success: true, express: expressHealth, fastapi: fastapiHealth });
});

router.get('/logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const logPath = path.join(__dirname, '../../logs/app.log');
  if (!fs.existsSync(logPath)) {
    return res.json({ success: true, logs: [] });
  }
  const lines = fs.readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
  const tail = lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
  res.json({ success: true, logs: tail });
});

// The concrete "admin manually sets a user's plan" mechanism while Stripe is unconfigured.
router.put('/users/:id/plan', (req, res) => {
  const { id } = req.params;
  const { planKey } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE key = ?').get(planKey);
  if (!plan) {
    return res.status(400).json({ success: false, message: 'Unknown plan' });
  }
  const user = db.prepare('SELECT id, plan_id FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  const fromPlan = db.prepare('SELECT key FROM plans WHERE id = ?').get(user.plan_id);
  db.prepare(
    `UPDATE users SET plan_id = ?, subscription_start_date = ?, products_used_this_month = 0, usage_period_start = NULL
     WHERE id = ?`
  ).run(plan.id, new Date().toISOString(), id);
  db.prepare(
    'INSERT INTO subscription_events (user_id, event_type, from_plan, to_plan, amount_charged) VALUES (?, ?, ?, ?, ?)'
  ).run(id, 'manual_admin_set', fromPlan ? fromPlan.key : null, planKey, 0);
  res.json({ success: true });
});

module.exports = router;
