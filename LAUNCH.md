# Launch & Operations Guide

Everything needed to run Moov Service Network for real and to keep changing it after launch.

## 1. What to buy (and where)

| Item | Where | Cost | Needed? |
|------|-------|------|---------|
| **Web host — Render "Starter"** | render.com | ~**$7/mo** | Yes (always-on) |
| **Persistent disk (1 GB)** | Render (in the blueprint) | ~**$0.25/mo** | Yes (data never resets) |
| **Custom domain** e.g. `service.moovpool.com` | you already own `moovpool.com` | **$0** (subdomain) | Optional |
| **SSL / HTTPS** | Render (automatic) | **$0** | Included |
| Map tiles + address lookup | OpenStreetMap | **$0** at your volume | Included |
| Dispatch email | Zendesk (already yours) | — | N/A here |

**Bottom line: ≈ $7–8/month**, one payment method on Render. No other purchases.

## 2. Deploy it (one time, in the browser)

1. Go to **render.com** → sign in **with GitHub** → authorize access to `alecmoov-ui/servicemap`.
2. **New +** → **Blueprint** → pick the **servicemap** repo. Render reads `render.yaml`.
3. It shows the `moov-service-network` service (Starter + 1 GB disk). Add your **payment method** when prompted.
4. Set **`SEED_PASSWORD`** = the password you'll first log in with.
5. **Apply / Create** → wait ~3–5 min for the build → you get a URL like
   `https://moov-service-network.onrender.com`.
6. Open it, sign in as **`admin@moovpool.com`** with your `SEED_PASSWORD`, and **change that
   password immediately** (top-right → *Password*).

### (Optional) Brand it with your domain
Render → the service → **Settings → Custom Domains** → add `service.moovpool.com`. Render shows
one DNS record; whoever manages `moovpool.com` DNS adds it. SSL issues automatically.

## 3. Set up your team's logins

You (admin) create everyone else — no one self-registers.

1. Sign in as an admin → **Users** tab → **+ Invite user**.
2. Enter their **name**, **email** (use their real Microsoft/work email), **role**, and a
   **temporary password**.
3. Share the temp password with them (in person / secure message).
4. On their **first login they're forced to set their own password** — you never know it.

**Roles:**
- **Admin** — everything: edit master list, manage users, backups, activity log.
- **DTM (Territory Manager)** — add/edit stations, log service events, import/export.
- **Dispatch** — find centers + log service events; read-only on the master list.

Forgot a password? An admin opens **Users → Edit → set a new temp password**; that user is
again forced to change it on next login.

## 4. How your team accesses it

It's a website. Everyone just opens the **URL** in any browser (Chrome/Edge/Safari, desktop or
phone) and signs in. Nothing to install. Tip: in Chrome/Edge, **⋮ → Install this site as an app**
puts a desktop icon that opens it in its own window.

## 5. Making edits after launch (via Claude Code)

Yes — you keep changing it through Claude Code, exactly as we've been doing:

1. Tell Claude what you want changed.
2. Claude edits the code on the working branch, runs the tests + build, and pushes.
3. **GitHub Actions CI** checks it; **Render auto-deploys** the new version in a few minutes.
4. Your data is untouched by deploys (it lives on the persistent disk).

**Safety:**
- Every change is a Git commit — we can **roll back** to any prior version instantly
  (`release/v1.0` is a tagged restore point; hosts also keep deploy history).
- **Data** is protected separately: **Export CSV** and **Backups → snapshot** (Stations tab),
  plus the scheduled `npm run backup`.
- Tests + CI catch breakage before it deploys.

To start a new session later: open Claude Code on this repo and describe the change. It picks up
the same codebase and conventions (documented in `CLAUDE.md`).
