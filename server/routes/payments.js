const express = require('express');
const prisma = require('../lib/prisma');
const { requireUser } = require('../middleware/auth');
const { formatKenyanPhone, toLocalFormat } = require('../lib/phone');
const { initiateSTKPush, isMock } = require('../services/mpesaService');
const { handleStkCallback, payerStatusPayload } = require('../services/paymentProcessor');
const { emitPaymentUpdate } = require('../services/paymentEvents');
const { serializePayment } = require('../lib/serialize');
const { dayRange, isDateKey } = require('../lib/format');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Payer: start a payment (STK Push)
router.post('/payments/initiate', async (req, res) => {
  const { paymentLinkId } = req.body;
  const email = String(req.body.email || '').trim().toLowerCase();
  const payerName = String(req.body.payerName || '').trim() || null;

  const phone = formatKenyanPhone(req.body.phone);
  if (!phone) return res.status(400).json({ success: false, error: 'Enter a valid Kenyan phone number (e.g. 0712345678)' });
  if (email && !EMAIL_RE.test(email)) return res.status(400).json({ success: false, error: 'Enter a valid email address' });

  const link = await prisma.paymentLink.findUnique({ where: { id: String(paymentLinkId || '') } });
  if (!link || !link.active) return res.status(404).json({ success: false, error: 'Payment link not found' });

  // Amount always comes from the link, never from the client.
  const payment = await prisma.payment.create({
    data: {
      paymentLinkId: link.id,
      phone,
      payerEmail: email || null,
      payerName,
      amount: link.amount,
    },
  });

  emitPaymentUpdate(link.userId, payment, link.description);

  try {
    const stk = await initiateSTKPush({
      phone,
      amount: link.amount,
      reference: `PL${payment.id.slice(-8)}`,
      description: link.description,
    });
    await prisma.payment.update({
      where: { id: payment.id },
      data: { checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId },
    });

    // Mock mode: pretend the customer entered their PIN a few seconds later.
    if (stk.mock && process.env.MPESA_MOCK_AUTO_CALLBACK !== 'false') {
      const delay = Number(process.env.MPESA_MOCK_CALLBACK_DELAY_MS || 5000);
      setTimeout(() => {
        handleStkCallback(mockCallbackBody(stk.checkoutRequestId, link.amount, phone)).catch((e) =>
          console.error('[mpesa:mock] auto callback failed:', e)
        );
      }, delay);
    }

    res.json({
      success: true,
      paymentId: payment.id,
      checkoutRequestId: stk.checkoutRequestId,
      mock: stk.mock,
    });
  } catch (err) {
    console.error('[payments] STK Push failed:', err.message);
    const failed = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'failed', failureReason: 'Could not send the M-Pesa request' },
    });
    emitPaymentUpdate(link.userId, failed, link.description);
    res.status(502).json({ success: false, error: 'Could not send the M-Pesa request. Please try again.' });
  }
});

// Payer: poll / catch-up for a payment's current status
router.get('/payments/:id/status', async (req, res) => {
  const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
  if (!payment) return res.status(404).json({ error: 'Payment not found' });
  res.json(payerStatusPayload(payment));
});

// Merchant: payment history with filters + pagination
//   ?status=completed|pending|failed  ?from=YYYY-MM-DD&to=YYYY-MM-DD  ?minAmount&maxAmount  ?page&limit
router.get('/payments', requireUser, async (req, res) => {
  const { status, from, to, minAmount, maxAmount } = req.query;
  const bad = (error) => res.status(400).json({ error });

  if (status !== undefined && !['pending', 'completed', 'failed'].includes(status)) {
    return bad('status must be pending, completed or failed');
  }
  if (from !== undefined && !isDateKey(from)) return bad('from must be YYYY-MM-DD');
  if (to !== undefined && !isDateKey(to)) return bad('to must be YYYY-MM-DD');
  if (from && to && from > to) return bad('from must not be after to');

  const toInt = (v) => (v === undefined || v === '' ? undefined : /^\d+$/.test(String(v)) ? Number(v) : NaN);
  const min = toInt(minAmount);
  const max = toInt(maxAmount);
  if (Number.isNaN(min) || Number.isNaN(max)) return bad('minAmount and maxAmount must be whole numbers');
  if (min !== undefined && max !== undefined && min > max) return bad('minAmount must not be greater than maxAmount');

  const pageNum = Number.parseInt(req.query.page, 10);
  const limitNum = Number.parseInt(req.query.limit, 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const limit = Number.isFinite(limitNum) && limitNum > 0 ? Math.min(limitNum, 100) : 20;

  const where = { paymentLink: { userId: req.user.id } };
  if (status) where.status = status;
  // Date range is inclusive and interpreted in Nairobi time.
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = dayRange(from).start;
    if (to) where.createdAt.lte = dayRange(to).end;
  }
  if (min !== undefined || max !== undefined) {
    where.amount = {};
    if (min !== undefined) where.amount.gte = min;
    if (max !== undefined) where.amount.lte = max;
  }

  const [total, rows] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { paymentLink: { select: { description: true } } },
    }),
  ]);

  res.json({
    data: rows.map((p) => serializePayment(p)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// Safaricom -> us. Always answer 200 quickly; Safaricom retries on anything else.
router.post('/mpesa/callback', (req, res) => {
  const expected = process.env.MPESA_CALLBACK_TOKEN;
  if (expected && req.query.token !== expected) {
    console.warn('[callback] rejected: bad token');
    return res.status(403).json({ ResultCode: 1, ResultDesc: 'Forbidden' });
  }

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  handleStkCallback(req.body).catch((err) => console.error('[callback] processing error:', err));
});

function mockCallbackBody(checkoutRequestId, amount, phone, { success = true, resultCode = 1032 } = {}) {
  if (!success) {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: `mock_${checkoutRequestId}`,
          CheckoutRequestID: checkoutRequestId,
          ResultCode: resultCode,
          ResultDesc: 'Request cancelled by user',
        },
      },
    };
  }
  return {
    Body: {
      stkCallback: {
        MerchantRequestID: `mock_${checkoutRequestId}`,
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: amount },
            { Name: 'MpesaReceiptNumber', Value: `MOCK${Math.random().toString(36).slice(2, 9).toUpperCase()}` },
            { Name: 'TransactionDate', Value: Number(new Date().toISOString().replace(/\D/g, '').slice(0, 14)) },
            { Name: 'PhoneNumber', Value: Number(phone) },
          ],
        },
      },
    },
  };
}

module.exports = router;
module.exports.mockCallbackBody = mockCallbackBody;
module.exports.isMock = isMock;
