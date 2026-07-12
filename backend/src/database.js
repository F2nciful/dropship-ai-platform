const Database = require('better-sqlite3');
const path = require('path');

// Create/open SQLite database
const dbPath = path.join(__dirname, '../dropship_ai.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Adds a column to an existing table if it isn't already there — better-sqlite3 has no
// migration framework, so this keeps initDatabase() safe to rerun across app versions
// without ever needing to drop/recreate the database file.
function addColumnIfMissing(table, columnDefSql, columnName) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === columnName)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefSql}`);
  }
}

// Renames a column in place (SQLite 3.25+, bundled by better-sqlite3) when the old name is
// still present — idempotent, since the second run finds the new name already there and
// no-ops. Used instead of addColumnIfMissing when a column is being redefined rather than
// newly introduced, so existing data isn't left behind under a stale, unused name.
function renameColumnIfNeeded(table, oldName, newName) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  const hasOld = cols.some((c) => c.name === oldName);
  const hasNew = cols.some((c) => c.name === newName);
  if (hasOld && !hasNew) {
    db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
  }
}

// Initialize database tables
function initDatabase() {
  try {
    console.log('📊 Initializing database...');

    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    addColumnIfMissing('users', "role TEXT NOT NULL DEFAULT 'user'", 'role');
    addColumnIfMissing('users', 'plan_id INTEGER DEFAULT 1', 'plan_id');
    addColumnIfMissing('users', 'monthly_usage_count INTEGER NOT NULL DEFAULT 0', 'monthly_usage_count');
    renameColumnIfNeeded('users', 'monthly_usage_count', 'products_used_this_month');
    addColumnIfMissing('users', 'usage_period_start TEXT', 'usage_period_start');
    addColumnIfMissing('users', 'stripe_customer_id TEXT', 'stripe_customer_id');
    addColumnIfMissing('users', 'stripe_subscription_id TEXT', 'stripe_subscription_id');
    addColumnIfMissing('users', 'subscription_start_date TEXT', 'subscription_start_date');
    // Backfill only — every user should have a start date for "first month" pricing to be
    // computable; new rows get this set explicitly at registration/plan-change time instead.
    db.prepare("UPDATE users SET subscription_start_date = COALESCE(subscription_start_date, created_at, CURRENT_TIMESTAMP) WHERE subscription_start_date IS NULL").run();
    addColumnIfMissing('users', 'is_admin INTEGER NOT NULL DEFAULT 0', 'is_admin');
    // One-time backfill from the old role-based admin flag (this app used to auto-promote
    // the first registered user to role='admin'). Going forward, is_admin is the sole
    // source of truth and is never written by any application code path — per the
    // requirement that admin status can only be granted via a direct database edit, not
    // through the app itself. This UPDATE is a no-op after the first run since role stops
    // changing once nothing sets it anymore.
    db.prepare("UPDATE users SET is_admin = 1 WHERE role = 'admin' AND is_admin = 0").run();
    addColumnIfMissing('users', 'email_notifications_enabled INTEGER NOT NULL DEFAULT 1', 'email_notifications_enabled');
    console.log('✅ Users table ready');

    // Agents table
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        uptime REAL DEFAULT 99.0,
        tasks_completed INTEGER DEFAULT 0,
        last_task TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Agents table ready');

    // Tasks table
    db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        task_name TEXT NOT NULL,
        status TEXT DEFAULT 'running',
        progress INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tasks table ready');

    // Activity logs table
    db.exec(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        agent_id INTEGER REFERENCES agents(id),
        message TEXT NOT NULL,
        level TEXT DEFAULT 'info',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Activity logs table ready');

    // Stores table
    db.exec(`
      CREATE TABLE IF NOT EXISTS stores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        name TEXT NOT NULL,
        platform TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        products_count INTEGER DEFAULT 0,
        orders_count INTEGER DEFAULT 0,
        revenue REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Stores table ready');

    // Products table
    db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        store_id INTEGER REFERENCES stores(id),
        name TEXT NOT NULL,
        sku TEXT UNIQUE,
        price REAL NOT NULL,
        quantity INTEGER DEFAULT 0,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Products table ready');

    // Plans table — users.plan_id references it via the auth middleware's LEFT JOIN, and
    // SQLite requires the table to exist for that query to parse even though the join
    // tolerates missing rows.
    db.exec(`
      CREATE TABLE IF NOT EXISTS plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        monthly_action_limit INTEGER,
        price_usd_cents INTEGER NOT NULL DEFAULT 0,
        stripe_price_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    renameColumnIfNeeded('plans', 'monthly_action_limit', 'max_products_per_month');
    renameColumnIfNeeded('plans', 'price_usd_cents', 'monthly_price');
    addColumnIfMissing('plans', 'first_month_price REAL', 'first_month_price');
    addColumnIfMissing('plans', 'description TEXT', 'description');

    // Final pricing — fixed ids so users.plan_id DEFAULT 1 always means 'free'. Uses an
    // upsert (not INSERT OR IGNORE) since this is the definitive tier/pricing structure:
    // any dev database seeded under the earlier placeholder tiers gets updated in place
    // rather than left stale.
    const upsertPlan = db.prepare(`
      INSERT INTO plans (id, key, name, max_products_per_month, monthly_price, first_month_price, description)
      VALUES (@id, @key, @name, @max_products_per_month, @monthly_price, @first_month_price, @description)
      ON CONFLICT(id) DO UPDATE SET
        key = excluded.key, name = excluded.name, max_products_per_month = excluded.max_products_per_month,
        monthly_price = excluded.monthly_price, first_month_price = excluded.first_month_price,
        description = excluded.description
    `);
    upsertPlan.run({ id: 1, key: 'free', name: 'Free', max_products_per_month: 5, monthly_price: 0, first_month_price: 0, description: 'Perfect for trying out' });
    upsertPlan.run({ id: 2, key: 'starter', name: 'Starter', max_products_per_month: 20, monthly_price: 19.99, first_month_price: 5, description: 'For small stores' });
    upsertPlan.run({ id: 3, key: 'pro', name: 'Pro', max_products_per_month: 50, monthly_price: 39.99, first_month_price: 5, description: 'For growing businesses' });
    upsertPlan.run({ id: 4, key: 'premium', name: 'Premium', max_products_per_month: 200, monthly_price: 79.99, first_month_price: 5, description: 'For large operations' });
    console.log('✅ Plans table ready');

    // One row per search/analyze action a user performs — the running total behind
    // users.products_used_this_month, kept as an append-only log for the admin stats
    // endpoint. query/platforms are populated for 'search' actions only (the frontend
    // passes them through before calling the separate FastAPI search-products service,
    // which has no concept of Express users/plans) — they're what "top 5 most searched
    // products" and the AliExpress/Amazon/eBay platform breakdown are computed from,
    // entirely from Express-side data, without reaching into FastAPI's product DB.
    db.exec(`
      CREATE TABLE IF NOT EXISTS usage_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        action_type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    addColumnIfMissing('usage_events', 'query TEXT', 'query');
    addColumnIfMissing('usage_events', 'platforms TEXT', 'platforms');
    console.log('✅ Usage events table ready');

    // Audit trail for plan changes — Stripe checkout lifecycle events once configured,
    // manual admin-set changes, and self-service change-plan calls in the meantime.
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscription_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        event_type TEXT NOT NULL,
        from_plan TEXT,
        to_plan TEXT,
        stripe_session_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    addColumnIfMissing('subscription_events', 'amount_charged REAL', 'amount_charged');
    console.log('✅ Subscription events table ready');

    // Deliberately minimal — no delivery log, no HMAC secret/retries. A single
    // fire-and-forget POST per registered webhook is enough for this scope.
    db.exec(`
      CREATE TABLE IF NOT EXISTS webhooks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        url TEXT NOT NULL,
        event_types TEXT NOT NULL DEFAULT '["*"]',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Webhooks table ready');

    // Structured record of admin actions (plan changes, user deletion) — distinct from the
    // file-based app.log/error.log, and from subscription_events (which records the plan
    // change itself, not "an admin did this"). Feeds the unified admin logs viewer.
    db.exec(`
      CREATE TABLE IF NOT EXISTS admin_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        details TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Admin logs table ready');

    // Per-user, DB-backed notifications — replaces the earlier client-side-only
    // (localStorage) notification list, so notifications survive across devices/sessions
    // and the unread count is authoritative rather than a local guess.
    db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Notifications table ready');

    console.log('🎉 Database initialized successfully!');
  } catch (error) {
    console.error('❌ Database initialization error:', error.message);
    throw error;
  }
}

module.exports = db;
module.exports.initDatabase = initDatabase;