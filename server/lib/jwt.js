const jwt = require('jsonwebtoken');

function secret() {
  const s = process.env.JWT_SECRET;
  if (s) return s;
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production');
  return 'dev-only-insecure-secret';
}

const sign = (user) =>
  jwt.sign({ sub: user.id }, secret(), { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

/** Returns the user id from a valid token, or null. Never throws. */
function verify(token) {
  try {
    return jwt.verify(String(token || ''), secret()).sub || null;
  } catch {
    return null;
  }
}

module.exports = { sign, verify, secret };
