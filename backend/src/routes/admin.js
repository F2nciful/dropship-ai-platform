const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('../database.js');
const { requireAuth, requireAdmin } = require('../middleware/auth.js');
const { logAdminAction } = require('../utils/adminLog.js');
const { createNotification } = require('../utils/notify.js');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const USER_SORT_COLUMNS = {
  name: 'users.name',
  email: 'users.email',
  plan: 'plans.name',
  joined_date: 'users.created_at',
};

router.get('/users', (req, res) => {
  const q = (req.query.q || '').trim();
  const sortBy = USER_SORT_COLUMNS[req.query.sortBy] || 'users.id';
  const sortDir = req.query.sortDir === 'desc' ? 'DESC' : 'ASC';

  const where = q ? 'WHERE users.name LIKE ? OR users.email LIKE ?' : '';
  const params = q ? [`%${q}%`, `%${q}%`] : [];

  const users = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.is_admin, users.plan_id,
              users.products_used_this_month, users.subscription_start_date, users.created_at,
              plans.key AS plan_key, plans.name AS plan_name
       FROM users LEFT JOIN plans ON plans.id = users.plan_id
       ${where}
       ORDER BY ${sortBy} ${sortDir}`
    )
    .all(...params);

  res.json({ success: true, users, total: users.length });
});

router.get('/users/:id', (req, res) => {
  const user = db
    .prepare(
      `SELECT users.id, users.name, users.email, users.is_admin, users.plan_id,
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
  const target = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id);
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, message: 'User not found' });
  logAdminAction(req.user.id, 'delete_user', { userId: Number(req.params.id), email: target?.email });
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
  const revenueByPlan = usersByPlan.map((p) => ({
    plan_key: p.plan_key,
    plan_name: p.plan_name,
    user_count: p.user_count,
    revenue: Math.round(p.monthly_price * p.user_count * 100) / 100,
  }));
  const revenueProxy = revenueByPlan.reduce((sum, p) => sum + p.revenue, 0);
  const activeSearches24h = db
    .prepare("SELECT COUNT(*) AS c FROM usage_events WHERE action_type = 'search' AND created_at >= datetime('now','-1 day')")
    .get().c;

  // Top 5 most-searched products — grouped by the (trimmed, case-folded) search query text
  // captured on each 'search' usage_event.
  const topProducts = db
    .prepare(
      `SELECT TRIM(query) AS query, COUNT(*) AS search_count
       FROM usage_events
       WHERE action_type = 'search' AND query IS NOT NULL AND TRIM(query) != ''
       GROUP BY LOWER(TRIM(query))
       ORDER BY search_count DESC
       LIMIT 5`
    )
    .all();

  // Platform breakdown (AliExpress vs Amazon vs eBay, etc.) — each search event stores a
  // JSON array of the platforms it searched; explode and count occurrences across all
  // events, then express as a percentage of total platform-mentions.
  const platformRows = db
    .prepare("SELECT platforms FROM usage_events WHERE action_type = 'search' AND platforms IS NOT NULL")
    .all();
  const platformCounts = {};
  let totalPlatformMentions = 0;
  for (const row of platformRows) {
    let platforms;
    try {
      platforms = JSON.parse(row.platforms);
    } catch {
      continue;
    }
    if (!Array.isArray(platforms)) continue;
    for (const p of platforms) {
      platformCounts[p] = (platformCounts[p] || 0) + 1;
      totalPlatformMentions += 1;
    }
  }
  const platformBreakdown = Object.entries(platformCounts)
    .map(([platform, count]) => ({
      platform,
      count,
      percent: totalPlatformMentions === 0 ? 0 : Math.round((count / totalPlatformMentions) * 1000) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  res.json({
    success: true,
    total_users: totalUsers,
    revenue_proxy: Math.round(revenueProxy * 100) / 100,
    revenue_proxy_note: 'Computed from plan prices, not real Stripe transactions',
    active_searches_24h: activeSearches24h,
    users_by_plan: usersByPlan,
    revenue_by_plan: revenueByPlan,
    top_products: topProducts,
    platform_breakdown: platformBreakdown,
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

  // "Last scraper run" — proxies the FastAPI automation scheduler's own status, since
  // that's the one persisted, actual scheduled-scrape timestamp in the system (ad-hoc user
  // searches happen on demand and aren't otherwise tracked as a discrete "run").
  let scraperStatus;
  try {
    const resp = await axios.get('http://127.0.0.1:8000/api/scheduler/status', { timeout: 3000 });
    scraperStatus = {
      ok: true,
      lastRunAt: resp.data.config?.last_run_at || null,
      nextRunAt: resp.data.config?.next_run_at || null,
      enabled: resp.data.config?.enabled || false,
    };
  } catch (err) {
    scraperStatus = { ok: false, error: err.message };
  }

  const errorLogPath = path.join(__dirname, '../../logs/error.log');
  let errorCount24h = 0;
  if (fs.existsSync(errorLogPath)) {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const lines = fs.readFileSync(errorLogPath, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (new Date(entry.timestamp).getTime() >= cutoff) errorCount24h += 1;
      } catch {
        // ignore unparsable lines
      }
    }
  }

  const uptimeSeconds = Math.round(process.uptime());

  res.json({
    success: true,
    express: expressHealth,
    fastapi: fastapiHealth,
    scraper: scraperStatus,
    errorCount24h,
    uptimeSeconds,
    uptimeNote: 'Seconds since the Express process last started — not a historical availability percentage (no monitoring history is kept).',
  });
});

const LOG_TYPES = ['search', 'error', 'admin_action', 'plan_change'];

function buildUnifiedLogs({ type, since, until }) {
  const entries = [];

  if (!type || type === 'search') {
    const rows = db
      .prepare(
        `SELECT usage_events.id, usage_events.created_at, usage_events.query, usage_events.platforms,
                users.email AS user_email
         FROM usage_events LEFT JOIN users ON users.id = usage_events.user_id
         WHERE usage_events.action_type = 'search'`
      )
      .all();
    for (const r of rows) {
      entries.push({
        type: 'search',
        timestamp: r.created_at,
        user: r.user_email || 'unknown',
        action: 'search',
        details: r.query ? `"${r.query}"${r.platforms ? ` on ${r.platforms}` : ''}` : '(no query recorded)',
      });
    }
  }

  if (!type || type === 'plan_change') {
    const rows = db
      .prepare(
        `SELECT subscription_events.id, subscription_events.created_at, subscription_events.event_type,
                subscription_events.from_plan, subscription_events.to_plan, subscription_events.amount_charged,
                users.email AS user_email
         FROM subscription_events LEFT JOIN users ON users.id = subscription_events.user_id`
      )
      .all();
    for (const r of rows) {
      entries.push({
        type: 'plan_change',
        timestamp: r.created_at,
        user: r.user_email || 'unknown',
        action: r.event_type,
        details: `${r.from_plan || '?'} → ${r.to_plan || '?'}${r.amount_charged ? ` ($${r.amount_charged})` : ''}`,
      });
    }
  }

  if (!type || type === 'admin_action') {
    const rows = db
      .prepare(
        `SELECT admin_logs.id, admin_logs.created_at, admin_logs.action, admin_logs.details,
                users.email AS admin_email
         FROM admin_logs LEFT JOIN users ON users.id = admin_logs.admin_id`
      )
      .all();
    for (const r of rows) {
      entries.push({
        type: 'admin_action',
        timestamp: r.created_at,
        user: r.admin_email || 'unknown',
        action: r.action,
        details: r.details || '',
      });
    }
  }

  if (!type || type === 'error') {
    const errorLogPath = path.join(__dirname, '../../logs/error.log');
    if (fs.existsSync(errorLogPath)) {
      const lines = fs.readFileSync(errorLogPath, 'utf8').trim().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const e = JSON.parse(line);
          entries.push({
            type: 'error',
            timestamp: e.timestamp,
            user: '-',
            action: 'error',
            details: `${e.message}${e.path ? ` (${e.path})` : ''}`,
          });
        } catch {
          // ignore unparsable lines
        }
      }
    }
  }

  let filtered = entries;
  if (since) filtered = filtered.filter((e) => e.timestamp && new Date(e.timestamp).getTime() >= new Date(since).getTime());
  if (until) filtered = filtered.filter((e) => e.timestamp && new Date(e.timestamp).getTime() <= new Date(until).getTime());
  filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return filtered;
}

router.get('/logs', (req, res) => {
  const { type, since, until } = req.query;
  if (type && !LOG_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `type must be one of ${LOG_TYPES.join(', ')}` });
  }
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const logs = buildUnifiedLogs({ type, since, until }).slice(0, limit);
  res.json({ success: true, logs });
});

router.get('/logs/export', (req, res) => {
  const { type, since, until, format } = req.query;
  if (type && !LOG_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: `type must be one of ${LOG_TYPES.join(', ')}` });
  }
  const logs = buildUnifiedLogs({ type, since, until });

  if (format === 'csv') {
    const header = 'timestamp,type,user,action,details';
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = logs.map((l) => [l.timestamp, l.type, l.user, l.action, l.details].map(escape).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="logs.csv"');
    return res.send([header, ...rows].join('\n'));
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="logs.json"');
  res.send(JSON.stringify(logs, null, 2));
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
  logAdminAction(req.user.id, 'change_user_plan', { userId: Number(id), fromPlan: fromPlan?.key, toPlan: planKey });
  createNotification(id, 'upgrade_successful', `An admin changed your plan to ${plan.name}`);
  res.json({ success: true });
});

module.exports = router;
