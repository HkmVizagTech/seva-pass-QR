# Seva Pass QR

A web app for devotees to issue QR entry passes to donors/invitees, validate them at the venue, and let guests view their pass card by scanning with any phone camera.

- **Backend**: Node.js + Express + **MongoDB (MongoDB Atlas)** via Mongoose
- **Frontend**: React + Vite
- Single repo with npm workspaces: `server/` + `client/`

## Features

- Devotee login (JWT auth, seeded default admin)
- **Per-devotee quota** — each devotee can hold a limited number of non-revoked passes (default 30, configurable per user by admin; env: `DEVOTEE_DEFAULT_QUOTA`)
- Issue QR entry passes for donors/invitees (name, phone, email, pass type, event, validity)
- Pass types: General, VIP, Donor, Volunteer, Staff, Media
- Events management
- QR encodes a URL (`/pass?t=<token>`) — any phone camera opens a printable pass card
- In-app camera scanner validates a pass and records check-in time
- Pass list with search/filter, manual check-in, revoke, and PNG download
- Dashboard stats (total / unused / checked-in / revoked / today / events / my quota)
- Public pass card page (no login) that also prints as the physical pass
- **Main-system integration (optional)** — pull QRs from the main ISKCON Seva Pass system (`HkmVizagTech/iskcon-seva-pass-backend`) via its third-party integration API; works standalone until configured
- **WhatsApp QR delivery** (stub + API endpoint ready — enable by adding Meta credentials, see below)

## Requirements

- Node.js >= 18.18 (tested on Node 24)
- A MongoDB database — **MongoDB Atlas** (free M0 tier works) or local MongoDB

## 1. Set up MongoDB Atlas

1. Create a cluster at https://www.mongodb.com/atlas (free tier is enough).
2. **Database Access** → add a database user (e.g. `seva` with a strong password).
3. **Network Access** → allow your IP (or `0.0.0.0/0` for open access in dev).
4. **Database → Connect → Drivers** → copy the connection string:
   ```
   mongodb+srv://seva:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
   ```
   Optionally add a database name, e.g. `.../seva_pass?retryWrites=true&w=majority`.

## 2. Configure the server

```bash
cd server
copy .env.example .env    # then edit .env
```

Set at minimum:

```env
MONGODB_URI=mongodb+srv://seva:<password>@<cluster>.mongodb.net/seva_pass?retryWrites=true&w=majority
JWT_SECRET=<a-long-random-string>
```

If `MONGODB_URI` is missing, the server falls back to `mongodb://localhost:27017/seva_pass` with a warning.

**Troubleshooting — "SRV lookup failed" / `querySrv ECONNREFUSED`:** Node's SRV DNS lookup intermittently fails on some machines (a known Node-on-Windows issue). The server auto-falls back to `MONGODB_DIRECT_URI` (a host:port connection string). To use it, copy the `MONGODB_DIRECT_URI` template from `server/.env.example` and fill in your cluster's shard hostnames (from `Resolve-DnsName _mongodb._tcp.<cluster>.mongodb.net -Type SRV`) and replica set (from the TXT record). The startup also retries transient connection errors automatically.

## 3. Install & run

```bash
npm install
npm run dev        # client on http://localhost:5173, API on http://localhost:4000
```

Production:

```bash
npm run build && npm start    # serves app + API on http://localhost:4000
```

## Default login

```
username: admin
password: admin123
```

## WhatsApp QR delivery (future upgrade — wiring is already in place)

The server includes `server/services/whatsapp.js` and a `POST /api/passes/:id/send-whatsapp` endpoint that sends the pass QR as a WhatsApp image to the donor's phone. It activates automatically once you set these in `server/.env`:

```env
WHATSAPP_API_TOKEN=<Meta Graph API token>
WHATSAPP_PHONE_NUMBER_ID=<your WhatsApp Business number id>
WHATSAPP_BASE_URL=https://graph.facebook.com/v21.0
```

How to get them:
1. Create a business at https://business.whatsapp.com and connect a phone number via the WhatsApp Business Cloud API (Meta for Developers).
2. In the Meta app dashboard → **WhatsApp → API Setup**, copy the token and phone number id, and add the **WhatsApp Business Messaging** webhook-free token scope.
3. The app uses the standard **upload media** → **send image** flow (`graph.facebook.com/<version>/<PHONE_NUMBER_ID>/media` then `/messages`).

