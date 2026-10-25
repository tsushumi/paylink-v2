const { toLocalFormat } = require('./phone');

// Payment row as the merchant UI sees it.
const serializePayment = (p, description) => ({
  id: p.id,
  description: description ?? p.paymentLink?.description ?? '',
  amount: p.amount,
  phone: toLocalFormat(p.phone),
  status: p.status,
  mpesaReceiptNumber: p.mpesaReceiptNumber || null,
  failureReason: p.failureReason || null,
  createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : p.createdAt,
  paidAt: p.paidAt instanceof Date ? p.paidAt.toISOString() : p.paidAt || null,
});

module.exports = { serializePayment };
