const { getIo, room } = require('../lib/io');
const { serializePayment } = require('../lib/serialize');

/** Live feed: tell every open dashboard tab of this merchant that a payment was created/changed. */
function emitPaymentUpdate(merchantId, payment, description) {
  const io = getIo();
  if (io) io.to(room.merchant(merchantId)).emit('payment-update', serializePayment(payment, description));
}

module.exports = { emitPaymentUpdate };
