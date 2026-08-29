# Seva Pass — Session handoff (Aug 17, 2026)

Deep notes for continuing work. Everything below is the *current* state after this
session's work was committed and deployed.

---

## 1. Architecture — three repos, one org (HkmVizagTech)

| Piece | Local path | GitHub | Live |
|---|---|---|---|
| **App + app server** (this repo) | `D:\projects\seva-pass-QR` (cwd) | `HkmVizagTech/seva-pass-QR` | Web: `https://seva-pass-qr-server.vercel.app` · API: `https://seva-pass-server-production.up.railway.app` · APK at project root |
| **Main system** (backend of record) | `D:\projects\iskcon-seva-pass-backend` | `HkmVizagTech/iskcon-seva-pass-backend` | `https://iskcon-seva-pass-backend-production.up.railway.app` |
| **Admin dashboard** | `D:\projects\iskcon-admin-dashboard` (cloned Aug 17, no changes) | `HkmVizagTech/iskcon-admin-dashboard` | `https://iskcon-admin-dashboard.vercel.app` |
| Gate scanner app | — | `HkmVizagTech/iskcon-scanner` | `https://iskcon-scanner.vercel.app` |

- App = React + Vite + Capacitor (Android APK) + small Express server (MongoDB Atlas).
- Main system = Express + MongoDB + Redis (optional) + JWT. Holds events, categories,
  entry points, holders, QR passes, scan logs, preachers. API-only — no UI.
- Admin dashboard = Next.js 14 (App Router, TypeScript, TanStack Query). Admin CRUD for
  events, holders, preachers, categories, entry points, reports, settings, scanfeed, bahumana view.
- Deploys are **push-to-main**: GitHub → Vercel (web) and Railway (both servers) auto-deploy.

## 2. The integration contract (app → main system)

`server/services/mainSystem.js` in the app repo talks to the main system. Headers:
`x-api-key: <INTEGRATION_API_KEY>` for `/api/integration/*`; Bearer JWT for `/api/preachers/*`.

| Endpoint | Purpose |
|---|---|
| `POST /api/integration/seva-pass/issue` | **Seva Pass app专用.** Claim/create a QR pass. Body: `{ event_id, user_phone_number, user_email?, name?, venue?, category?, preacher?, preacherId? }` → `{ status, qr_code, qr_id }`. `event_id` = event **code** (e.g. `TSTP`). **Category** resolved in priority: requested → GN (General) → "general" → "volunteer". **Preacher** (short code/name) resolved to the preacher account (`preacherId` + name stored on holder). |
| `POST /api/integration/generate-volunteer-qr` | **Bulk volunteer QR.** For the mobile app's bulk generation. Body: `{ event_id, holders: [{user_phone_number, name}...], category? }`. **Do not use from Seva Pass app.** |
| `GET /api/integration/events?status=upcoming\|active\|completed` | List events for sync. Returns `{ _id, name, eventCode, dateStart, dateEnd, venue[], description }`. |
| `GET /api/integration/events/:eventCode/categories` | **New this session.** Pass types for the Issue Pass dropdown: `[{ _id, name, catCode, entryPoints[] }]`. |
| `GET /api/integration/events/:eventCode/venues` | Venue list for the issue form. |
| `POST /api/preachers/login` | `{ email, phone?, password }` → `{ success, token, preacher: { id, name, shortCode } }` (7-day JWT). |
| `GET /api/preachers/me/holders?search&category&bahumana&eventId&page&limit` | The preacher's own holders across ALL events, paginated, with `qrPass` (status, redemptionHistory, deliveryStatus) and **`bahumanaReceived`/`bahumanaAt`** computed. |
| `GET /api/preachers/me/stats` | `{ totalHolders, activePasses, scannedPasses, scanRate, byEvent[] }`. |

## 3. Domain model (main system — the things you'll touch)

