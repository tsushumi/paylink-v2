const { formatKES } = require('../lib/format');
const { toLocalFormat } = require('../lib/phone');

const templates = {
  // To the merchant
  paymentReceived: ({ amount, phone, mpesaReceipt }) =>
    `PayLink: Payment of KES ${formatKES(amount)} received from ${toLocalFormat(String(phone))}. ` +
    `M-Pesa receipt: ${mpesaReceipt}. Log in to your dashboard for details.`,

  // To the payer
  paymentConfirmation: ({ amount, merchantName, mpesaReceipt }) =>
    `Your payment of KES ${formatKES(amount)} to ${merchantName} was successful. ` +
    `Receipt: ${mpesaReceipt}. Thank you for using PayLink.`,
};

function buildSMS(name, params) {
  const fn = templates[name];
  if (!fn) throw new Error(`Unknown SMS template: ${name}`);
  return fn(params);
}

module.exports = { buildSMS };
