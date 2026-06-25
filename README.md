# Moov Service Network

A full-stack web app for managing Moov Pool's US warranty service network: find the
**authorized centers** that can cover a client's address by **product type + service
radius**, spot **coverage gaps**, store each station's **agreement documents**, and
analyze network **performance** — with real accounts, roles, and a shared database.
Seeded from the 37 stations in your spreadsheet.

> **Dispatching and dispatch emails are handled in Zendesk**, where the full ticket
> lifecycle (support → service → dispatch → resolved) is tracked. This tool is for
> *finding* centers and *recording* their performance — the team copies key fields from
> a resolved Zendesk ticket into the per-station **Service Log**, and all analytics
> derive from that.

- **Frontend:** React + Vite + Leaflet (search/map, coverage, analytics, stations screens).
- **Backend:** Node + Express + SQLite — JWT auth, server-enforced roles, a protected
  master station list, document storage, a manual service log, CSV export, and backups.

---

## Running it

You need **Node.js 18+** (`node -v`). The app runs on a machine where you can run Node.

### Easiest way (Windows, no terminal)
1. Download the repo as a ZIP (green **Code** button → **Download ZIP**) and extract it.
2. Double-click **`start-windows.bat`** in the extracted folder. It installs everything
   on first run, starts the app, and opens your browser. Keep the window open while using
   the app. (On macOS: `chmod +x start-mac.command` once, then double-click it.)

> Windows note: if PowerShell says *"running scripts is disabled on this system"* when
> you type `npm`, use **Command Prompt** instead (File Explorer address bar → type
> `cmd`), where `npm` works normally — or just use `start-windows.bat`.

### With a terminal
```bash
git clone <your-repo-url>
cd servicemap

npm run setup       # installs client AND server dependencies
npm run dev:all     # starts the API (:3001) and the client (:5173) together
```

Open the client URL it prints (**http://localhost:5173**) and sign in with a demo
account below. The backend seeds the 37 stations and the demo users automatically on
first run (creating `server/data/servicemap.db`).

### Demo accounts (password `moov1234`)
| Email | Role | Can do |
|-------|------|--------|
| `admin@moovpool.com` | **Admin** | everything, incl. delete non-master stations |
| `dtm@moovpool.com` | **DTM** | edit/add stations, log service events, analytics |
| `dispatch@moovpool.com` | **Dispatch** | log service events + read-only on the master list |

> Change the seed password by setting `SEED_PASSWORD` before the first run. **Set a
> strong `JWT_SECRET` in production.**

### Accounts & passwords
- Every signed-in user can **change their own password** (header → *Password*; min 8 chars).
- When an admin **invites a user** (or resets someone's password), that person is **forced
  to set their own password on next login** — the temp password is single-use.
- Sessions expire after 12h; an expired session cleanly returns you to the sign-in screen.
- For production, sign in as the seeded admin, **change its password**, invite your real
  team, then they each set their own on first login.

### One-process production mode
```bash
npm start           # builds the client, then serves it AND the API from :3001
```
Then open **http://localhost:3001**. (`npm start` runs `vite build` and the Express
server, which serves the built client.)

### Pinpoint address pins
Station pins ship at city-center precision so they show immediately. To refine all 37
to exact street level (OpenStreetMap, no key, ~45s):
```bash
npm run geocode
```
Adding a station in the app and leaving lat/lng blank also auto-geocodes the address.

---

## Features

### Map & Search (find authorized centers)
Equipment types: Pump, Filter, Salt System, Cleaner, Light, and heat pumps split into
**Heat Pump – Electrical** and **Heat Pump – Refrigerant** (only refrigerant work requires
an HVAC license + EPA 608, which the compliance flags enforce).

Pick an equipment type, enter the client's address (geocoded via the backend), and get
**only** stations that service that product **and** cover the location within their
declared radius — ranked by reliability with a star rating. The map draws service-radius
zone circles and shows each center's contact details to route the dispatch in Zendesk.

### Zone Coverage
A second map showing **coverage density** (overlapping radii shade darker) and **gap
detection** against major US metros — uncovered metros appear as red pins sized by
population, with a ranked recruiting-target list. Filterable by product.

### Analytics
Network KPIs, the requested→accepted→completed funnel, stations-by-state, product
coverage, average completion duration, and a reliability leaderboard — all derived from
the Service Log.

### Stations
The **master station list** with the full Schedule A profile (identity, location +
radius, products, HVAC/EPA 608, insurance, parts capacity). Per station you can:
- **Log** a service event (the manual analytics entry — see below).
- **Add / Edit** by **address + service radius (miles)** — click **Locate** and a live
  map preview draws the station's coverage circle (lat/lng are auto-derived; radius is
  per-station, e.g. 15 / 25 / 60 mi). Then **upload documents**: Service Contract,
  Schedule A, HVAC License, Proof of Insurance.
- **Export CSV** of all stations (data backup / Excel) and create **database snapshots**.

Editing is **role-gated and enforced on the server**: Dispatch is read-only on the list
(but can log events); DTM/Admin edit and add. Master (seed) records can be edited but
never deleted — the API rejects it — so the master map can't be destroyed. Adding a
station immediately appears in Map, Zone Coverage, and Analytics.

### Bulk import (Excel/CSV) & versioning
Maintain your station list in Excel and push updates in bulk (**Stations → Import file**):
- **Round-trip:** the **Export CSV** *is* the template (or grab a blank one). Edit/add rows
  in Excel, then upload `.xlsx` or `.csv`.
