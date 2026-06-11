# CLAUDE.md — working agreement for this repository

Guidance for any future Claude (or human) session making changes here. The goal is
to extend the app **without breaking the parts that already work.**

## What this is
Moov Service Network: a shared, login-gated web app to manage an authorized US pool-
equipment warranty service network — map + dispatch, coverage/gap analysis, analytics,
and station/user management. Full-stack: React/Vite client + Express/SQLite API.

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
   Roles: `admin`, `dtm`, `dispatch`. Keep both lists in sync if you change permissions.
2. **Master station records (`is_master = 1`) can be edited but never deleted.** The
   delete route rejects them. Don't add a bypass.
3. **Accept/decline tokens are signed and single-use** (`tokens.js` + the `respond`
   route + `dispatches.token_used`). Don't make the respond endpoint require auth — the
   external station is not a logged-in user.
4. **Dispatch counters** (`dispatch_requests/accepted/jobs_completed`) update only via
   `dispatchService.advance` / dispatch creation, and only on first transition. Don't
   double-count.
5. **Never commit secrets or the database.** `.env` and `server/data/` are gitignored.
6. **Email is pluggable** (`email.js`): `log` (default), `smtp`, `graph`. Adding a
   transport means editing only that file.

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
