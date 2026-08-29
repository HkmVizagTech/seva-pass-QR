# Seva Pass QR — Complete Guide

**ISKCON Visakhapatnam · Gate Entry Pass System**

---

## What Is This?

Seva Pass QR is a digital entry pass system for ISKCON Visakhapatnam events (festivals, programs, etc.). It lets authorised users issue QR-coded passes to devotees, sponsors, donors, VIPs, and general public. The QR is scanned at the gate by the **iskcon-scanner** app to grant or deny entry based on what the pass allows.

The system has **three parts** that work together:

| Part | What It Does | Where It Runs |
|------|-------------|---------------|
| **This app** (`seva-pass-QR`) | Issuing passes, viewing them, sharing via WhatsApp | Vercel (web) + APK (mobile) |
| **Main system** (`iskcon-seva-pass-backend`) | QR generation, gate validation, holder database, reports | Railway |
| **Scanner** (`iskcon-scanner`) | Scans QR at the gate, checks access, grants/denies entry | Vercel (PWA on tablet/phone at gate) |

**Admin dashboard** (`iskcon-admin-dashboard`) is a separate site for managing events, entry points, categories, bulk imports, and reports on the main system.

---

## How a Pass Gets Issued — End to End

```
1. Devotee opens the app → logs in
2. Goes to "Issue Pass" → picks the event
3. Enters devotee details (name, phone, email) + picks pass type
4. Taps "Issue Pass"
5. App calls the main system → QR is generated (signed JWT)
6. QR image appears on screen → can download PNG or share via WhatsApp
7. The devotee shows the QR at the gate
8. Scanner reads the QR → validates against main system → grants or denies entry
```

---

## Who Can Do What

### Admin

The admin sees everything. After logging in:

| Page | What They Can Do |
|------|-----------------|
| **Dashboard** | See total passes, unused, used, revoked, events count, users count, quota usage |
| **Issue Pass** | Issue passes for any pass type |
| **All Passes** | See every pass ever issued — search by name/phone/email, filter by status/event, see who issued each pass ("Issued by" column), revoke passes, download QR, send via WhatsApp |
| **Events** | Create events, sync events from the main system |
| **Devotees** | Create/edit/delete app users, set quotas (global or per-event), assign short codes |

### Devotees (Preachers)

Devotees see only their own data. After logging in:

| Page | What They Can Do |
|------|-----------------|
| **Dashboard** | See their stats — My Devotees count, Active Passes, how many scanned at gate, Scan Rate %, breakdown by festival |
| **Issue Pass** | Issue passes (their name gets attributed automatically) |
| **My Passes** | See all devotees they issued passes for — search, filter by category/bahumana received/event, view QR images |
| **Events** | View live/upcoming events (read-only) |

Devotees **cannot** see other devotees' holders, manage users, or revoke passes.

---

## Pass Types (Categories)

Each event has categories that determine what gates a pass can be used at. The categories are set up on the main system and fetched live:

| Code | Pass Type | Entry Points | Who Gets It |
|------|-----------|-------------|-------------|
| **SP** | Sponsor | ALL gates (main gate, darshan, prasadam, bahumana, VIP) | Major donors / sponsors |
| **VP** | VIP Guest | Main gate, darshan, VIP seat | Special guests |
| **DN** | Donor | Darshan, prasadam | Donors |
| **VL** | Volunteer | Main gate, prasadam | Service volunteers |
| **GN** | General Public | Darshan only | Walk-in public |
| **INV** | Invitee | Configurable (admin sets it) | Invited devotees |

**Important:** A pass can ONLY be scanned at gates that belong to its category. A General Public pass will be denied at the main gate if "Main Gate" is not in GN's entry points. Admins should configure entry points on the admin dashboard so that all pass types can enter through the main gate.

---

## The QR Code — What's Inside

The QR code is **not a website link**. It is a digitally signed token (JWT) that the scanner reads and validates. Here's what it contains:

| Field | What It Means |
|-------|--------------|
| `q` | The Pass ID (e.g. `ISK-TSTP-SP-00013742`) |
| `e` | Event identifier (short) |
| `h` | Holder identifier (short) |
| `n` | Devotee name (for display) |
| `p` | Entry points this pass is allowed at |

The QR is signed with a secret key so it cannot be forged. If someone tries to create a fake QR, the scanner will reject it as "Invalid QR".

---

## Gate Scanning — What Happens When You Scan

When a gate operator scans a QR, the scanner app checks these things in order:

| Step | Check | If It Fails |
|------|-------|-------------|
| 1 | Is this a valid QR (correct signature)? | "Invalid QR code" |
| 2 | Does this pass exist in the system? | "Invalid QR code" |
| 3 | Is the pass still active (not revoked/expired)? | "Pass revoked" or "Pass expired" |
| 4 | Is this the right event? | "This pass is for a different event" |
| 5 | Is the event happening now? (date/time check) | "Gate not open yet" or "Event has ended" |
| 6 | Is this gate in the pass's allowed entry points? | "Not in your pass" |
| 7 | Has this pass already been used at this gate? | "Already scanned here" |
| 8 | Is there a prerequisite gate that must be scanned first? | "Scan prerequisite first" |
| 9 | Is the gate at full capacity? | "Capacity full" |

If all checks pass → **entry granted** (green beep/flash on scanner).

---

## Pass Lifecycle — From Issue to Entry

```
ISSUED (status: active/unused)
  │
  ├── Scanned at gate → status: used (entry confirmed)
  │
  ├── Admin revokes → status: revoked (QR becomes invalid)
  │
  └── Event ends → status: expired
```

- Once a pass is **used** at a gate, it cannot be un-used.
- Once **revoked**, the QR stops working immediately.
- A **revoked** pass frees up the devotee's quota so they can issue a new one.

---

## WhatsApp Sharing

When a pass is issued, the QR can be sent to the devotee via WhatsApp:

**On the mobile app (APK):**
- The app opens WhatsApp directly with the QR image attached
- The devotee receives the image in the chat

**On the web browser:**
- Opens WhatsApp Web with a text message containing the pass link
- The devotee clicks the link to view their pass card

**Server-side WhatsApp (if configured):**
- Uses the WhatsApp Business API to send the QR image directly to the phone number
- Requires `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` to be set

---

## The Public Pass Card

Every pass has a shareable link (like `https://sevapassexample.com/pass?t=abc123`). Anyone with this link can:

- See the pass holder's name, pass type, event name, dates
- View the QR code
- Print the pass

No login needed. This is how devotees can view their pass if they don't have the app.

---

## Quota System

Each app user (devotee) has a limit on how many passes they can issue:

- **Default quota:** 30 passes
- **Admin can set:** Global quota + per-event quotas
- **Per-event quota overrides** the global quota for that specific event
- **Revoking** a pass frees up quota
- **Devotees (preachers) are NOT quota-limited** — the main system manages their issuance

The Issue Pass form shows a progress bar: `15 / 30 used`. When the quota is reached, the user sees "Quota reached — revoke an unused pass to issue more."

---

## Bahumana (Prasad) Status

"Bahumana received" tracks whether a devotee has received their gift/prasad at the bahumana desk. This is **not a manual checkbox** — it is automatically determined by the gate system:

- When a devotee's QR is scanned at the **Bahumana Desk** entry point and the scan is **granted**, the system marks them as "bahumana received"
- The timestamp is recorded automatically
- Devotees (preachers) can filter their "My Passes" list to see who has and hasn't received bahumana

| What You See | Meaning |
|-------------|---------|
| `Received · 17 Aug 2026, 10:30 AM` | Scanned and granted at the bahumana desk |
| `—` | Has not visited the bahumana desk yet |

**Bahumana Tiers** (Sponsors only): Sponsors get a tier (A, B, C) that determines which gift/kit they receive at the desk. Tier A gets the highest value gift.

---

## Events — How They Sync

