const logger = require('./logger.js');

// Email skeleton — no real sending yet (no SMTP/API credentials configured). Every call
// site in the app goes through this one module, so wiring up a real provider later (e.g.
// SendGrid/Resend/SMTP) means editing only this file, same pattern as utils/logger.js's
// Sentry TODO.

const TEMPLATES = {
  product_alert: ({ userName, productName }) =>
    `Hi ${userName}, there's an update on "${productName}" — check your dashboard for details.`,
  limit_warning: ({ userName, percentUsed, planName }) =>
    `Hi ${userName}, you've used ${percentUsed}% of your ${planName} plan's monthly limit. Consider upgrading to avoid interruptions.`,
  upgrade_confirmation: ({ userName, planName }) =>
    `Hi ${userName}, you're now on the ${planName} plan. Thanks for upgrading!`,
};

// TODO(real-email-provider): once SMTP/API credentials exist, replace this body with a
// real send (nodemailer, SendGrid, Resend, etc.) — every caller already passes exactly
// what a real send would need (to, template, data).
function sendEmail(to, templateKey, data) {
  const template = TEMPLATES[templateKey];
  if (!template) {
    logger.warn('Unknown email template requested', { templateKey });
    return;
  }
  const body = template(data);
  logger.info('Email skeleton — would send (no provider configured)', { to, templateKey, body });
}

module.exports = { sendEmail, TEMPLATES };
