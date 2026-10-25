const express = require('express');
const prisma = require('../lib/prisma');
const { requireUser } = require('../middleware/auth');
const { dayKey, weekdayLabel } = require('../lib/format');

const router = express.Router();
const DAY_MS = 24 * 60 * 60 * 1000;

router.get('/analytics', requireUser, async (req, res) => {
  const mine = { paymentLink: { userId: req.user.id } };

  const [totals, pendingCount, failedCount] = await Promise.all([
    prisma.payment.aggregate({
      where: { ...mine, status: 'completed' },
      _sum: { amount: true },
      _count: { id: true },
    }),
    prisma.payment.count({ where: { ...mine, status: 'pending' } }),
    prisma.payment.count({ where: { ...mine, status: 'failed' } }),
  ]);

  const completedCount = totals._count.id || 0;
  const totalRevenue = totals._sum.amount || 0;
  const totalAttempts = completedCount + pendingCount + failedCount;

  // Last 7 calendar days in Nairobi time, oldest first (the lesson used UTC dates, which put
  // payments made between 00:00 and 03:00 EAT on the wrong day).
  const now = Date.now();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now - i * DAY_MS);
    days.push({ date: dayKey(d), label: weekdayLabel(d), total: 0, count: 0 });
  }
  const byDate = new Map(days.map((d) => [d.date, d]));

  // Fetch a day of slack, then bucket precisely.
  const recent = await prisma.payment.findMany({
    where: { ...mine, status: 'completed', paidAt: { gte: new Date(now - 8 * DAY_MS) } },
    select: { amount: true, paidAt: true },
  });
  for (const p of recent) {
    const bucket = byDate.get(dayKey(p.paidAt));
    if (bucket) {
      bucket.total += p.amount;
      bucket.count += 1;
    }
  }

  res.json({
    totalRevenue,
    completedCount,
    pendingCount,
    failedCount,
    totalAttempts,
    // completed / all attempts, as a percentage with one decimal
    conversionRate: totalAttempts ? Math.round((completedCount / totalAttempts) * 1000) / 10 : 0,
    averagePayment: completedCount ? Math.round(totalRevenue / completedCount) : 0,
    chartData: days,
  });
});

module.exports = router;
