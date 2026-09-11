# CLAUDE.md — working agreement for this repository

Guidance for any future Claude (or human) session making changes here. The goal is
to extend the app **without breaking the parts that already work.**

## What this is
Moov Service Network: a shared, login-gated web app to manage an authorized US pool-
equipment warranty service network — find authorized centers by product + radius,
coverage/gap analysis, performance analytics, document storage, and station/user
management. Full-stack: React/Vite client + Express/SQLite API.

**Dispatching and dispatch emails live in Zendesk, NOT in this app.** Do not
reintroduce dispatch/email/accept-token features. Performance data is entered manually
via the per-station **Service Log** (`service_events`), copied from resolved Zendesk
tickets; station performance and all analytics are DERIVED from those rows.

## Run / test / build (always do these before committing)
```bash
npm run setup        # install client + server deps
npm run dev:all      # client :5173 + API :3001
npm --prefix server test   # backend test suite — MUST pass
npm run build        # client must build clean
```
CI (`.github/workflows/ci.yml`) runs the tests + build on every push. **Do not merge a
change that makes CI red.**

## Architecture (and where things live)
- **Client** `src/` — React. Data/auth flow through `src/lib/AppContext.jsx` (do NOT
  reintroduce localStorage for shared data). API calls go through `src/lib/api.js`.
  Pages in `src/pages/`, map bits in `src/components/`.
- **Server** `server/src/` — Express. Entry `index.js` -> `app.js` (`buildApp()` is what
  tests import, so keep it side-effect-light beyond seeding). Routes in `routes/`.
  DB schema + row↔API mapping in `db.js`. Auth/roles in `auth.js`.
- **Data** seed list `src/data/stations.seed.json` (the 37 stations); `metros.js` powers
  coverage gaps.

## Invariants — do not break these
1. **Roles are enforced on the SERVER** (`server/src/auth.js`, `requirePermission`). UI
   gating (`src/lib/roles.js`) is convenience only — never rely on it for security.
   Roles: `admin`, `dtm` (same as admin), `dispatch` and `sales` (view-only). Keep both
   permission lists in sync.
2. **Master station records (`is_master = 1`) can be edited but never deleted.** The
   delete route rejects them. Don't add a bypass.
3. **Performance is derived, not stored as counters.** `computePerfMap()` aggregates
   `service_events`. Don't add denormalized counter columns back to `stations`.
4. **Adding/editing a station or logging an event must immediately reflect in Map, Zone
   Coverage, and Analytics** — they all read `stations` from `AppContext`, and mutations
   call `loadData()`. Keep that single-source-of-truth flow.
5. **Never commit secrets, the database, uploads, or backups.** `.env` and
   `server/data/` are gitignored.
6. **Documents** are stored on disk under `UPLOAD_DIR` with metadata in
   `station_documents`; downloads are auth-gated and streamed. Keep the persistent disk
   in mind for deployment.
7. **Bulk import** (`importStations.js` + the `/stations/import` route) and **CSV export**
   share one column spec (`FIELD_COLUMNS`/`PRODUCT_COLUMNS`) so the export round-trips as
   the import template — keep them in sync. Every import takes a DB snapshot first
   (`snapshot.js`) and records to `station_imports`. Match by `id` then company name; never
   let import delete or flip `is_master`.

## When you change things
- Touching the DB schema → also update `rowToStation`/`stationToColumns` in `db.js`,
  the seed insert, and add/adjust a test. SQLite has no migrations yet; for production
  schema changes, add an explicit migration step rather than relying on table recreation.
- Adding an endpoint → add a test in `server/test/api.test.js`.
- New runtime config → document it in `server/.env.example` and the README.
- Keep diffs small and focused; match the existing concise style and comment density.

## Conventions
- ES modules everywhere. 2-space indent. Plain CSS in `src/styles.css` (no framework).
- Prefer editing the one pluggable module over scattering provider-specific code.
