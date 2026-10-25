/**
 * End-to-end check of PayLink v2 against a running server (mock M-Pesa / email / SMS / WhatsApp mode).
 *   Terminal 1: MPESA_MOCK_AUTO_CALLBACK=false npm run dev      (or dev:shim)
 *   Terminal 2: npm run test:flow
 */
const { io } = require('socket.io-client');

const BASE = process.env.BASE_URL || 'http://localhost:3001';
let passed = 0;
let failed = 0;

const check = (name, cond, extra = '') => {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name} ${extra}`);
  }
};
const section = (t) => console.log(`\n${t}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body, token) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const connect = (token) =>
  new Promise((resolve, reject) => {
    const s = io(BASE, { transports: ['websocket'], auth: token ? { token } : {} });
    s.on('connect', () => resolve(s));
    s.on('connect_error', reject);
  });
const emitAck = (s, ev, ...args) => new Promise((r) => s.emit(ev, ...args, r));

async function main() {
  console.log(`Testing ${BASE}`);
  const tag = Date.now();

  // ================= Auth =================
  section('Auth (bcrypt + JWT)');
  const reg = await api('POST', '/auth/register', { name: 'Test Shop', email: `shop${tag}@test.dev`, phone: '0712345678', password: 'supersecret1' });
  check('register merchant returns token + user', reg.status === 201 && !!reg.json.token && !!reg.json.user.id);
  check('password hash never returned', !JSON.stringify(reg.json).includes('passwordHash') && !JSON.stringify(reg.json).includes('$2'));
  const token = reg.json.token;
  const merchant = reg.json.user;
  check('short password rejected (400)', (await api('POST', '/auth/register', { name: 'x', email: `a${tag}@t.dev`, password: 'short' })).status === 400);
  check('duplicate email rejected (409)', (await api('POST', '/auth/register', { name: 'x', email: `shop${tag}@test.dev`, password: 'supersecret1' })).status === 409);
  check('login with right password', (await api('POST', '/auth/login', { email: `shop${tag}@test.dev`, password: 'supersecret1' })).json?.token?.length > 20);
  check('wrong password -> 401', (await api('POST', '/auth/login', { email: `shop${tag}@test.dev`, password: 'nope-nope' })).status === 401);
  check('unknown email -> 401 (same message)', (await api('POST', '/auth/login', { email: `ghost${tag}@test.dev`, password: 'whatever12' })).json?.error === 'Invalid email or password');
  check('protected route without token -> 401', (await api('GET', '/analytics')).status === 401);
  check('protected route with garbage token -> 401', (await api('GET', '/analytics', null, 'abc.def.ghi')).status === 401);
  const other = (await api('POST', '/auth/register', { name: 'Other', email: `other${tag}@test.dev`, password: 'supersecret1' })).json;
  const otherToken = other.token;
  await sleep(150);
  let ob = (await api('GET', '/dev/outbox')).json;
  check('welcome email sent on register', ob.emails.some((e) => e.to === `shop${tag}@test.dev` && /Welcome/.test(e.subject)));

  // ================= Links =================
  section('Payment links');
  const linkRes = await api('POST', '/payment-links', { description: 'Coffee <b>combo</b>', amount: 2500 }, token);
  check('create payment link', linkRes.status === 201);
  const link = linkRes.json;
  check('amount validation rejects 0', (await api('POST', '/payment-links', { description: 'x', amount: 0 }, token)).status === 400);
  check('creating a link requires auth', (await api('POST', '/payment-links', { description: 'x', amount: 5 })).status === 401);
  check('public link shows merchantName', (await api('GET', `/payment-links/${link.id}`)).json.merchantName === 'Test Shop');

  // ================= Sockets =================
  section('Merchant sockets (authenticated)');
  const tab1 = await connect(token);
  const tab2 = await connect(token);
  const n1 = [];
  const n2 = [];
  const feed1 = [];
  tab1.on('new-notification', (n) => n1.push(n));
  tab2.on('new-notification', (n) => n2.push(n));
  tab1.on('payment-update', (p) => feed1.push(p));
  check('register-merchant ack (tab 1)', (await emitAck(tab1, 'register-merchant', merchant.id)).ok === true);
  check('register-merchant ack (tab 2)', (await emitAck(tab2, 'register-merchant', merchant.id)).ok === true);
  const impostor = await connect(otherToken);
  check('cannot register as ANOTHER merchant id', (await emitAck(impostor, 'register-merchant', merchant.id)).ok === false);
  const anon = await connect();
  check('unauthenticated socket cannot register', (await emitAck(anon, 'register-merchant', merchant.id)).ok === false);
  const otherSock = await connect(otherToken);
  const nOther = [];
  otherSock.on('new-notification', (n) => nOther.push(n));
  await emitAck(otherSock, 'register-merchant', other.user.id);

  // ================= Payments: two payers, same link =================
  section('Two payers on one link (success + cancel)');
  await api('DELETE', '/dev/outbox');
  const payerA = await connect();
  const payerB = await connect();
  const statusA = [];
  const statusB = [];
  payerA.on('payment-status', (d) => statusA.push(d));
  payerB.on('payment-status', (d) => statusB.push(d));
  payerA.emit('watch-payment', link.id);
  payerB.emit('watch-payment', link.id);

  check('invalid phone rejected', (await api('POST', '/payments/initiate', { paymentLinkId: link.id, phone: '12345' })).status === 400);
  const initA = await api('POST', '/payments/initiate', { paymentLinkId: link.id, phone: '0712 345 678', email: `payer${tag}@test.dev`, payerName: 'Alice <script>' });
  const initB = await api('POST', '/payments/initiate', { paymentLinkId: link.id, phone: '+254799111222' });
  check('initiate A ok', initA.json?.success === true, JSON.stringify(initA.json));
  check('initiate B ok', initB.json?.success === true, JSON.stringify(initB.json));
  await sleep(150);
  check('live feed got both new pending payments', feed1.filter((p) => p.status === 'pending').length === 2, `got ${feed1.length}`);

  const ackA = await emitAck(payerA, 'watch-payment-attempt', initA.json.paymentId);
  const ackB = await emitAck(payerB, 'watch-payment-attempt', initB.json.paymentId);
  check('attempt ack reports pending', ackA.status === 'pending' && ackB.status === 'pending');

  const cbA = await api('POST', '/dev/simulate-callback', { paymentId: initA.json.paymentId });
  const cbB = await api('POST', '/dev/simulate-callback', { paymentId: initB.json.paymentId, success: false });
  check('callback A processed', cbA.json?.status === 'completed', JSON.stringify(cbA.json));
  check('callback B processed as failed', cbB.json?.status === 'failed', JSON.stringify(cbB.json));
  await sleep(300);

  check('payer A: processing then completed', statusA.map((s) => s.status).join(',') === 'processing,completed', statusA.map((s) => s.status).join(','));
  const doneA = statusA.find((s) => s.status === 'completed');
  check('payer A: receipt number + amount + paidAt', !!doneA?.mpesaReceiptNumber && doneA.amount === 2500 && !!doneA.paidAt);
  check('payer B (same link): only its own failure', statusB.map((s) => s.status).join(',') === 'processing,failed', statusB.map((s) => s.status).join(','));
  check('payer B failure has reason', !!statusB.find((s) => s.status === 'failed')?.reason);
  const completedFeed = feed1.find((p) => p.status === 'completed');
  check('live feed got the completed payment', completedFeed?.amount === 2500 && completedFeed.phone === '0712345678');
  check('live feed got the failed payment', feed1.some((p) => p.status === 'failed'));

  // ================= Email =================
  section('Email receipt');
  ob = (await api('GET', '/dev/outbox')).json;
  check('exactly one email (only A gave an email)', ob.emails.length === 1, `got ${ob.emails.length}`);
  const mail = ob.emails[0];
  check('email addressed to payer', mail?.to === `payer${tag}@test.dev`);
  check('subject has amount', mail?.subject === 'Payment Receipt - KES 2,500', mail?.subject);
  check('has "Payment Successful" badge', mail?.html.includes('Payment Successful'));
  check('details: paid to, receipt no., transaction id, date', ['Paid to', 'M-Pesa receipt', 'Transaction ID', 'Date'].every((l) => mail?.html.includes(l)) && mail.html.includes(doneA.mpesaReceiptNumber));
  check('table layout + inline styles', /<table/.test(mail?.html) && /style="/.test(mail?.html));
  check('plain-text fallback present', /PAYMENT SUCCESSFUL/.test(mail?.text || '') && (mail?.text || '').includes(doneA.mpesaReceiptNumber));
  check('HTML-escapes user input', mail?.html.includes('Coffee &lt;b&gt;combo&lt;/b&gt;') && !mail.html.includes('<script>'));

  // ================= SMS + WhatsApp =================
  section('SMS (merchant + payer) and WhatsApp');
  check('two SMS sent (merchant + payer), none for the failed payment', ob.sms.length === 2, `got ${ob.sms.length}`);
  const toMerchant = ob.sms.find((s) => s.to === '+254712345678' && /received from/.test(s.message));
  check(
    'merchant SMS matches spec template',
    toMerchant?.message === `PayLink: Payment of KES 2,500 received from 0712345678. M-Pesa receipt: ${doneA.mpesaReceiptNumber}. Log in to your dashboard for details.`,
    toMerchant?.message
  );
  const toPayer = ob.sms.find((s) => /Thank you for using PayLink/.test(s.message));
  check(
    'payer SMS matches spec template',
    toPayer?.message === `Your payment of KES 2,500 to Test Shop was successful. Receipt: ${doneA.mpesaReceiptNumber}. Thank you for using PayLink.`,
    toPayer?.message
  );
  check('SMS numbers are E.164', ob.sms.every((s) => /^\+254\d{9}$/.test(s.to)));
  check('WhatsApp confirmation sent to payer (mock)', ob.whatsapp.length === 1 && ob.whatsapp[0].to === '+254712345678' && ob.whatsapp[0].params[2] === doneA.mpesaReceiptNumber, JSON.stringify(ob.whatsapp));

  // ================= Notifications =================
  section('Notification bell');
  check('tab 1 got 2 live notifications', n1.length === 2, `got ${n1.length}`);
  check('tab 2 got them too (multi-tab)', n2.length === 2, `got ${n2.length}`);
  check('other merchant got none (isolation)', nOther.length === 0 && feed1.length > 0);
  check('types are payment_failed + payment_received', n1.map((n) => n.type).sort().join(',') === 'payment_failed,payment_received');
  check('notification data is an object', typeof n1[0].data === 'object' && !!n1.find((n) => n.type === 'payment_received').data.mpesaReceiptNumber);
  const list = await api('GET', '/notifications', null, token);
  check('unread = 2', list.json.unreadCount === 2 && list.json.notifications.length === 2);
  check('mark one read', (await api('POST', `/notifications/${list.json.notifications[0].id}/read`, null, token)).status === 200);
  check("other merchant can't mark it (404)", (await api('POST', `/notifications/${list.json.notifications[1].id}/read`, null, otherToken)).status === 404);
  check('unread = 1', (await api('GET', '/notifications', null, token)).json.unreadCount === 1);
  check('read-all route not shadowed by :id', (await api('POST', '/notifications/read-all', null, token)).status === 200);
  check('unread = 0', (await api('GET', '/notifications', null, token)).json.unreadCount === 0);

  // ================= Idempotency =================
  section('Duplicate callback (Safaricom retry)');
  await api('DELETE', '/dev/outbox');
  const before = n1.length;
  const dupCb = await api('POST', '/dev/simulate-callback', { paymentId: initA.json.paymentId });
  await sleep(200);
  ob = (await api('GET', '/dev/outbox')).json;
  check('duplicate flagged', dupCb.json?.duplicate === true, JSON.stringify(dupCb.json));
  check('no second email / SMS / WhatsApp / notification', ob.emails.length + ob.sms.length + ob.whatsapp.length === 0 && n1.length === before);

  // ================= Reconnect =================
  section('Reconnect catch-up');
  const late = await emitAck(await connect(), 'watch-payment-attempt', initA.json.paymentId);
  check('late joiner receives completed status in ack', late.status === 'completed' && !!late.mpesaReceiptNumber);
  check('HTTP status fallback agrees', (await api('GET', `/payments/${initA.json.paymentId}/status`)).json.status === 'completed');

  // ================= Real callback endpoint =================
  section('POST /api/mpesa/callback (real endpoint)');
  const initC = await api('POST', '/payments/initiate', { paymentLinkId: link.id, phone: '0722000111' });
  const payC = await connect();
  const statusC = [];
  payC.on('payment-status', (d) => statusC.push(d));
  await emitAck(payC, 'watch-payment-attempt', initC.json.paymentId);
  const raw = await api('POST', '/mpesa/callback', {
    Body: { stkCallback: { MerchantRequestID: 'x', CheckoutRequestID: initC.json.checkoutRequestId, ResultCode: 0, ResultDesc: 'ok',
      CallbackMetadata: { Item: [{ Name: 'Amount', Value: 2500 }, { Name: 'MpesaReceiptNumber', Value: 'QWE123RTY4' }, { Name: 'PhoneNumber', Value: 254722000111 }] } } },
  });
  check('endpoint answers ResultCode 0 immediately', raw.json?.ResultCode === 0);
  await sleep(300);
  check('payer C completed via real endpoint', statusC.some((s) => s.status === 'completed' && s.mpesaReceiptNumber === 'QWE123RTY4'));
  check('malformed callback does not crash', (await api('POST', '/mpesa/callback', { nope: 1 })).status === 200);

  // ================= History: filters + pagination =================
  section('Payment history (filters, pagination)');
  // Create extra payments with known amounts/dates: 1000 (today pending), 5000 (3d ago done), 1500 (10d ago done), 300 (20d ago failed)
  const mk = async (amount, daysAgo, outcome) => {
    const l = (await api('POST', '/payment-links', { description: `Item ${amount}`, amount }, token)).json;
    const init = await api('POST', '/payments/initiate', { paymentLinkId: l.id, phone: '0700000001' });
    if (outcome !== 'pending') await api('POST', '/dev/simulate-callback', { paymentId: init.json.paymentId, success: outcome === 'completed' });
    if (daysAgo) await api('POST', '/dev/backdate', { paymentId: init.json.paymentId, daysAgo });
    return init.json.paymentId;
  };
  await mk(1000, 0, 'pending');
  await mk(5000, 3, 'completed');
  await mk(1500, 10, 'completed');
  await mk(300, 20, 'failed');

  const all = await api('GET', '/payments', null, token);
  check('response shape { data, pagination }', Array.isArray(all.json.data) && all.json.pagination && 'totalPages' in all.json.pagination);
  check('total = 7 (payers A, B, C + 4 new)', all.json.pagination.total === 7, `got ${all.json.pagination.total}`);
  check('defaults: page 1, limit 20', all.json.pagination.page === 1 && all.json.pagination.limit === 20 && all.json.pagination.totalPages === 1);
  const dates = all.json.data.map((p) => new Date(p.createdAt).getTime());
  check('sorted newest first', dates.every((d, i) => i === 0 || dates[i - 1] >= d));
  const f = async (qs) => (await api('GET', `/payments?${qs}`, null, token)).json;
  check('?status=completed', (await f('status=completed')).data.every((p) => p.status === 'completed') && (await f('status=completed')).pagination.total === 4);
  check('?status=pending', (await f('status=pending')).pagination.total === 1);
  check('?status=failed', (await f('status=failed')).pagination.total === 2);
  const minmax = await f('minAmount=1000&maxAmount=5000');
  check('?minAmount&maxAmount range', minmax.data.length > 0 && minmax.data.every((p) => p.amount >= 1000 && p.amount <= 5000));
  const iso = (d) => new Date(Date.now() - d * 86400000).toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
  const ranged = await f(`from=${iso(5)}&to=${iso(2)}`);
  check('?from&to date range (inclusive, Nairobi)', ranged.pagination.total === 1 && ranged.data[0].amount === 5000, JSON.stringify(ranged.pagination));
  check('filters combine', (await f(`status=completed&minAmount=3000&from=${iso(30)}`)).pagination.total === 1);
  const pg = await f('limit=3&page=2');
  check('pagination: page 2 of limit 3', pg.data.length === 3 && pg.pagination.page === 2 && pg.pagination.totalPages === 3 && pg.pagination.total === 7);
  check('pagination: last page partial', (await f('limit=3&page=3')).data.length === 1);
  check('pagination: beyond last page is empty', (await f('limit=3&page=9')).data.length === 0);
  check('limit capped at 100', (await f('limit=5000')).pagination.limit === 100);
  check('bad status -> 400', (await api('GET', '/payments?status=bogus', null, token)).status === 400);
  check('bad date -> 400', (await api('GET', '/payments?from=2026-13-45', null, token)).status === 400);
  check('from > to -> 400', (await api('GET', '/payments?from=2026-02-01&to=2026-01-01', null, token)).status === 400);
  check('min > max -> 400', (await api('GET', '/payments?minAmount=9&maxAmount=1', null, token)).status === 400);
  check('non-numeric amount -> 400', (await api('GET', '/payments?minAmount=abc', null, token)).status === 400);
  check('payments requires auth', (await api('GET', '/payments')).status === 401);
  check("other merchant sees none of these", (await api('GET', '/payments', null, otherToken)).json.pagination.total === 0);

  // ================= Analytics =================
  section('Analytics');
  const an = (await api('GET', '/analytics', null, token)).json;
  check('totalRevenue = 2500 + 2500 + 5000 + 1500 = 11,500', an.totalRevenue === 11500, String(an.totalRevenue));
  check('completedCount = 4', an.completedCount === 4, String(an.completedCount));
  check('pendingCount = 1', an.pendingCount === 1, String(an.pendingCount));
  check('failedCount = 2', an.failedCount === 2, String(an.failedCount));
  check('conversion rate = 4/7 = 57.1%', an.totalAttempts === 7 && an.conversionRate === 57.1, `${an.totalAttempts} ${an.conversionRate}`);
  check('chart has 7 days', an.chartData.length === 7);
  check('today bucket = 5000 (2 payments)', an.chartData[6].total === 5000 && an.chartData[6].count === 2, JSON.stringify(an.chartData[6]));
  check('3 days ago bucket = 5000', an.chartData[3].total === 5000, JSON.stringify(an.chartData[3]));
  check('10-day-old payment is outside the chart', an.chartData.reduce((s, d) => s + d.total, 0) === 10000);
  const oa = (await api('GET', '/analytics', null, otherToken)).json;
  check('other merchant sees zeros', oa.totalRevenue === 0 && oa.completedCount === 0 && oa.conversionRate === 0);

  // ================= Daily summary =================
  section('Merchant daily summary email (stretch)');
  await api('DELETE', '/dev/outbox');
  const sum = await api('POST', '/summary/test', {}, token);
  check('summary endpoint ok', sum.json?.success === true && sum.json.count === 2 && sum.json.total === 5000, JSON.stringify(sum.json));
  ob = (await api('GET', '/dev/outbox')).json;
  const sm = ob.emails[0];
  check('summary sent to the merchant', sm?.to === `shop${tag}@test.dev`);
  check('summary has count, total, transactions, CTA', /View Dashboard/.test(sm?.html) && sm.html.includes('KES 5,000') && sm.html.includes('QWE123RTY4') && sm.html.includes('Payments received'));
  check('summary subject', sm?.subject === 'PayLink daily summary: 2 payments, KES 5,000', sm?.subject);
  check('summary for a quiet day still sends', (await api('POST', '/summary/test', { date: '2020-01-01' }, token)).json?.count === 0);
  check('summary validates date', (await api('POST', '/summary/test', { date: 'yesterday' }, token)).status === 400);
  check('summary requires auth', (await api('POST', '/summary/test', {})).status === 401);

  // ================= Cleanup =================
  section('Disconnect cleanup');
  payerA.disconnect();
  await sleep(100);
  const before2 = statusA.length;
  await api('POST', '/dev/simulate-callback', { paymentId: initA.json.paymentId });
  check('disconnected socket gets nothing further', statusA.length === before2);

  [tab1, tab2, payerB, otherSock, impostor, anon, payC].forEach((s) => s.disconnect());
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('E2E crashed:', e);
  process.exit(1);
});