- **Preacher** = `User` with `role: "preacher"`, keyed by **`shortCode`** (e.g. `MKGD`), login via email or phone + password. Global — not event-scoped.
- **Holder** (an issued person): `eventId`, `catId` (Category), `preacher` (string) + `preacherId` (ref), `subCategory` (bahumana tier **A/B/C**), `sevaSlotId`, `source` (admin | bulk_import | third_party | self), `venueName`.
- **QRPass**: `qrId` (`ISK-<EVENT>-<CAT>-<serial>` — category code is IN the id), `entryPoints[]` (copied from category), `status` (active/used/revoked/expired), `redemptionHistory[]` (`{ epId, scannedAt, scannedBy, stationLabel, result }`), `deliveryStatus` (pending/sent/delivered/failed).
- **EntryPoint** types: `venue_entry` (Main Gate), `darshan`, `prasadam`, `bahumana` (Bahumana Desk), `vip_seat`, `custom`.
- **Access model**: a pass scans ONLY at stations whose EntryPoint is in its `entryPoints` (from its category). There is no per-pass-type access — the **category** decides. "Bahumana received" = a granted scan at a `bahumana`-type EP (there is no boolean field; it's computed).
- Default per-event categories from the template: SP (Sponsor — all stations, tiers A/B/C), VP (VIP Guest), DN (Donor — darshan+prasadam), VL (Volunteer — gate+prasadam), GN (General Public — darshan only).

## 4. What this session built (all committed + deployed)

**App repo** — commit `75f3768`:
1. **Preacher login**: Login screen has Admin/Devotee (app-local username+password) and **Preacher** (email/phone + password → main system) modes. App server `POST /api/auth/preacher-login` mints an app JWT embedding the main-system token (`main_token`).
2. **My Passes** (role-aware Pass List, `PassList.jsx`): preachers see only their own holders with filters — **search, category (INV/SP/DN/VIP…), bahumana received/not, event** — plus pass status, delivery status, and a **View QR** modal (proxied via `GET /api/preachers/qr/:qrId/image`).
3. **Role-aware Dashboard**: preachers see their main-system stats (my devotees, active passes, scanned, scan rate, by-festival breakdown); admins keep the global view.
4. **Live/upcoming events only**: `GET /api/events?live=1`; **auto-sync from the main system on every events fetch** (no manual "Sync" click needed anymore); Event model stores `date_start`/`date_end`.
5. **Issue Pass UX**: 0 live events → "No live events right now"; **1 event → straight into the details form**; **2+ → "Select an event" screen first**, then the form (with a Change link).
6. **Pass types from the event**: the dropdown fetches the event's categories from the main system and defaults to **Invitee** → General → first.
7. **Short-code attribution**: Devotees page now has a **"Preacher code"** field (e.g. `MKGD`); `User.short_code`; when a devotee issues a pass the code is sent as `preacher` so it lands under that preacher's My Passes.
8. Earlier hardening (still in place): `api.js` falls back to hardcoded `PROD_API`/`PROD_SITE` in the Capacitor shell if `.env.android` vars are missing; token guards; real error messages + "Try again" on Dashboard.

**Main backend** — commit `3b1834b`:
1. `generate-volunteer-qr` accepts `category`, `preacher`, `preacherId`; **resolves the short code/name to the preacher account** (same logic as CSV import, `resolvePreacherFromString`) and backfills attribution on existing holders.
2. `GET /api/preachers/me/holders` gains **category filter** (code/name/id) + **bahumana filter** (yes/no) and returns **`bahumanaReceived` + `bahumanaAt`**.
3. New integration endpoint `GET /api/integration/events/:eventCode/categories`.

**APK**: `seva-pass-debug.apk` at project root (Aug 17 18:27, ~4.37 MB) — contains ALL of the above. Verified by grepping the built JS inside the APK.

## 5. Deployment state (verified live Aug 17)

- App repo pushed (`75f3768`) → Vercel web **confirmed serving new bundle** (contains "preacher-login" / "Preacher code"); Railway app server live (`POST /api/auth/preacher-login` → 400 route exists).
- Main backend pushed (`3b1834b`) → Railway live (`/api/integration/events/TSTP/categories` → 200 with key; `/api/preachers/me/holders` → 401 route exists).
- Both working trees **clean**. `client/.env.android` is **tracked** (committed) — the old "commit it" TODO is done.
- 55 smoke tests pass: `npm run test -w server` (includes preacher login, my holders, short-code attribution, QR proxy).

## 6. Still open / TODO (next session)

- [ ] **Create preacher accounts** on the admin dashboard (Preachers → Add, with short codes) — REQUIRED before preacher login works end-to-end. Codes must match the ones on app devotee accounts.
- [ ] **Create the Invitee (INV) category** on TSTP (and any future event) in the main admin → Event → Categories — otherwise app-issued passes default to General (GN).
- [ ] Test the live preacher login once a preacher account exists (I can verify end-to-end).
- [ ] Change the default admin password (`admin`/`admin123`) — Devotees page → Edit.
- [ ] Optional: signed release build for Play Store.
- [ ] Optional: real events currently on TSTP — check entry-point coverage for the categories you actually want app passes to scan at (e.g. add Main Gate to GN/INV if app-issued passes should enter the gate).

## 7. Key commands & gotchas

- **APK build** (repo `build:apk` script uses cmd.exe syntax — this is the bash equivalent):
  ```bash
  cd client && npx vite build --mode android && npx cap sync android
  export JAVA_HOME="$LOCALAPPDATA/Android/jdk/jdk-21.0.12+8"
  cd android && ./gradlew assembleDebug   # JDK 17 also present
  cp app/build/outputs/apk/debug/app-debug.apk ../../seva-pass-debug.apk
  ```
- **Tests**: `npm run test -w server` (spawns a real server against MongoMemoryServer + a stub of the main system on :4099; refuses to run if port 4000 is busy).
- **Dev**: `npm run dev` at repo root (server :4000 + Vite client).
- **Deploy** = commit + push to `main` (Vercel + Railway auto-deploy). Verify with curl: preacher-login → 400, categories → 200 with key.
- **Gotchas**:
  - App server env: `MAIN_SYSTEM_API_URL`, `MAIN_SYSTEM_API_KEY`, `MAIN_SYSTEM_EVENT_ID` (fallback event code) in `server/.env` (not committed).
  - Preacher sessions: the app JWT carries `main_token`; app `/api/auth/me` serves the preacher profile from the JWT (preachers don't exist in the app's User collection).
  - Preacher-issued passes: `issued_by = null` in the app DB (their id is a main-system id); attribution lives on the main system (`holder.preacherId`).
  - Pass validation: `Pass.issued_by` is a strict ObjectId — never write foreign ids there.
  - Event access is decided by **category → entryPoints**, never by the app's pass-type label.
  - Native builds: the APK needs `client/.env.android` values; if missing, `api.js` falls back to the hardcoded production URLs.

## 8. Useful file paths

- App → main-system integration client: `server/services/mainSystem.js`
- App routes: `server/routes/` (auth, events, passes, stats, public, **preachers**)
- App client pages: `client/src/pages/` (Login, Dashboard, IssuePass, PassList, Events, Users)
- Main backend integration: `D:\projects\iskcon-seva-pass-backend\src\controllers\integrationController.js`
- Main backend preachers: `...\src\controllers\preacherController.js` (+ `routes/preachers.js`)
- Main backend models: `...\src\models\` (User, Holder, QRPass, Category, EntryPoint, Event)
- Admin dashboard preachers page: `D:\projects\iskcon-admin-dashboard\app\(dashboard)\preachers\page.tsx`
