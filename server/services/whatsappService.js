/**
 * WhatsApp payment confirmation (stretch goal) via the WhatsApp Cloud API.
 *
 * Business-initiated messages MUST use a pre-approved TEMPLATE (free-form text only works inside the
 * 24h customer-service window after the user messages you).
 *
 * TEMPLATE STRUCTURE (create in Meta Business Manager > WhatsApp Manager > Message templates):
 *   Name:      payment_confirmation        (lowercase letters, numbers, underscores)
 *   Category:  UTILITY                      (transactional receipts are Utility, not Marketing)
 *   Language:  English (en)
 *   Body:      "Hi! Your payment of KES {{1}} to {{2}} was successful. M-Pesa receipt: {{3}}. Thank you for using PayLink."
 *   Samples:   {{1}} 2,500   {{2}} Demo Coffee Shop   {{3}} QWE123RTY4
 *
 * APPROVAL PROCESS:
 *   1. Create a Meta app + WhatsApp Business Account, add a phone number (or use the free test number).
 *   2. Submit the template; Meta reviews it, usually within minutes to 24 hours. Status: Pending -> Approved/Rejected.
 *      Rejections are most often caused by missing/unclear samples or promotional wording in a Utility template.
 *   3. Put the permanent access token in WHATSAPP_TOKEN and the phone number ID in WHATSAPP_PHONE_NUMBER_ID.
 *   4. With the test number you can only message numbers added to the allowed recipients list.
 *
 * Without WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID this runs in MOCK mode: the message is logged and kept in
 * the dev outbox instead of being sent, so the feature can be demonstrated with no Meta account.
 */
const axios = require('axios');
const outbox = require('../lib/outbox');
const { formatPhoneNumber } = require('../lib/phone');
const { formatKES } = require('../lib/format');

const GRAPH = 'https://graph.facebook.com/v20.0';
const isMock = () => !(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

async function sendPaymentConfirmation({ to, amount, merchantName, mpesaReceipt }) {
  const e164 = formatPhoneNumber(to);
  if (!e164) throw new Error(`Invalid phone number for WhatsApp: ${to}`);
  const params = [formatKES(amount), merchantName, mpesaReceipt];
  const template = process.env.WHATSAPP_TEMPLATE_NAME || 'payment_confirmation';

  if (isMock()) {
    console.log(`[whatsapp:mock] to=${e164} template=${template} params=${JSON.stringify(params)}`);
    outbox.addWhatsapp({ to: e164, template, params });
    return { mock: true };
  }

  try {
    const res = await axios.post(
      `${GRAPH}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to: e164.slice(1), // Cloud API wants digits only, no "+"
        type: 'template',
        template: {
          name: template,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANG || 'en' },
          components: [{ type: 'body', parameters: params.map((text) => ({ type: 'text', text: String(text) })) }],
        },
      },
      { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` }, timeout: 15000 }
    );
    return { mock: false, messageId: res.data?.messages?.[0]?.id };
  } catch (err) {
    throw new Error(err.response?.data?.error?.message || err.message);
  }
}

module.exports = { sendPaymentConfirmation, isMock };
