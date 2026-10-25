require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { initSocket } = require('./socket');
const { secret } = require('./lib/jwt');
const { startDailySummaryScheduler } = require('./services/dailySummary');

secret(); // fail fast if JWT_SECRET is missing in production

const app = express();

const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

app.get('/health', (req, res) => res.json({ ok: true, service: 'paylink-v2' }));

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/links'));
app.use('/api', require('./routes/payments'));
app.use('/api', require('./routes/notifications'));
app.use('/api', require('./routes/analytics'));
app.use('/api', require('./routes/summary'));
if (process.env.NODE_ENV !== 'production') app.use('/api', require('./routes/dev'));

// 404 + error handlers
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[error]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = http.createServer(app);
initSocket(server, allowedOrigins);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`PayLink v2 server running on http://localhost:${PORT}`);
  startDailySummaryScheduler();
});

module.exports = { app, server };