Events are created on the **admin dashboard** (`iskcon-admin-dashboard`) and automatically synced to this app:

1. Admin creates an event on the admin dashboard (with dates, venues, entry points)
2. This app auto-syncs events every time the Events page is loaded
3. Admin can also manually sync from the app's Events page
4. Only **live/upcoming** events appear when issuing passes

---

## Three Systems, How They Connect

```
┌─────────────────────────────────────────────────┐
│              THIS APP (seva-pass-QR)            │
│  "I want to issue a pass to a devotee"          │
│                                                  │
│  Login → Issue Pass → Enter details → Submit     │
└──────────────────────┬──────────────────────────┘
                       │ API call
                       ▼
┌─────────────────────────────────────────────────┐
│           MAIN SYSTEM (iskcon-seva-pass-backend)│
│  "Generating QR and storing holder data"        │
│                                                  │
│  Creates Holder → Creates QRPass → Generates QR │
│  Signs QR with secret key → Returns QR image    │
└──────────────────────┬──────────────────────────┘
                       │ QR image returned
                       ▼
┌─────────────────────────────────────────────────┐
│              THIS APP (seva-pass-QR)            │
│  "Showing QR to the devotee"                    │
│                                                  │
│  Displays QR → Download PNG → Share WhatsApp    │
└──────────────────────┬──────────────────────────┘
                       │ Devotee shows QR at gate
                       ▼
┌─────────────────────────────────────────────────┐
│              SCANNER (iskcon-scanner)            │
│  "Is this person allowed in?"                   │
│                                                  │
│  Scans QR → Validates with main system          │
│  Checks entry point → Grants or denies entry    │
└──────────────────────┬──────────────────────────┘
                       │ Scan result logged
                       ▼
┌─────────────────────────────────────────────────┐
│           MAIN SYSTEM (iskcon-seva-pass-backend)│
│  "Recording the scan"                           │
│                                                  │
│  Logs scan → Updates pass status                │
│  Tracks bahumana if at bahumana desk            │
└─────────────────────────────────────────────────┘
```

---

## Login — Two Types of Accounts

### Admin / Devotee Account
- Created by the admin on the Devotees page
- Login: username + password
- These are local accounts managed within the app
- Devotees have quotas; admin does not

### Preacher Account (from Main System)
- Created on the admin dashboard (`iskcon-admin-dashboard`)
- Login: email or phone + password
- These accounts exist on the main system
- When logged in through this app, they see "My Passes" with their attributed holders
- Not quota-limited

**Note:** Currently the login page shows a single username + password form. Preacher login is available via the API but not yet visible in the UI. Contact the admin to set up preacher access.

---

## Frequently Asked Questions

**Q: Can I issue a pass without a phone number?**
A: No. A phone number is required because the main system uses it to identify the devotee.

**Q: What if the main system is down?**
A: The app shows an error: "Could not generate gate QR". Passes cannot be issued when the main system is unreachable.

**Q: Can I revoke a pass after it's been used at the gate?**
A: Yes, but the QR will already be marked as "used" in the scanner logs. Revoking it prevents further use at other gates.

**Q: Why was my pass denied at the gate?**
A: Common reasons:
- The pass type doesn't include that gate (e.g. General Public can't enter through VIP gate)
- The event hasn't started yet or has ended
- The pass was already scanned at that gate (single-use)
- The QR image is unclear — try downloading a fresh PNG

**Q: How do I see who I've issued passes for?**
A: Go to "My Passes" (devotees) or "All Passes" (admin). Use the search and filter options to find specific devotees.

**Q: How does the system know if prasad/bahumana was received?**
A: When the devotee's QR is scanned at the Bahumana Desk entry point by the gate operator, it's automatically recorded. No manual entry needed.

**Q: Can I issue passes for multiple events?**
A: Yes. Select the event from the dropdown when issuing. Each event has its own categories and entry points.

**Q: What's the difference between "Active" and "Used" pass status?**
A: "Active" means the pass hasn't been scanned at any gate yet. "Used" means it has been successfully scanned at least once.
