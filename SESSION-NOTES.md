# Seva Pass — Session handoff (Aug 14, 2026)

Continue here tomorrow. Current state:

## It's all working
- **Android app (APK):** `seva-pass-debug.apk` at project root — points to Railway API. Works on any phone, anywhere.
- **Website:** live at `https://seva-pass-qr-server.vercel.app` (auto-updates from GitHub pushes)
- **Backend (Railway):** `https://seva-pass-server-production.up.railway.app` — `PORT=8000` is Railway's normal setting, no issue
- **Database:** MongoDB Atlas (shared by both site and app)
- **Login:** `admin` / `admin123` (default admin on both)

## How to update the app
1. Edit code
2. `npm run build:apk` (in `client/`) → new APK at project root
3. Send APK to phones

## Build tools installed (no admin needed)
- JDK 17 + 21: `C:\Users\admin\AppData\Local\Android\jdk`
- Android SDK: `C:\Users\admin\AppData\Local\Android\Sdk`
- `JAVA_HOME` / `ANDROID_HOME` set for the user

## Still open / TODO (tomorrow)
- [ ] Commit the Railway URL change (`client/.env.android`) to GitHub — was pending confirmation
- [ ] Change the default admin password (Devotees page → Edit) — recommended for security
- [ ] Optional: signed release build for Play Store distribution
- [ ] Optional: swap Vercel hosting to Railway-served site for one URL (not needed, both work)

## Key commands
- `npm run build:apk` — full web build + Android sync + APK compile + copy to root
- `npm run dev` (repo root) — run server + client locally for testing

## Useful file paths
- App → backend URL: `client/.env.android`
- API base logic: `client/src/api.js`
- Railway config: `server/railway.json`
- Capacitor config: `client/capacitor.config.json`
