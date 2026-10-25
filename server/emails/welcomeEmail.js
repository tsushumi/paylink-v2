const { escapeHtml } = require('../lib/format');

function buildWelcomeEmail({ name, dashboardUrl }) {
  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#16a34a;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:700;">PayLink</td></tr>
<tr><td style="padding:28px 24px;color:#374151;font-size:15px;line-height:1.5;">
<p style="margin:0 0 12px;">Welcome, ${escapeHtml(name)}!</p>
<p style="margin:0 0 20px;">Your PayLink merchant account is ready. Create a payment link, share it with a customer, and watch the payment arrive in real time.</p>
<a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:8px;">Open your dashboard</a>
</td></tr></table></td></tr></table></body></html>`;
  const text = `Welcome to PayLink, ${name}!\n\nYour merchant account is ready: ${dashboardUrl}`;
  return { html, text };
}

module.exports = { buildWelcomeEmail };
