const express = require('express');
const { requireUser } = require('../middleware/auth');
const { sendDailySummary } = require('../services/dailySummary');
const { isDateKey } = require('../lib/format');

const router = express.Router();

// Test endpoint: emails the signed-in merchant their summary for today (or ?date=YYYY-MM-DD).
router.post('/summary/test', requireUser, async (req, res) => {
  const date = req.body?.date;
  if (date !== undefined && !isDateKey(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  try {
    const result = await sendDailySummary(req.user, date);
    res.json({ success: true, sentTo: req.user.email, ...result });
  } catch (err) {
    console.error('[summary] test send failed:', err.message);
    res.status(502).json({ error: 'Could not send the summary email' });
  }
});

module.exports = router;
