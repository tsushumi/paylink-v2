const { escapeHtml, formatKES, formatTime } = require('../lib/format');
const { toLocalFormat } = require('../lib/phone');

/**
 * Merchant end-of-day summary. `payments` are completed payments for the day (oldest first).
 */
function buildDailySummaryEmail({ merchantName, dateLabel, payments, dashboardUrl }) {
  const total = payments.reduce((s, p) => s + p.amount, 0);

  const rows = payments
    .map(
      (p) => `
        <tr>
          <td style="padding:9px 0;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${escapeHtml(formatTime(p.paidAt))}</td>
          <td style="padding:9px 8px;border-bottom:1px solid #e5e7eb;color:#374151;font-size:13px;">${escapeHtml(toLocalFormat(p.phone))}${p.mpesaReceiptNumber ? `<br><span style="color:#9ca3af;font-size:11px;">${escapeHtml(p.mpesaReceiptNumber)}</span>` : ''}</td>
          <td style="padding:9px 0;border-bottom:1px solid #e5e7eb;color:#111827;font-size:14px;font-weight:600;text-align:right;">KES ${escapeHtml(formatKES(p.amount))}</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#16a34a;padding:20px 24px;color:#ffffff;font-size:20px;font-weight:700;">PayLink <span style="font-weight:400;font-size:14px;opacity:.9;">Daily summary</span></td></tr>
<tr><td style="padding:26px 24px 8px;">
  <p style="margin:0 0 4px;color:#374151;font-size:15px;">Hi ${escapeHtml(merchantName)}, here is how ${escapeHtml(dateLabel)} went.</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:18px 0;"><tr>
    <td width="50%" style="background:#f0fdf4;border-radius:10px;padding:14px 16px;">
      <div style="color:#6b7280;font-size:12px;">Payments received</div>
      <div style="color:#111827;font-size:26px;font-weight:700;">${payments.length}</div>
    </td>
    <td width="8"></td>
    <td width="50%" style="background:#f0fdf4;border-radius:10px;padding:14px 16px;">
      <div style="color:#6b7280;font-size:12px;">Total amount</div>
      <div style="color:#111827;font-size:26px;font-weight:700;">KES ${escapeHtml(formatKES(total))}</div>
    </td>
  </tr></table>
  ${
    payments.length
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding-bottom:6px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Time</td><td style="padding:0 8px 6px;color:#9ca3af;font-size:11px;text-transform:uppercase;">Payer</td><td style="padding-bottom:6px;color:#9ca3af;font-size:11px;text-transform:uppercase;text-align:right;">Amount</td></tr>
          ${rows}</table>`
      : `<p style="color:#6b7280;font-size:14px;">No payments were received today.</p>`
  }
</td></tr>
<tr><td align="center" style="padding:20px 24px 30px;">
  <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;background:#16a34a;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">View Dashboard</a>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `PayLink daily summary - ${dateLabel}`,
    `Payments received: ${payments.length}`,
    `Total: KES ${formatKES(total)}`,
    '',
    ...payments.map((p) => `${formatTime(p.paidAt)}  ${toLocalFormat(p.phone)}  KES ${formatKES(p.amount)}`),
    '',
    `View dashboard: ${dashboardUrl}`,
  ].join('\n');

  return { html, text };
}

module.exports = { buildDailySummaryEmail };
