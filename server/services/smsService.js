const AfricasTalking = require('africastalking');
const outbox = require('../lib/outbox');
const { formatPhoneNumber } = require('../lib/phone');

const username = process.env.AT_USERNAME || 'sandbox';
const apiKey = process.env.AT_API_KEY;
const sms = apiKey ? AfricasTalking({ apiKey, username }).SMS : null;

if (!sms) {
  console.warn('[sms] AT_API_KEY not set - SMS will be logged, not sent (mock mode)');
}

/**
 * Send one SMS via Africa's Talking. `to` can be any common Kenyan format.
 * Throws if the number is invalid or the gateway rejects the message.
 */
async function sendSMS({ to, message }) {
  const recipient = formatPhoneNumber(to);
  if (!recipient) throw new Error(`Invalid phone number for SMS: ${to}`);

  if (!sms) {
    console.log(`[sms:mock] to=${recipient} message="${message}"`);
    outbox.addSms({ to: recipient, message });
    return { mock: true };
  }

  const res = await sms.send({
    to: [recipient],
    message,
    ...(process.env.AT_SENDER_ID ? { from: process.env.AT_SENDER_ID } : {}),
  });
  const recipients = res?.SMSMessageData?.Recipients || [];
  const first = recipients[0];
  // AT status codes 100 (Processed), 101 (Sent), 102 (Queued) are success.
  if (!first || ![100, 101, 102].includes(Number(first.statusCode))) {
    throw new Error(`SMS rejected: ${first?.status || res?.SMSMessageData?.Message || 'unknown error'}`);
  }
  console.log(`[sms] sent to ${recipient} (${first.status})`);
  return { mock: false, messageId: first.messageId };
}

module.exports = { sendSMS };
