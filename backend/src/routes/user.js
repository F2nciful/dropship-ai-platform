const express = require('express');
const db = require('../database.js');
const { requireAuth } = require('../middleware/auth.js');
const { resetIfNewPeriod, currentPeriodKey, isFirstMonth, nextBillingDate } = require('../utils/planLimits.js');
const { createNotification } = require('../utils/notify.js');
const { sendEmail } = require('../utils/email.js');

const router = express.Router();
router.use(requireAuth);

router.get('/usage', (req, res) => {
  const used = resetIfNewPeriod(db, req.user);
  const limit = req.user.max_products_per_month; // null = unlimited
  const firstMonth = isFirstMonth(req.user);
  res.json({
    success: true,
    plan: req.user.plan_key,
    planName: req.user.plan_name,
    limit,
    used,
    remaining: limit === null ? null : Math.max(0, limit - used),
    percentUsed: limit === null || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100)),
    // Always the *current* period key — resetIfNewPeriod may have just updated the DB to
    // this same value, but req.user itself is a pre-request snapshot and won't reflect it.
    periodStart: currentPeriodKey(),
    subscriptionStartDate: req.user.subscription_start_date,
    isFirstMonth: firstMonth,
    currentPrice: firstMonth ? req.user.first_month_price : req.user.monthly_price,
    normalPrice: req.user.monthly_price,
    nextBillingDate: nextBillingDate(req.user),
  });
});

// Records one product-search/analyze action against the user's monthly limit. Not part of
// the spec's named endpoint list, but required as the concrete bridge the frontend calls
// before hitting the separate FastAPI /api/search-products service (which has no concept
// of Express users/plans — see the cross-service architecture notes elsewhere in this repo).
router.post('/usage/increment', (req, res) => {
  const used = resetIfNewPeriod(db, req.user);
  const limit = req.user.max_products_per_month;

  if (limit !== null && used >= limit) {
    return res.status(403).json({
      success: false,
      code: 'LIMIT_REACHED',
      message: 'Upgrade to continue',
      plan: req.user.plan_key,
      limit,
      used,
    });
  }

  db.prepare('UPDATE users SET products_used_this_month = products_used_this_month + 1 WHERE id = ?').run(req.user.id);
  // query/platforms are only meaningful for 'search' actions — they're what the admin
  // stats endpoint's "top 5 most searched products" and platform breakdown are computed
  // from; the frontend passes them through since Express has no other visibility into
  // what was actually searched on the separate FastAPI service.
  db.prepare('INSERT INTO usage_events (user_id, action_type, query, platforms) VALUES (?, ?, ?, ?)').run(
    req.user.id,
    req.body.actionType || 'unknown',
    req.body.query || null,
    req.body.platforms ? JSON.stringify(req.body.platforms) : null
  );

  const nextUsed = used + 1;

  // 80%-of-limit notification — an Express-observable event (Express already knows
  // used/limit), so it's created directly here rather than needing a round trip from the
  // frontend.
  if (limit !== null) {
    const prevPercent = Math.round((used / limit) * 100);
    const nextPercent = Math.round((nextUsed / limit) * 100);
    if (prevPercent < 80 && nextPercent >= 80) {
      createNotification(
        req.user.id,
        'limit_reached',
        `You've used ${nextPercent}% of your ${req.user.plan_name || 'plan'} monthly limit (${nextUsed}/${limit}) — consider upgrading.`
      );
      if (req.user.email_notifications_enabled) {
        sendEmail(req.user.email, 'limit_warning', { userName: req.user.name, percentUsed: nextPercent, planName: req.user.plan_name });
      }
    }
  }

  res.json({
    success: true,
    used: nextUsed,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - nextUsed),
  });
});

// Self-service upgrade/downgrade. Determines the correct charge (first_month_price vs
// monthly_price) and records it, but — matching the rest of this app's Stripe scaffold —
// never actually processes a real payment until real API keys are configured; this only
// updates plan/subscription state so the rest of the system (limits, UI) reflects the
// change immediately. See routes/billing.js's webhook handler for where a real charge
// would eventually be finalized once Stripe is wired up for real.
router.post('/change-plan', (req, res) => {
  const { planKey } = req.body;
  const plan = db.prepare('SELECT * FROM plans WHERE key = ?').get(planKey);
  if (!plan) {
    return res.status(400).json({ success: false, message: 'Unknown plan' });
  }

  if (plan.id === req.user.plan_id) {
    return res.json({ success: true, message: 'Already on this plan', plan, chargeAmount: 0 });
  }

  const fromPlanKey = req.user.plan_key;
  // Switching plans always starts a fresh first-month window on the new plan — the first
  // charge on any plan change is first_month_price, exactly like a brand-new subscriber.
  const chargeAmount = plan.key === 'free' ? 0 : plan.first_month_price;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE users SET plan_id = ?, subscription_start_date = ?, products_used_this_month = 0, usage_period_start = NULL
     WHERE id = ?`
  ).run(plan.id, now, req.user.id);

  db.prepare(
    'INSERT INTO subscription_events (user_id, event_type, from_plan, to_plan, amount_charged) VALUES (?, ?, ?, ?, ?)'
  ).run(req.user.id, 'plan_changed', fromPlanKey, plan.key, chargeAmount);

  createNotification(req.user.id, 'upgrade_successful', `You're now on the ${plan.name} plan.`);
  if (req.user.email_notifications_enabled) {
    sendEmail(req.user.email, 'upgrade_confirmation', { userName: req.user.name, planName: plan.name });
  }

  res.json({
    success: true,
    plan,
    chargeAmount,
    isFirstMonth: true,
    message: chargeAmount > 0
      ? `Switched to ${plan.name} — $${chargeAmount.toFixed(2)} for your first month (payment integration pending real API keys, not actually charged yet)`
      : `Switched to ${plan.name}`,
  });
});

// Email-notification preference toggle (Settings checkbox). Only stores the preference —
// see utils/email.js for the skeleton this gates once real email sending exists.
router.put('/preferences', (req, res) => {
  const { emailNotifications } = req.body;
  db.prepare('UPDATE users SET email_notifications_enabled = ? WHERE id = ?').run(
    emailNotifications ? 1 : 0,
    req.user.id
  );
  res.json({ success: true, emailNotifications: Boolean(emailNotifications) });
});

module.exports = router;
