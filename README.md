# PayLink v2

Payment links with **live** M-Pesa status. A merchant creates a link and shares it; the payer watches their payment
confirm in real time. Every successful payment also sends an email receipt, an SMS to both the payer and the merchant,
a WhatsApp confirmation, and a notification-bell alert on the merchant dashboard, and feeds the analytics.


## Features

**Core**
| Feature | How |
|---|---|
| Live payer status | Socket.IO: `Waiting for payment...` -> `Processing...` -> `Payment received!` with receipt details, no refresh. Failure shows the reason and a retry button |
| Email receipt | Resend. Table-based HTML with inline styles, "Payment Successful" badge, amount, paid to / transaction ID / M-Pesa receipt / date, footer, plain-text fallback. Sent async with `.catch()` |
| SMS to merchant | Africa's Talking: `PayLink: Payment of KES 2,500 received from 0712345678. M-Pesa receipt: QWE123RTY4. Log in to your dashboard for details.` |
| SMS to payer | `Your payment of KES 2,500 to Demo Coffee Shop was successful. Receipt: QWE123RTY4. Thank you for using PayLink.` |
| Payment history | `GET /api/payments` with `status`, `from`/`to`, `minAmount`/`maxAmount`, `page`/`limit`; React page with filters and a paginated table |
| Dashboard | Stat cards (total revenue, pending, completed) + 7-day revenue bar chart from `GET /api/analytics` |
| Real-time dashboard | Bell with unread badge, dropdown, "Mark all as read", top-right toasts (green/red, auto-dismiss after 5s) |

**Stretch (all three built)**
| Feature | How |
|---|---|
| WhatsApp confirmation | `services/whatsappService.js`: WhatsApp Cloud API template message, **mock mode** without Meta credentials. Template structure and approval process are documented in the file header |
| Merchant daily summary | `POST /api/summary/test` emails the signed-in merchant today's summary (total, count, transactions, "View Dashboard" button). Optional scheduler: `DAILY_SUMMARY_ENABLED=true` |
| Advanced dashboard | Live payments feed (new/updated payments appear instantly), conversion rate (completed / all attempts), area chart next to the bar chart |

**Tech:** Node 20+, Express 5, Prisma 6 + PostgreSQL, Socket.IO, bcrypt + JWT, Resend, Africa's Talking, React 19 + Vite.

## Setup

You need Node 20+ and a PostgreSQL database (local Docker, Supabase, ...).

```bash
# 0. Database (local example)
docker run -d --name paylink-db -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=paylink postgres:16

# 1. Server
cd server
cp .env.example .env        # works as-is: mock mode, no API keys needed
npm install                 # also runs `prisma generate`
npm run db:push             # creates the tables
npm run db:seed             # optional: demo@paylink.test / password123 + a payment link
npm run dev                 # http://localhost:3001

# 2. Client (new terminal)
cd client
cp .env.example .env
npm install
npm run dev                 # http://localhost:5173
```

Sign up (or use the seeded demo account), create a link, open it in another tab and pay.

### Mock mode (default)
With no keys set nothing external is called, so the full flow runs offline:
- **M-Pesa:** `MPESA_MOCK=true` skips Daraja; a fake successful callback fires `MPESA_MOCK_CALLBACK_DELAY_MS` (5s) after the STK Push, so you can watch "Waiting" flip to "Received".
- **Email / SMS / WhatsApp:** logged to the server console and kept in memory. Inspect them at `GET /api/dev/outbox`.

