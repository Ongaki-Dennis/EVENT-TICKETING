# Eventful

Eventful is a TypeScript/Node.js ticketing platform for creators and eventees. It supports authenticated event creation, event browsing, Paystack checkout, QR ticket generation, QR validation at entry, flexible reminders, share links, creator payment visibility, analytics, rate limiting, caching, and Swagger API documentation.

## Features

- Creator and eventee authentication with signed bearer tokens
- Role-based authorization for creator and eventee workflows
- Published event listing with a TTL cache layer
- Creator event management and attendee visibility
- Eventee ticket reservation and Paystack transaction initialization
- Paystack redirect callback and transaction verification before QR generation
- East Africa currency choices, with Paystack checkout support for KES and USD
- QR validation endpoint for creator check-in
- Creator analytics for attendees, tickets bought, revenue, and scanned tickets
- Flexible reminder records for event-level defaults and eventee preferences
- Social sharing URLs for X, Facebook, LinkedIn, and WhatsApp
- Swagger documentation at `/api/docs`
- Unit/integration tests with Vitest and Supertest

## Environment

Create `.env` from `.env.example`:

```bash
PORT=3000
DATA_DIR=./data
PUBLIC_URL=http://localhost:3000
AUTH_SECRET=replace-with-a-long-random-secret
PAYSTACK_SECRET_KEY=sk_test_your_paystack_secret_key
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-smtp-user
SMTP_PASS=your-smtp-password
SMTP_FROM=Eventful <tickets@example.com>
```

If `PAYSTACK_SECRET_KEY` is omitted, Eventful simulates payment confirmation for local development. For live Paystack checkout, set `PAYSTACK_SECRET_KEY` and make `PUBLIC_URL` a public HTTPS URL so Paystack can return buyers to `/api/payments/:reference/callback`.

If SMTP settings are omitted, Eventful writes email activity to a dev outbox available through `/api/notifications/outbox`. With SMTP configured, ticket confirmations and due reminder emails are sent through Nodemailer.

If you prefer Mailgun, set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_FROM`. Eventful will send through Mailgun's API when SMTP values are not present.

## Demo Login

The browser UI includes `Demo Creator` and `Demo Eventee` buttons. They call `/api/auth/demo`, which creates or refreshes stable demo users:

- `creator@eventful.test` / `password123`
- `eventee@eventful.test` / `password123`

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs are available at [http://localhost:3000/api/docs](http://localhost:3000/api/docs).

## Test

```bash
npm run build
npm test
```

The app persists local data to `data/eventful-db.json`.