Until the env vars are set, the endpoint returns `501 WhatsApp is not configured`. To surface it in the UI later, add a "Send via WhatsApp" button in `client/src/pages/PassList.jsx` (it already has the donor's phone number).

## Tests

A full API smoke test runs against an in-memory MongoDB (downloads a mongod binary once):

```bash
npm run test -w server
```

## Project structure

```
server/
  index.js              Express app; connects to MongoDB, serves client/dist in prod
  db.js                 mongoose connection + admin seed
  auth.js               JWT helpers + requireAuth middleware
  models/
    User.js Event.js Pass.js   Mongoose schemas
  routes/
    auth.js             login, me, user management
    events.js           event CRUD (+ per-event pass counts)
    passes.js           issue/list/check-in/revoke/QR PNG/WhatsApp send
    public.js           public pass card API (no auth)
    stats.js            dashboard stats
  services/
    whatsapp.js         WhatsApp Business Cloud API client (stub until configured)
    mainSystem.js       Main-system integration client (claim QR by phone)
  scripts/
    smoke-test.mjs      API test suite against in-memory MongoDB
client/
  src/
    App.jsx             routing (protected routes, lazy scanner)
    api.js              fetch helpers, token storage, date parsing
    components/Layout.jsx
    pages/              Login, Dashboard, IssuePass, PassList, ScanPass, Events, PublicPass
    index.css           saffron-themed styles + print styles
```

## API overview

| Method | Endpoint                    | Auth | Description                     |
| ------ | --------------------------- | ---- | ------------------------------- |
| POST   | `/api/auth/login`           | no   | Returns JWT                     |
| GET    | `/api/auth/me`              | yes  | Current user                    |
| GET/POST | `/api/auth/users`         | yes* | List / create users (admin)     |
| GET/POST | `/api/events`            | yes  | List / create events            |
| GET    | `/api/passes`               | yes  | List passes (q/status/event filters) |
| POST   | `/api/passes`               | yes  | Issue a pass (QR generated locally or claimed from main system; quota-enforced) |
| GET    | `/api/passes/:id`           | yes  | Pass detail incl. QR SVG        |
| GET    | `/api/passes/:id/qr.png`    | yes  | Download QR as PNG              |
| POST   | `/api/passes/:id/send-whatsapp` | yes | Send QR to donor via WhatsApp |
| POST   | `/api/passes/:token/check-in` | yes | Validate & check in             |
| POST   | `/api/passes/:id/revoke`    | yes  | Revoke a pass                   |
| GET    | `/api/stats`                | yes  | Dashboard counts + per-user quota |
| GET    | `/api/public/passes/:token` | no   | Public pass card data           |
| GET    | `/api/health`               | no   | Health check                    |

## Main-system integration

This app is the devotee-facing layer for **Hare Krishna Visakhapatnam**. The QR passes
issued here can be backed by the main **ISKCON Seva Pass system**
(`HkmVizagTech/iskcon-seva-pass-backend` — with its admin dashboard and the
`HkmVizagTech/iskcon-scanner` volunteer scanner at the gate).

- **Standalone mode (default):** `MAIN_SYSTEM_API_URL` is unset → this app generates and
  validates its own QRs, exactly as before.
- **Integrated mode:** set `MAIN_SYSTEM_API_URL` (+ `MAIN_SYSTEM_API_KEY` and
  `MAIN_SYSTEM_EVENT_ID`) in `server/.env`. Then issuing a pass claims a QR from the main
  system by the invitee's phone number, and the pass card shows the main system's QR image —
  the gate scanner (`iskcon-scanner`) validates it there. Devotee quota still applies.
- The main system's integration API is **already implemented** in
  `iskcon-seva-pass-backend` — no endpoint work needed on that side, just config:
  set `INTEGRATION_API_KEY` there and deploy it.

### Main-system API contract (already implemented on the main system)

| Endpoint | Request | Response |
| -------- | ------- | -------- |
| `POST /api/integration/generate-volunteer-qr` | Header `x-api-key: <INTEGRATION_API_KEY>`; body `{ event_id, user_phone_number, user_email? }` — find-or-create the holder by phone and return its QR | `{ status: true, message, qr_code: <base64 PNG data URL>, qr_id }` |

Notes:
- `event_id` is matched against the main system's `Event.eventCode` (or `_id`) — this app
  sends `MAIN_SYSTEM_EVENT_ID`.
- The main system's QR is a signed JWT whose payload carries the QR id (`q`). Its gate also
  accepts a bare QR id, so this app's fallback rendering (and its own scanner matching)
  both work with the QR id alone.
- Gate validation is the main system's job (its `iskcon-scanner` + `/api/scan`); Seva Pass
  check-in is local only — there is no third-party "consume" endpoint on the main system.
- Errors come back as `{ status: false, message }` with a 4xx/5xx status.

### Env vars for integration

```env
MAIN_SYSTEM_API_URL=https://your-main-backend.example.com
MAIN_SYSTEM_API_KEY=<the main system's INTEGRATION_API_KEY>
MAIN_SYSTEM_EVENT_ID=EVT2026   # eventCode of the event to issue against
```

## Workflow

1. Devotee logs in and creates an event (optional but recommended).
2. Devotee issues a pass within their quota — a QR is generated instantly (or claimed from the main system); download the PNG, print the pass card (`/pass?t=<token>`), or later send it straight to the donor's WhatsApp.
3. The donor scans the QR with any phone camera to see their pass card.
4. At the venue, the main system's own scanner (`iskcon-scanner`) validates the QR at the gate; in this app, **Scan & Validate** also works for local passes and records the check-in timestamp.
5. When a pass is no longer needed, revoke it to free up quota for a new pass.
