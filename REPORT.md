# Seva Pass QR — Project Status Report

**Date:** 14 Aug 2026
**Repo:** `github.com/HkmVizagTech/seva-pass-QR` (+ `iskcon-seva-pass-backend`)
**Live app:** https://seva-pass-qr-server.vercel.app — login `admin` / `admin123`

---

## 1. The ecosystem at a glance

| Component | What it is | Where it lives |
|---|---|---|
| **Seva Pass app** | Devotee app: issue pass (name + phone) → get QR from main system. Installable as PWA | Vercel — `seva-pass-qr-server.vercel.app` (repo `seva-pass-QR`) |
| **Main system backend** | Owns events, holders, QR passes, gate validation, WhatsApp delivery | Railway — `iskcon-seva-pass-backend-production.up.railway.app` (repo `iskcon-seva-pass-backend`) |
| **Admin dashboard** | Manage events, holders, categories, holder types (main system's admin) | `iskcon-admin.vercel.app` |
| **Scanner** | Gate validation for volunteers (main system's scanner) | `iskcon-scanner.vercel.app` |

### Working flow (as of now)

```
Devotee → Seva Pass app (login) → Issue Pass: NAME + PHONE
   │  POST /api/integration/generate-volunteer-qr { event_id, user_phone_number, user_email }
   ▼
Main system: finds event → creates holder (tagged "Invitee") → creates QR pass (signed JWT)
   │  └─ sends the QR to the phone via WhatsApp (Flaxxa) — automatic, non-fatal
   ▼
App shows QR (Download PNG / open pass card)
   ▼
Gate: volunteer scans with iskcon-scanner → main system validates
   (signature, event dates, entry point, one-time use, not revoked) → entry granted
```

---

## 2. ✅ Done (all verified working)

### Deployment
- Git → GitHub → **Vercel auto-deploy** on every push to `main`
- Fixed 3 deploy blockers: wrong `rootDirectory` (`server` → repo root), Vite preset not wiring the `/api` function, blank page (SPA rewrite was serving HTML for JS assets)
- Final `vercel.json`: static `client/dist` + `/api` serverless function + SPA fallback; `MONGODB_URI` + `JWT_SECRET` + integration vars set on Vercel

### Integration with the main system
- Seva Pass rewired from the wrong reference (QRsystembackend) to the **real** backend: `generate-volunteer-qr`
- Passes store the main system's `qr_id` + QR image; the pass card and PNG download show **their** QR
- Check-in endpoint matches scanned codes by bare QR id **or** by decoding their signed JWT
- **Fixed the main system's blocker**: `deliveryMethod: "third_party"` wasn't in the QRPass model enum → every first-time claim 500'd. Added to enum → live pass issuing now works end-to-end

### WhatsApp delivery (main system)
- After every claim, the main system sends the QR to the holder's phone via its existing **Flaxxa** integration (`iskcon_common_pass` template) — non-fatal
- Sends on both first-time claims and re-claims

### Holder types
- Integration now auto-attaches the event's **"Invitee"** holder type (by name/code, else the event's default type, else the old `"self"` label). Inert until the type is created

### Product simplification (per request)
- **Removed Scan & Validate** page + `html5-qrcode` dep — gate validation belongs to the main system's scanner
- **Issue form = name + phone only** (everything else defaults server-side)
- **PWA**: manifest, generated icons (`client/scripts/gen-icons.mjs`), service worker (network-first shell, never caches `/api`), installable on phones

### Access control
- **Event creation is admin-only** (server 403 + UI hides the form for devotees)
- **Devotees & Quotas** admin page: create devotees, raise/lower quota, reset password, change role; live used-vs-quota counts; quota blocks over-issuing

### UI / mobile
- Fixed unstyled **name fields** (bare `<input>` didn't match `input[type=text]`; added `input:not([type])`) — verified via headless Chrome at 390px
- Number inputs (quota) styled; autofill recolor fixed; stat-card accents; long tokens wrap
- **Mobile nav**: sidebar → slide-in drawer behind a hamburger; login card no longer overflows; tables contained in scroll wrappers (Dashboard table was missing one)
- Verified at 390×844 viewport: no horizontal overflow on `/`, `/issue`, `/passes`, `/events`

### Tests & hygiene
- 39 smoke tests pass (standalone + integrated mode with a stub of the real endpoint)
- Smoke test now **aborts if port 4000 is taken** (previously could silently run against the prod DB)
- Reverted the wrong-repo changes in `QRsystembackend` (back to original)
- Test data cleaned from prod DBs (test passes/events removed)

---

## 3. ⏳ Pending (needs your action or external setup)

| # | Item | Where | Notes |
|---|---|---|---|
| 1 | **Create the real event** (eventCode e.g. `EVT26`) | iskcon-admin.vercel.app | Include: **General Public category** (code `GN`) + entry points — the integration fails without it |
| 2 | **Add "Invitee" holder type** to that event (code `INV`) | iskcon-admin.vercel.app | Optional; tags integration-issued holders |
| 3 | **Switch event**: `MAIN_SYSTEM_EVENT_ID` `PAN26` → real event code | Vercel env | Then Redeploy |
| 4 | **WhatsApp delivery key**: set `WHATSAPP_API_KEY` (Flaxxa) | Railway | Without it, QR is shown in-app only, no WhatsApp message. Template `iskcon_common_pass` must be approved (likely already, admin flow uses it) |
| 5 | **Verify WhatsApp with a real number** | — | Issue a pass for your own phone → QR should arrive |
| 6 | **Delete test holders** `9999999999 / 9999999998 / 9999999997` | iskcon-admin.vercel.app (PAN26) | From live-testing the integration |

> Note: `MONGODB_URI`, `JWT_SECRET`, `QR_SECRET_KEY`, `INTEGRATION_API_KEY` are already set on Railway (server is up, API-key check passes, DB connected).

---

## 4. 🔭 Planned / nice-to-haves

| Item | Effort | Why |
|---|---|---|
| **Delete-devotee button** on Devotees & Quotas | Small (server endpoint + UI) | Users can't be removed, only edited |
| **WhatsApp delivery status** column in All Passes | Small | See sent/failed per pass (main system webhooks already track this) |
| **Fix `/api/test/whatsapp` path bug** in main system | 1 line (`./src/middleware/auth` → `./middleware/auth`) | Admin WhatsApp test endpoint is currently broken |
| **Better app icon** (Om symbol) | Small | Current icon is a generated placeholder ring |
| **Per-event quotas** | Medium | Quota is currently global per devotee |

---

## 5. Environment variables cheat-sheet

**Vercel (Seva Pass):**
```
MONGODB_URI                 # Seva Pass own DB (Atlas)
JWT_SECRET
MAIN_SYSTEM_API_URL         # https://iskcon-seva-pass-backend-production.up.railway.app
MAIN_SYSTEM_API_KEY         # shared INTEGRATION_API_KEY
MAIN_SYSTEM_EVENT_ID        # PAN26 (testing) → real eventCode later
```

**Railway (main system):**
```
MONGODB_URI                ✅ set
JWT_SECRET                 ✅ set
QR_SECRET_KEY              ✅ set
INTEGRATION_API_KEY        ✅ set   (same value as MAIN_SYSTEM_API_KEY on Vercel)
WHATSAPP_API_KEY           ⏳ needed for QR-by-WhatsApp
INTEGRATION_HOLDER_TYPE    optional (default "invitee")
HELP_CONTACT               optional (WhatsApp template help line)
```
