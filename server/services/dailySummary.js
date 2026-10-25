const prisma = require('../lib/prisma');
const { dayKey, dayRange, hourInTZ, formatKES, TZ } = require('../lib/format');
const { sendEmail } = require('./emailService');
const { buildDailySummaryEmail } = require('../emails/dailySummary');

const dashboardUrl = () =>
  process.env.DASHBOARD_URL || process.env.CLIENT_URL?.split(',')[0]?.trim() || 'http://localhost:5173';

async function getSummary(userId, key = dayKey(new Date())) {
  const { start, end } = dayRange(key);
  const payments = await prisma.payment.findMany({
    where: { paymentLink: { userId }, status: 'completed', paidAt: { gte: start, lte: end } },
    orderBy: { paidAt: 'asc' },
  });
  return {
    date: key,
    count: payments.length,
    total: payments.reduce((s, p) => s + p.amount, 0),
    payments,
  };
}

async function sendDailySummary(user, key = dayKey(new Date())) {
  const summary = await getSummary(user.id, key);
  const dateLabel = new Intl.DateTimeFormat('en-KE', { timeZone: TZ, dateStyle: 'full' }).format(
    new Date(`${key}T12:00:00+03:00`)
  );
  const { html, text } = buildDailySummaryEmail({
    merchantName: user.name,
    dateLabel,
    payments: summary.payments,
    dashboardUrl: dashboardUrl(),
  });
  await sendEmail({
    to: user.email,
    subject: `PayLink daily summary: ${summary.count} payment${summary.count === 1 ? '' : 's'}, KES ${formatKES(summary.total)}`,
    html,
    text,
  });
  return { date: key, count: summary.count, total: summary.total };
}

/**
 * Opt-in scheduler (DAILY_SUMMARY_ENABLED=true). Checks every minute; at DAILY_SUMMARY_HOUR (Nairobi time)
 * it sends each merchant who had payments that day a summary, once per day per process.
 * Note: with several server instances each would send; use one instance or a real job queue/cron in production.
 */
function startDailySummaryScheduler() {
  if (process.env.DAILY_SUMMARY_ENABLED !== 'true') return null;
  const hour = Number(process.env.DAILY_SUMMARY_HOUR ?? 20);
  let lastSent = null;
  const timer = setInterval(async () => {
    const today = dayKey(new Date());
    if (hourInTZ() !== hour || lastSent === today) return;
    lastSent = today;
    try {
      const users = await prisma.user.findMany({});
      for (const user of users) {
        const s = await getSummary(user.id, today);
        if (s.count > 0) await sendDailySummary(user, today).catch((e) => console.error('[summary]', user.email, e.message));
      }
      console.log(`[summary] daily summaries processed for ${today}`);
    } catch (err) {
      console.error('[summary] scheduler error:', err);
      lastSent = null; // retry on the next tick within the hour
    }
  }, 60_000);
  timer.unref();
  console.log(`[summary] scheduler on: daily at ${hour}:00 ${TZ}`);
  return timer;
}

module.exports = { getSummary, sendDailySummary, startDailySummaryScheduler };