- **Matching:** rows match on the **`ID`** column — blank `ID` creates a new station (the
  address is auto-geocoded); a filled `ID` updates that station. Fallback: blank `ID` with
  an exact **Company** match updates the existing record (keep company names unique).
- **Only the columns present in your file are touched** — omit a column to leave it alone.
- **Versioning + rollback:** every upload (a) takes a **database snapshot first**, (b)
  **stores the exact file** with date + who, and (c) returns a summary (created / updated /
  errors / warnings). The **Import history** lets you re-download any prior version; roll
  back by re-uploading it or restoring the snapshot (Backups). Imports are role-gated
  (Admin/DTM) and audited.

### Service Log (manual analytics entry)
Because dispatching happens in Zendesk, the team records outcomes here: one quick entry
per resolved ticket (date, product, accepted?, completed?, days-to-complete, ticket #).
Station performance and **all analytics are derived automatically** from these entries —
no running totals to maintain by hand.

### Users (Admin only)
Invite/manage team members and set their role. Guardrails prevent deleting your own
account or removing the last admin.

### Roles & reliability
Permissions live in `server/src/auth.js` (enforced) and `src/lib/roles.js` (UI gating).
The 0–100 reliability score (`src/lib/ratings.js`) blends acceptance, completion, and
volume; new stations get a neutral baseline so they still surface. Seed performance
numbers are demo values; real numbers accrue as the team logs events.

---

## Project structure
```
src/                         # React client
  lib/
    api.js                   # API client (JWT, downloads, error handling)
    AppContext.jsx           # auth + data provider
    geo.js / ratings.js / roles.js
  pages/  Map, Coverage, Analytics, Stations, Users, Activity, Login
  components/  MapView
  data/  stations.seed.json (the 37 stations), metros.js
server/                      # Express + SQLite API
  src/
    index.js                 # entry: starts the server
    app.js                   # buildApp() — used by index.js and the tests
    db.js                    # schema + row<->API mapping + perf aggregation
    seed.js                  # seeds 37 stations + users + demo service log
    auth.js                  # JWT + role enforcement
    activity.js              # audit log helpers
    routes/  auth, stations (incl. service-log/documents/export), geocode, users, activity, admin
  test/api.test.js           # backend integration tests
  scripts/backup.js          # online SQLite backup + retention
  .env.example
scripts/geocode-stations.mjs # one-time pin refinement
Dockerfile, render.yaml      # deployment
.github/workflows/ci.yml     # CI: tests + build on every push
```

---

## Deployment (hosted, persistent, always-on)

The app is meant to run as one shared service your team logs into. It serves the client
and API from a single port and stores data in SQLite on a **persistent disk** so nothing
resets across restarts/redeploys.

### Option 1 — Render (blueprint included)
`render.yaml` defines a web service **with a 1 GB persistent disk** mounted at `/var/data`
(the DB, uploaded documents, and backups all live there). In Render: **New + → Blueprint
→ connect this repo.** `JWT_SECRET` is auto-generated and kept stable.

### Option 2 — Docker (Render/Azure/Fly/VM — anywhere)
```bash
docker build -t moov-service .
docker run -p 3001:3001 -v moovdata:/app/server/data \
  -e JWT_SECRET=$(openssl rand -hex 32) -e APP_URL=https://your-url moov-service
```
The `-v moovdata:/app/server/data` volume is what makes data persist. Azure App Service
(Microsoft-aligned) runs this same image with an attached storage mount.

### Domain & SSL
Optional. The host gives you a working HTTPS URL out of the box (SSL auto-issued/renewed
— nothing to buy or install). To brand it, add a subdomain like `service.moovpool.com` in
the host dashboard and create the one DNS record it shows you; SSL re-issues automatically.

### Required production env vars
`JWT_SECRET` (strong, stable), `DB_PATH`, `UPLOAD_DIR`, and `BACKUP_DIR` (all on the
persistent disk), and `SEED_PASSWORD` (initial admin password). See `server/.env.example`.

## Reliability & maintenance (the safety net)

- **Tests** — `npm --prefix server test` covers auth, role enforcement, master-record
  protection, the service log + derived performance, CSV export, and user management. Run
  before any change.
- **CI** — `.github/workflows/ci.yml` runs tests + build on every push/PR, so a breaking
  change fails *before* it ships.
- **Rollback** — every change is a Git commit; tag releases (`git tag v1.0`) to return to
  a known-good version instantly. Hosts also keep deploy history for one-click rollback.
- **Data protection (3 layers):**
  1. **CSV export** (Stations → Export CSV) — a portable backup of every station you can
     open in Excel and keep alongside your own master sheet.
  2. **Database snapshots** (Stations → Backups, admin) — full save-points you can create
     on demand and download. Also run `npm --prefix server run backup` on a weekly cron
     for automatic save-points (keeps the last 14).
  3. **Restore** is an ops step: stop the server, replace `server/data/servicemap.db`
     with the chosen snapshot, restart. (Uploaded documents live under `UPLOAD_DIR` and
     should be on the same persistent disk / backed up together.)
- **`CLAUDE.md`** — conventions and "don't break these" rules for future changes.

## What's next (roadmap)
1. **Demand-weighted gaps** — replace the metro list with your units-sold / RMA volume by
   region so coverage gaps reflect where failures will actually happen.
2. **Zendesk integration** — optionally pull resolved-ticket data via the Zendesk API to
   auto-populate the Service Log instead of manual entry.
3. **Document expiry reminders** — surface insurance/contract expiry dates that are
   approaching.
4. **Postgres + migrations** — swap `server/src/db.js` when you outgrow SQLite.
