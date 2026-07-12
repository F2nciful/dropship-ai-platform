const db = require('../database.js');

// Kept for future real payment processing (per the "prepare for future payment
// processing" requirement) — plan listing lives at GET /api/plans and self-service
// upgrades at POST /api/user/change-plan, neither of which need Stripe configured today.
// Stripe requires the raw request body for signature verification, so this handler is
// mounted directly with express.raw() in index.js, ahead of the app-wide express.json()
// parser.
function webhookHandler(req, res) {
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      req.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = Number(session.client_reference_id);
    const plan = db.prepare('SELECT * FROM plans WHERE stripe_price_id = ?').get(
      session.line_items?.data?.[0]?.price?.id
    );
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE users SET plan_id = COALESCE(?, plan_id), stripe_customer_id = ?, stripe_subscription_id = ?,
              subscription_start_date = ?, products_used_this_month = 0, usage_period_start = NULL
       WHERE id = ?`
    ).run(plan ? plan.id : null, session.customer, session.subscription, now, userId);
    db.prepare(
      'INSERT INTO subscription_events (user_id, event_type, to_plan, stripe_session_id) VALUES (?, ?, ?, ?)'
    ).run(userId, 'checkout_completed', plan ? plan.key : null, session.id);
  }

  res.json({ received: true });
}

module.exports = { webhookHandler };
