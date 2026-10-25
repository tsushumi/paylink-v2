const { Server } = require('socket.io');
const prisma = require('./lib/prisma');
const { setIo, room } = require('./lib/io');
const { verify } = require('./lib/jwt');
const { payerStatusPayload } = require('./services/paymentProcessor');

/**
 * Socket.IO setup.
 *
 * The spec suggests Map<paymentLinkId, socketId> / Map<userId, socketId>. A single-socket-per-key Map breaks as
 * soon as two payers open the same link (the second overwrites the first, who then never gets updates) or a
 * merchant has two tabs open. Socket.IO rooms give the same "send to that person" behaviour for any number of
 * sockets and are cleaned up automatically on disconnect:
 *   - payment:<paymentId>  -> the browser(s) watching that one payment attempt
 *   - link:<linkId>        -> anyone viewing a link page ('watch-payment', as in the spec)
 *   - merchant:<userId>    -> every open tab of that merchant
 *
 * Merchants must authenticate: the client passes its JWT in the connection handshake (`auth: { token }`) and
 * 'register-merchant' only succeeds for the user id inside that token, so nobody can subscribe to someone
 * else's payments by guessing an id.
 */
function initSocket(httpServer, allowedOrigins) {
  const io = new Server(httpServer, {
    cors: { origin: allowedOrigins, methods: ['GET', 'POST'] },
  });
  setIo(io);

  io.on('connection', (socket) => {
    const authedUserId = verify(socket.handshake.auth?.token);

    socket.on('watch-payment', (paymentLinkId) => {
      if (typeof paymentLinkId !== 'string') return;
      socket.join(room.link(paymentLinkId));
    });

    // Reply carries the current status so a callback that landed before this join (or during a
    // reconnect) is never missed.
    socket.on('watch-payment-attempt', async (paymentId, ack) => {
      try {
        if (typeof paymentId !== 'string') throw new Error('bad id');
        socket.join(room.payment(paymentId));
        const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
        if (typeof ack === 'function') ack(payment ? payerStatusPayload(payment) : { status: 'unknown' });
      } catch {
        if (typeof ack === 'function') ack({ status: 'unknown' });
      }
    });

    socket.on('register-merchant', (userId, ack) => {
      const ok = typeof userId === 'string' && authedUserId && authedUserId === userId;
      if (ok) socket.join(room.merchant(userId));
      if (typeof ack === 'function') ack({ ok: !!ok });
    });
  });

  return io;
}

module.exports = { initSocket };
