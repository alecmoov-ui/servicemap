# Moov Service Network

A prototype web app for managing Moov Pool's US warranty service network: map your
authorized service stations, match them to an end-user's location by **product type
+ service radius**, send/log **dispatch requests**, and analyze network
**performance**. Built from the 37 stations in your current spreadsheet.

> **Status:** clickable prototype (frontend-only). All data lives in your browser.
> The baked-in master list of 37 stations is protected; your edits and dispatches are
> stored separately and can be reset to the clean master at any time. See
> [Going to production](#going-to-production) for the path to a real multi-user system.

---

## Quick start

This is a website that runs on **your own computer** — it is not hosted anywhere yet.
A `localhost` link only works on the machine that is actually running the dev server,
so you have to install it locally first (this is why a bare `localhost:5173` link
"refused to connect").

#### Zero-install option (no Node, no admin rights)
If you can't install Node (e.g. locked-down work laptop), use the **single-file
build** instead — it's the entire app compiled into one self-contained HTML file:

- Grab **`Moov-Service-Network-Demo.html`** from the repo root and **double-click it**
  to open in any browser. Nothing to install.
- The map tiles and live address search still need internet. If your network blocks
  them, use the **"Try an example"** location buttons in the sidebar — they have
  coordinates built in and run the full flow (ranked list, radius circles, dispatch,
  analytics) offline.
- To regenerate the file after changing the code: `npm run build` (output is
  `dist/index.html`; copy it to `Moov-Service-Network-Demo.html`).

The full dev setup below is only needed if you want hot-reload while editing.

## What you need to install (one time)
1. **Node.js LTS (v18 or newer)** — includes `npm`. Download: <https://nodejs.org>
   (this was built/tested on Node 22). Verify with `node -v`.
2. **Git** — to download the code. Download: <https://git-scm.com>
   *(Alternative: on GitHub, use the green **Code → Download ZIP** button on the
   `claude/loving-carson-kx6f00` branch and unzip it — then skip the `git clone` step.)*

That's the entire toolchain. Everything else (React, Leaflet, Vite, Recharts) is
pulled in automatically by `npm install` and is version-pinned in `package.json`.
**No API keys or accounts are required** for the prototype.

### Run it
```bash
git clone <your-repo-url>
cd servicemap
git checkout claude/loving-carson-kx6f00

npm install        # downloads dependencies (one time, ~1 min)
npm run geocode    # optional: refine the 37 pins to exact street addresses (one time)
npm run dev        # starts the app
```
`npm run dev` prints a URL like `http://localhost:5173/` — open **that** in your
browser. (Stop the server with `Ctrl+C`.) The map tiles and address search call free
OpenStreetMap services and just need normal internet.

### Pinpoint address pins
The seed ships with **city-center** coordinates so pins show up immediately without
any setup. To upgrade them to **exact street-level pins**, run once:
```bash
npm run geocode
```
This geocodes all 37 service addresses (OpenStreetMap, no key; ~45s due to the
1 req/sec rate limit) and rewrites `src/data/stations.seed.json` with precise
coordinates. It's safe to re-run. Separately, when you **add a station** in the app
and leave lat/lng blank, it auto-geocodes the address you typed and drops a pinpoint
pin on save.

---

## What it does today

### 1. Map & Dispatch (the core flow)
- **Pick an equipment type** (Heat Pump, Pump, Filter, Salt System, Cleaner, Light).
- **Type the end-user's service address.** It geocodes the address and finds **only**
  stations that (a) are authorized for that product **and** (b) cover the location
  within the radius each station declared at signup. No false positives.
- Results are **ranked by a reliability score** (see below) with a **star rating**,
  acceptance %, completion %, distance, and inventory flag.
- The map zooms to fit and draws **service-radius zone circles** for the matching
  stations; the selected station highlights.
- **Send dispatch request** composes the exact email from `Serviceuse@moovpool.com`
  to the station with **Accept / Decline links**, logs the attempt, and (in this
  prototype) previews the message. Opening the accept/decline link records the
  station's response and moves the job through the funnel.

### 2. Stations
- **Dispatch board** — live cards for every request with status timeline
  (requested → accepted → completed / declined / issue). Advance jobs manually to
  stand in for email-thread replies.
- **Master station list** — every field from your spreadsheet plus the recommended
  additions. **Role-gated:** Admin/DTM can add & edit; Dispatch is read-only. Edits
  to master records are stored as an overlay so the original is never destroyed.

### 3. Zone Coverage
A second map focused on **network density and gaps**, filterable by product (or all):
- **Density heatmap** — every station's service radius is drawn semi-transparent, so
  areas with overlapping stations shade darker (redundant coverage) and thin areas
  stay light.
- **Gap detection** — major US metros are scored against your coverage. Covered metros
  show a green ring; **uncovered metros show a red pin sized by population** = where
  the demand is and you have no one in range.
- **Recruiting targets** — the sidebar ranks uncovered metros by population with the
  distance to your nearest station, plus a stations-by-state breakdown. (The metro
  list is a stand-in for real demand data — units sold / warranty volume by region —
  which would replace it in production.)

### 4. Analytics
- KPIs: active stations, total requests, acceptance rate, completion rate, avg
  time-to-resolution.
- Dispatch funnel, stations-by-state (capacity & gaps), product coverage, and a
  reliability leaderboard.

### Roles (demo switcher, top-right)
| Role | Edit master list | Add stations | Dispatch | Analytics |
|------|:---:|:---:|:---:|:---:|
| **Admin** | ✅ | ✅ | ✅ | ✅ |
| **DTM** (Territory Mgr) | ✅ | ✅ | ✅ | ✅ |
| **Dispatch** | ❌ (read-only) | ❌ | ✅ | ✅ |

### Reliability score
A 0–100 composite from your dispatch funnel: `acceptance × 55 + completion × 35 +
volume boost (up to 10)`. New/unproven stations get a neutral baseline (60) so they
still surface for vetting instead of being buried. The 0–5 star rating is derived from
the same score. Tune the weights in `src/lib/ratings.js`.

> The performance numbers in the prototype are **demo values** generated
> deterministically per station so the ranking and charts are populated. Real numbers
> accrue as you send dispatches.

---

## Data model

Each station carries everything from your sheet — company, address, city/state,
service radius, the six product flags, HVAC cert, proof of insurance, phone, email,
billing address, service type, holds-inventory, notes — plus the dispatch counters
(requests / accepted / completed). See `src/data/stations.seed.json`.

### Recommended fields to start collecting (already in the model/edit form)
Building the network from scratch, capture these at signup — they pay off fast:

- **Coordinates (lat/lng)** — exact, so radius math and pins are precise. The
  prototype seeds *city-center* coordinates; refine to street level (the edit form
  takes lat/lng, or wire the geocoder into the save step).
- **Contract on file + contract expiry** — surface renewals before they lapse.
- **Insurance expiry + W-9 on file** — compliance gating; block dispatch if expired.
- **Status** (active / paused / prospect) — keep prospects on the map for recruiting
  without dispatching to them.
- **After-hours / emergency availability** and **response SLA** — for urgent RMAs.
- **Preferred contact method** and a **secondary contact**.

### Worth adding as you scale
- **Per-product labor rates / flat-fee schedule** and **travel-fee policy** — so
  dispatch shows expected cost and you can reconcile invoices.
- **Capacity/throttle** (max open jobs) so high performers don't get overloaded.
- **Brands/competitor equipment serviced** and **certifications per product**.
- **Languages**, **service-area polygons** (not just a radius) for coastal/rural cases.
- **Document attachments** (signed contract PDF, COI, W-9) on the record.
- **First-right-of-refusal link to the selling dealer** — capture which dealer sold
  the unit so you can route the offer to them first, then fall back to the network.

---

## Going to production

The prototype intentionally has no backend. The realistic next step is a thin
backend so data is shared, protected, and auditable:

- **Backend + database** (Node/Express + Postgres, or Supabase/Firebase). The
  "master list" becomes a write-protected table; all edits go through an API with
  **role checks** (Admin / DTM / Dispatch / read-only) — the exact gates already
  modeled in `src/lib/roles.js`. This is what truly protects the master map from any
  one user damaging it, with full change history.
- **Real email** from `Serviceuse@moovpool.com` via **Microsoft Graph `sendMail`**
  (your mailbox is Microsoft 365). Register an Azure AD app, grant `Mail.Send`, and
  replace `sendDispatchEmail` in `src/lib/email.js` with a backend call. The
  Accept/Decline links become **signed, single-use tokens** validated server-side, so
  a station's click is authenticated and logged automatically.
- **Email-thread ingestion** — a Graph subscription on the mailbox parses replies on
  the dispatch thread to auto-advance jobs to *Completed* or *Issue* and attach the
  conversation to the record (your "side conversation" idea).
- **Geocoding** — for volume, move to Google/Mapbox with a key and cache results;
  swap the single function in `src/lib/geo.js`.
- **Auth** — SSO with your Microsoft 365 tenant; map AD groups to the roles above.

### Suggested roadmap
1. **MVP backend** — Postgres + auth + roles; import the spreadsheet; replace
   localStorage with API calls (the UI is already structured for this).
2. **Real dispatch email** — Graph sendMail + signed accept/decline tokens.
3. **Thread ingestion & SLA timers** — auto-status from replies; overdue alerts.
4. **Recruiting view for DTMs** — heatmap of coverage gaps (uncovered searches /
   states with low capacity) to target where to sign new stations.
5. **Dealer first-right-of-refusal routing** and **cost/invoice reconciliation**.

---

## Project structure
```
scripts/geocode-stations.mjs # one-time: refine seed pins to street level
src/
  data/stations.seed.json   # the 37 stations (protected master list)
  lib/
    geo.js                  # haversine + address geocoding (swap provider here)
    ratings.js              # product list + reliability score / stars
    roles.js                # Admin / DTM / Dispatch permissions
    email.js                # dispatch email composer + pluggable transport
    store.js                # localStorage overlay (edits, adds, dispatches)
    useStore.js             # React hooks bound to the store
  components/
    MapView.jsx             # Leaflet map: pins, radius circles, consumer pin
    DispatchModal.jsx       # dispatch request + email preview
  pages/
    MapPage.jsx             # filter → search → ranked list → dispatch
    AnalyticsPage.jsx       # KPIs, funnel, coverage, leaderboard
    StationsPage.jsx        # dispatch board + master list management
    RespondPage.jsx         # accept/decline link landing
```

**Reset demo data:** the *Reset* button (top-right) clears your local edits and
dispatches and restores the clean 37-station master list.