### Environment variables (`server/.env`)
| Variable | Notes |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET`, `JWT_EXPIRES_IN` | **Required in production** (the server refuses to start without a secret) |
| `PORT`, `CLIENT_URL` | `CLIENT_URL` = frontend origin(s), comma separated. Used for CORS and sockets |
| `NODE_ENV=production` | Disables the `/api/dev/*` helper routes |
| `MPESA_MOCK` | `true` = mock, `false` = real Daraja |
| `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`, `MPESA_ENV` | Daraja app (sandbox shortcode `174379`) |
| `MPESA_CALLBACK_URL` | Public HTTPS URL, e.g. `https://<id>.ngrok.app/api/mpesa/callback` or your Railway URL |
| `MPESA_CALLBACK_TOKEN` | Optional shared secret, appended as `?token=` and checked on the callback |
| `RESEND_API_KEY`, `FROM_EMAIL` | `onboarding@resend.dev` can only deliver to your own Resend account email until you verify a domain |
| `AT_USERNAME` (`sandbox`), `AT_API_KEY`, `AT_SENDER_ID` | Sandbox SMS appears in the Africa's Talking simulator, not on a real phone |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG` | Optional; blank = mock |
| `DAILY_SUMMARY_ENABLED`, `DAILY_SUMMARY_HOUR`, `DASHBOARD_URL` | Optional daily summary scheduler (hour is Nairobi time) |

Client (`client/.env`): `VITE_API_URL` (ends in `/api`) and `VITE_SERVER_URL` (no `/api`).

### Deploying
- **Backend on Railway:** add a PostgreSQL plugin, root directory `server/`, build `npm install`, start `npm start`, run `npx prisma db push` once. Set the env vars above (`NODE_ENV=production`, `JWT_SECRET`, `CLIENT_URL` = your Vercel URL, `MPESA_CALLBACK_URL` = your Railway URL + `/api/mpesa/callback`).
- **Frontend on Vercel:** root directory `client/`, framework Vite, set `VITE_API_URL` and `VITE_SERVER_URL`. `vercel.json` rewrites all routes to `index.html`, so `/pay/<id>` links work.

## Architecture

```
Safaricom --POST--> /api/mpesa/callback  (replies 200 immediately)
                          |
                  paymentProcessor.handleStkCallback
                          |  atomic pending -> completed claim (retries are ignored)
   +------------+---------+----------+-----------+-----------+------------+
   v            v                    v           v           v            v
 payer's    Resend email        SMS to       SMS to      WhatsApp     Notification row + live feed
 browser    receipt             merchant     payer       (mock/API)   -> 'new-notification', 'payment-update'
 (socket)   (never blocks)      (never blocks)                        -> merchant dashboard (bell, toast, feed)
```

Decisions worth knowing about:
- **Socket.IO rooms instead of `Map<id, socketId>`.** The spec sketches Maps with one socket per key. That breaks when two payers open the same link (the second overwrites the first, who never gets updates) or a merchant has two tabs open. Rooms (`payment:<id>`, `merchant:<id>`) do the same job for any number of sockets and clean up on disconnect. Event names match the spec: `watch-payment`, `register-merchant`, `payment-status`, `new-notification`.
- **Authenticated merchant sockets.** The JWT goes in the socket handshake and `register-merchant` only succeeds for the user id in that token, so nobody can listen to another merchant's payments by guessing an id.
- **Idempotent callback.** Safaricom retries callbacks. The status change is an atomic `updateMany ... where status = 'pending'`, so a retry can't send a second receipt, SMS or notification.
- **Channels are independent.** A Resend outage can't stop the SMS or the bell.
- **Catch-up on connect.** `watch-payment-attempt` replies with the current status, so a callback that lands before the socket joins (or during a reconnect) isn't lost. The payer page also polls `/api/payments/:id/status` every 4s as a fallback.
- **Time zone.** Charts, date filters and the daily summary use Nairobi time (UTC+3, no DST); UTC would put payments between 00:00-03:00 EAT on the wrong day.
- **The amount always comes from the link,** never from the client. Receipt/summary emails HTML-escape all user input.
- Not included: password reset and login rate limiting. Add both before production.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/register`, `/api/auth/login` | - | Returns `{ token, user }` (password min 8 chars, bcrypt-hashed) |
| GET | `/api/auth/me` | merchant | Current user |
| POST | `/api/payment-links` | merchant | Create link (`description`, `amount` 1-150000) |
| GET | `/api/payment-links` | merchant | Own links + paid counts |
| GET | `/api/payment-links/:id` | - | Public link details for the payer |
| POST | `/api/payments/initiate` | - | Start STK Push (`paymentLinkId`, `phone`, `email?`, `payerName?`) |
| GET | `/api/payments/:id/status` | - | Current payment status (poll fallback) |
| GET | `/api/payments` | merchant | History. Query: `status`, `from`, `to` (YYYY-MM-DD, inclusive, Nairobi), `minAmount`, `maxAmount`, `page`, `limit` (max 100). Returns `{ data, pagination: { page, limit, total, totalPages } }` |
| POST | `/api/mpesa/callback` | token | Safaricom STK result |
| GET | `/api/notifications` | merchant | List + `unreadCount` |
| POST | `/api/notifications/:id/read`, `/api/notifications/read-all` | merchant | Mark read |
| GET | `/api/analytics` | merchant | `totalRevenue`, `pendingCount`, `completedCount`, `failedCount`, `conversionRate`, `averagePayment`, 7-day `chartData` |
| POST | `/api/summary/test` | merchant | Email today's (or `{ date }`) summary to the merchant |

Authenticated routes take `Authorization: Bearer <jwt>`.
Socket events: client -> `watch-payment(linkId)`, `watch-payment-attempt(paymentId, ack)`, `register-merchant(userId, ack)`;
server -> `payment-status`, `new-notification`, `payment-update`.
Dev only (not mounted in production): `GET/DELETE /api/dev/outbox`, `POST /api/dev/simulate-callback {paymentId, success?}`, `POST /api/dev/backdate`.

## Testing

```bash
cd server && MPESA_MOCK_AUTO_CALLBACK=false npm run dev   # deterministic timing
cd server && npm run test:flow                              # 101 end-to-end checks
```

Covers: auth, authenticated sockets, the live status sequence, two payers on one link, multi-tab delivery and isolation, receipt
email content and escaping, both SMS templates, WhatsApp, notification read state, duplicate-callback idempotency, reconnect
catch-up, the real callback endpoint, every history filter and pagination edge, analytics numbers and the daily summary. A
Playwright browser run of the same flows (including mobile overflow and console-error checks) also passes.

> **Note on `dev:shim`.** `npm run dev:shim` runs the server against `server/test/prismaShim.js`, a small in-memory stand-in for
> Prisma, so the flow can be tested where Prisma's engines can't be downloaded. Normal runs use the real Prisma client with
> PostgreSQL. Run `npm run test:flow` against `npm run dev` once on your machine to confirm your database setup.

## Screenshots

| State | File |
|---|---|
| Payment page, waiting | `docs/screenshots/01-payment-waiting.png` |
| Payment page, success + receipt | `docs/screenshots/02-payment-success.png` |
| Dashboard, bell with unread count + toasts | `docs/screenshots/03-dashboard-bell-toasts.png` |
| Notification dropdown | `docs/screenshots/04-notification-dropdown.png` |
| Analytics: stat cards, bar + area charts, live feed | `docs/screenshots/05-analytics.png` |
| Payment history with filters | `docs/screenshots/06-payment-history.png` |
| Receipt email (rendered preview) | `docs/screenshots/07-receipt-email-preview.png` |
| Daily summary email (rendered preview) | `docs/screenshots/08-daily-summary-email-preview.png` |
| Mobile history | `docs/screenshots/09-mobile-history.png` |
| Africa's Talking | `docs/screenshots/10-Africa's Talking sandbox simulator.png` |

Still to capture yourself once your keys are set: the receipt email in a real inbox, and the Africa's Talking sandbox simulator
showing the received SMS (`07` is a rendering of the same HTML, not an inbox screenshot).
