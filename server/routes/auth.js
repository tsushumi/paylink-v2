const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { sign } = require('../lib/jwt');
const { formatKenyanPhone, toLocalFormat } = require('../lib/phone');
const { sendEmail } = require('../services/emailService');
const { buildWelcomeEmail } = require('../emails/welcomeEmail');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, phone: u.phone });

router.post('/auth/register', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const rawPhone = String(req.body.phone || '').trim();

  if (!name) return res.status(400).json({ error: 'Name is required' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'A valid email is required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  let phone = null;
  if (rawPhone) {
    const normalized = formatKenyanPhone(rawPhone);
    if (!normalized) return res.status(400).json({ error: 'Enter a valid Kenyan phone number (e.g. 0712345678)' });
    phone = toLocalFormat(normalized);
  }

  if (await prisma.user.findUnique({ where: { email } })) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({ data: { name, email, phone, passwordHash } });

  // Welcome email: fire and forget, never blocks sign-up.
  const { html, text } = buildWelcomeEmail({
    name: user.name,
    dashboardUrl: process.env.DASHBOARD_URL || process.env.CLIENT_URL?.split(',')[0] || 'http://localhost:5173',
  });
  sendEmail({ to: user.email, subject: 'Welcome to PayLink', html, text }).catch((e) =>
    console.error('[auth] welcome email failed:', e.message)
  );

  res.status(201).json({ token: sign(user), user: publicUser(user) });
});

router.post('/auth/login', async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message for unknown email and wrong password (don't reveal which accounts exist).
  const ok = user && (await bcrypt.compare(password, user.passwordHash));
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(user), user: publicUser(user) });
});

router.get('/auth/me', require('../middleware/auth').requireUser, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

module.exports = router;
