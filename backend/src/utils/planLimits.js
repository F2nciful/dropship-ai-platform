const FIRST_MONTH_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// UTC year-month key, e.g. "2026-07" — used to detect when a user's product counter
// should roll over to a fresh monthly period.
function currentPeriodKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

// Resets products_used_this_month to 0 whenever the stored usage_period_start isn't in the
// current UTC month, regardless of when the user next happens to call the API.
// Returns the (possibly just-reset) current usage count.
function resetIfNewPeriod(db, user) {
  const period = currentPeriodKey();
  if (user.usage_period_start === period) {
    return user.products_used_this_month;
  }
  db.prepare('UPDATE users SET products_used_this_month = 0, usage_period_start = ? WHERE id = ?').run(
    period,
    user.id
  );
  return 0;
}

// True if the user is still within the first 30 days of their current plan — this is what
// decides whether a change-plan charge (and the price shown in the UI) is first_month_price
// or the full monthly_price.
function isFirstMonth(user) {
  if (!user.subscription_start_date) return true;
  const start = new Date(user.subscription_start_date).getTime();
  return Date.now() - start < FIRST_MONTH_WINDOW_MS;
}

// Simple 30-day billing cycle from subscription_start_date — avoids calendar-month
// day-of-month edge cases (e.g. Jan 31 -> Feb 31 doesn't exist).
function nextBillingDate(user) {
  if (!user.subscription_start_date) return null;
  const start = new Date(user.subscription_start_date).getTime();
  return new Date(start + FIRST_MONTH_WINDOW_MS).toISOString();
}

module.exports = { currentPeriodKey, resetIfNewPeriod, isFirstMonth, nextBillingDate, FIRST_MONTH_WINDOW_MS };
