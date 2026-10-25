const TZ = process.env.APP_TIMEZONE || 'Africa/Nairobi';

// Deterministic thousands separator: 2500 -> "2,500"
const formatKES = (n) => Number(n || 0).toLocaleString('en-US');

const escapeHtml = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// YYYY-MM-DD for an instant, in the app time zone (not UTC).
const dayKey = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);

const weekdayLabel = (date) =>
  new Intl.DateTimeFormat('en-KE', { timeZone: TZ, weekday: 'short' }).format(date);

const formatDateTime = (date) =>
  new Intl.DateTimeFormat('en-KE', {
    timeZone: TZ,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);

module.exports = { TZ, formatKES, escapeHtml, dayKey, weekdayLabel, formatDateTime };

// ---- Day boundaries in Nairobi (East Africa Time is a fixed UTC+3, Kenya has no DST) ----
const EAT = '+03:00';
const dayRange = (key) => ({
  start: new Date(`${key}T00:00:00.000${EAT}`),
  end: new Date(`${key}T23:59:59.999${EAT}`),
});
const isDateKey = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const hourInTZ = (date = new Date()) =>
  Number(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false }).format(date)) % 24;
const formatTime = (date) =>
  new Intl.DateTimeFormat('en-KE', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(date);

Object.assign(module.exports, { dayRange, isDateKey, hourInTZ, formatTime });
