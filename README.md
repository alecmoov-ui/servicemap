# Moov Service Network

A full-stack web app for managing Moov Pool's US warranty service network: map your
authorized service stations, match them to an end-user's location by **product type +
service radius**, send and track **dispatch requests**, spot **coverage gaps**, and
analyze network **performance** — with real accounts, roles, and a shared database.
Seeded from the 37 stations in your spreadsheet.

- **Frontend:** React + Vite + Leaflet (the map, dispatch, coverage, analytics screens).
- **Backend:** Node + Express + SQLite — JWT auth, server-enforced roles, a protected
  master station list, dispatch records with signed accept/decline tokens, and a
  pluggable dispatch-email transport.

---

## Running it

You need **Node.js 18+** (`node -v`) and **Git**. This is a real client/server app, so
it runs on a machine where you can run Node (your dev box, a server, or a cloud host) —
not by double-clicking a file. No API keys required to run locally.

```bash
git clone <your-repo-url>
cd servicemap
git checkout claude/loving-carson-kx6f00

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
| `dtm@moovpool.com` | **DTM** | edit/add stations, dispatch, analytics |
| `dispatch@moovpool.com` | **Dispatch** | dispatch + read-only on the master list |

> Change the seed password by setting `SEED_PASSWORD` before the first run, or manage
> real users in the `users` table. **Set a strong `JWT_SECRET` in production.**

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

### Map & Dispatch
Pick an equipment type, enter the end-user's address (geocoded via the backend), and get
**only** stations that service that product **and** cover the location within their
declared radius — ranked by reliability with a star rating. The map draws service-radius
zone circles; "Send dispatch request" creates a logged dispatch and composes the email
from `Serviceuse@moovpool.com` with **signed Accept/Decline links**.

### Zone Coverage
A second map showing **coverage density** (overlapping radii shade darker) and **gap
detection** against major US metros — uncovered metros appear as red pins sized by
population, with a ranked recruiting-target list. Filterable by product.

### Analytics
Network KPIs, the requested→accepted→completed funnel, stations-by-state, product
coverage, average time-to-resolution, and a reliability leaderboard.

### Stations
A **dispatch board** (live status timelines) and the **master station list**. Editing is
**role-gated and enforced on the server**: Dispatch is read-only; DTM/Admin can edit and
add. Master (seed) records can be edited but never deleted — the API rejects it — so the
master map can't be destroyed.

### Roles & reliability
Permissions live in `server/src/auth.js` (enforced) and `src/lib/roles.js` (UI gating).
The 0–100 reliability score (`src/lib/ratings.js`) blends acceptance, completion, and
volume; new stations get a neutral baseline so they still surface. Seed performance
numbers are demo values; real numbers accrue as you dispatch.

---

## How dispatch + the accept/decline loop works
1. A dispatcher sends a request → a `dispatches` row is created, the station's request
   counter increments, and the email is composed with two **signed, single-use tokens**.
2. The station clicks **Accept** or **Decline** in the email → lands on the public
   `/#/respond/<token>` page → the backend verifies the token and records the response
   **once** (re-clicks are no-ops). Counters update automatically.
3. On completion, the station replies to the email thread; a dispatcher marks the job
   **Completed** (or **Issue**) on the board. (Auto-ingesting thread replies is the next
   step — see below.)

### Sending real email
Default is **log-mode** (the composed email is shown in the UI and server log; nothing is
sent). Configure a transport via `server/.env` (see `server/.env.example`):
- `EMAIL_TRANSPORT=smtp` with the `SMTP_*` vars — sends immediately via SMTP.
- `EMAIL_TRANSPORT=graph` — Microsoft Graph `sendMail` as `Serviceuse@moovpool.com`
  (Microsoft 365). Register an Azure AD app, grant `Mail.Send`, then implement the marked
  section in `server/src/email.js`. The token links already work as-is.

---

## Project structure
```
src/                         # React client
  lib/
    api.js                   # API client (JWT, error handling)
    AppContext.jsx           # auth + data provider (replaces localStorage)
    geo.js / ratings.js / roles.js
  pages/  MapPage, CoveragePage, AnalyticsPage, StationsPage, LoginPage, RespondPage
  components/  MapView, DispatchModal
  data/  stations.seed.json (the 37 stations), metros.js
server/                      # Express + SQLite API
  src/
    index.js                 # app entry; serves API + built client
    db.js                    # schema + row<->API mapping
    seed.js                  # seeds 37 stations + demo users
    auth.js                  # JWT + role enforcement
    tokens.js                # signed accept/decline tokens
    email.js                 # pluggable transport (log/smtp/graph)
    dispatchService.js       # status transitions + counter updates
    routes/  auth, stations, dispatches, respond, geocode
  .env.example
scripts/geocode-stations.mjs # one-time pin refinement
```

---

## What's next (roadmap)
1. **Real dispatch email** — flip on SMTP or wire the Microsoft Graph path.
2. **Email-thread ingestion** — a Graph subscription parses replies to auto-advance jobs
   to *Completed*/*Issue* and attach the conversation to the record.
3. **User management UI** — admin screen to invite TMs/dispatchers (table + roles exist).
4. **Demand-weighted gaps** — replace the metro list with your units-sold / RMA volume by
   region so coverage gaps reflect where failures will actually happen.
5. **Dealer first-right-of-refusal routing** and **cost/invoice reconciliation**.
6. **Postgres** — swap `server/src/db.js` when you outgrow SQLite.
