# Implementation plan

How to take this front-end mock-up and wire it up to live Strava data on
Cloudflare. Ordered roughly in the sequence you'd build it.

## Architecture at a glance

```
Browser (Cloudflare Pages static site)
   │  fetch /api/summary
   ▼
Cloudflare Worker  ──────────────►  Strava API (OAuth2)
   │  - holds client secret + refresh token (never sent to browser)
   │  - refreshes the access token as needed
   │  - fetches activities / gear / stats
   │  - aggregates into the WORKOUTS_DATA shape
   │  - caches in KV / Cache API
   ▼
Cloudflare KV        (tokens, cached summary, athlete goals)
```

Key principle: **the browser never sees Strava tokens.** All Strava calls happen
in the Worker.

---

## Phase 0 — Ship the static front end ✅ (this PR)

- [x] Dashboard, Activities, Gear, Restricted, About pages
- [x] Design system (light/dark, responsive, accessible nav)
- [x] Demo data shaped like the Strava API (`assets/js/mock-data.js`)
- [x] Connect the repo to a Cloudflare Pages project and set the custom domain
      (`workouts.gcameron.com`)

## Phase 1 — Strava API app + OAuth ✅

1. [x] Create an API application at <https://www.strava.com/settings/api>.
   Note the **Client ID** and **Client Secret**; set the callback domain.
2. [x] Do the one-time OAuth authorization-code flow to obtain a **refresh
   token** with the scopes you need: `read`, `activity:read_all`,
   `profile:read_all`.
3. Store secrets — see "Configuring the Worker" below.
   Docs: <https://developers.strava.com/docs/authentication/>

## Phase 2 — Cloudflare Worker API (in progress)

Implemented as **Cloudflare Pages Functions** (`functions/`) rather than a
standalone Worker + route, since it deploys automatically alongside the
static site on the same domain with no separate pipeline or CORS to manage.

- [x] KV namespace created (`workouts-kv`, bound as `WORKOUTS_KV` in
      `wrangler.toml`) for token + response caching.
- [x] Token manager (`functions/_lib/strava.js`): exchanges the refresh
      token for a short-lived access token, caches it in KV until
      `expires_at`, refreshes on demand. Also persists a rotated
      `refresh_token` back to KV, since Strava's can change on use.
- [x] `GET /api/summary` (`functions/api/summary.js` +
      `functions/_lib/aggregate.js`) — fetches athlete/activities/stats/gear
      from Strava, aggregates into the shape below, and caches the result in
      KV for ~15 min to stay well within Strava's rate limits (100 req / 15
      min, 1000 / day). Serves the last good cache if Strava errors.
- [ ] `GET /api/activities?sport=Run&page=1` — paged activity feed (the
      current `/api/summary` payload's `activities` array covers the
      dashboard and Activities page for now).
- [ ] `GET /api/gear` — not yet split out; gear is included in `/api/summary`.
- [x] `GET`/`POST /api/config` (`functions/api/config.js`) — reads/writes the
      goals + gear retirement config (see below). `POST` also deletes the
      `cache:summary` KV key so the change is reflected on the very next
      `/api/summary` call instead of waiting up to 15 min. Access-controlled
      by the site-wide Zero Trust policy from Phase 4 below.

### Configuring the Worker

| Where | Name | Purpose |
|-------|------|---------|
| Pages project → Settings → Environment variables (encrypted) | `STRAVA_CLIENT_ID` | OAuth app id |
| Pages project → Settings → Environment variables (encrypted) | `STRAVA_CLIENT_SECRET` | OAuth app secret |
| Pages project → Settings → Environment variables (encrypted) | `STRAVA_REFRESH_TOKEN` | initial refresh token (KV takes over after first use) |
| Pages project → Settings → Functions → KV bindings | `WORKOUTS_KV` → `workouts-kv` | token cache, response cache, goals/gear config |

For local development, copy `.dev.vars.example` to `.dev.vars` (gitignored)
with real values and run `npm run dev` (`wrangler pages dev`).

Goals, shoe `retire_at` targets and shoe `group` tags aren't part of the
Strava API — set them at
[`/restricted/settings/`](../restricted/settings/index.html), which reads and
writes the `config` KV key via `/api/config`:
`{ "goals": { "<Run|Ride|Swim>": { "<weekly|monthly|yearly>": { "target": <metres>, "unit": "km" } } }, "gear": { "<gear_id>": { "retire_at": <metres>, "group": <string> } } }`.
Every period/sport/shoe field is independently optional — nothing is
defaulted to a placeholder value; a goal, retirement target or group that's
never been set is just absent. `group` is a free-text tag (e.g. "Running -
Laax", "Hiking") the Gear page uses to section the shoe list — ungrouped
shoes land in a trailing "Other" section.

**Target response shape** (already what the front end consumes):

```json
{
  "athlete":   { "firstname": "...", "city": "..." },
  "activities":[ { "id", "name", "sport_type", "start_date_local",
                   "distance", "moving_time", "total_elevation_gain",
                   "average_heartrate", "average_speed", "gear_id" } ],
  "gear":      [ { "id", "type", "brand_name", "model_name",
                   "distance", "retire_at", "primary", "active" } ],
  "goals":     { "Run": { "weekly": {...}, "monthly": {...}, "yearly": {...} } },
  "ytd":       { "Run": { "distance", "moving_time", "elevation_gain", "count" } },
  "runWeekly": [/* metres per week, last 8 weeks */]
}
```

> `goals` and shoe `retire_at` targets are athlete-defined, not part of the core
> Strava API — store them in KV (or a small `config.json`) and merge them into
> the summary in the Worker.

## Phase 3 — Point the front end at the Worker ✅

Added `data.js` (rather than editing `mock-data.js` in place) so it's a clean
opt-in per page:

- [x] Each page's `<script defer src="/assets/js/data.js" data-render="...">`
      fetches `/api/summary`, sets `window.WORKOUTS_DATA`, then loads the
      page's render script (named by `data-render`) — `dashboard.js`,
      `activities.js` or `gear.js` never change.
- [x] Error state: on a failed fetch, `data.js` shows a banner and skips
      loading the render script entirely, instead of rendering with missing
      data.
- [ ] Loading skeleton (roadmap item — currently just a blank container until
      the fetch resolves).
- [x] `mock-data.js` kept for offline/local UI work — swap a page's `data.js`
      tag back to it to preview without a live backend.

## Phase 4 — Protect with Zero Trust ✅

Implemented more broadly than originally scoped: rather than a Self-hosted
Access application on just `workouts.gcameron.com/restricted*`, the **whole
site** (`workouts.gcameron.com/*`) now sits behind Cloudflare Zero Trust
Access. Simpler to reason about (one policy, not a path-based split), and as
a side effect it also closes the `/api/config` open-write gap noted in Phase
2 — Zero Trust gates every request at Cloudflare's edge before it ever
reaches a Pages Function, `/api/*` included.

Trade-off to know about: if Phase 5's optional Strava **Webhook Events API**
subscription is ever added, Strava's own servers need to reach the webhook
callback URL unauthenticated — that path will need an explicit bypass in the
Access policy, or the webhook will never be delivered.

Docs: <https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/>

## Phase 5 — Freshness

- Add a Worker **Cron Trigger** to warm the KV summary cache every ~15 min so
  the first visitor of the hour doesn't pay the Strava round-trip.
- (Optional) Subscribe to the Strava **Webhook Events API** to invalidate the
  cache the moment a new activity is uploaded.

---

See "Configuring the Worker" under Phase 2 above for the actual secret names
and KV binding — everything lives in the single `workouts-kv` namespace under
the `strava:token`, `cache:summary` and `config` keys.

## Known gotchas

- **`/athlete/activities` sort order flips with `after`.** Without the `after`
  param, Strava returns activities newest-first; *with* it, oldest-first. Using
  `after` + a single `per_page: 100` page therefore silently returns the
  *oldest* 100 activities in the window, not the most recent — which is why
  `fetchRecentActivities()` in `aggregate.js` pages through the default
  (newest-first) order instead and stops once it's gone far enough back.
- **A failed rebuild serves the last good cache indefinitely, not just within
  the 15 min TTL.** This keeps the dashboard from breaking outright when
  Strava errors, but it also means an ongoing failure can look like "the data
  is just old" rather than throwing a visible error — check the Cloudflare
  Pages Functions real-time logs if data looks stale.
- **A 401 from any Strava call self-heals once**: `stravaGet()` drops the
  cached access token and forces a fresh exchange (against the
  `STRAVA_REFRESH_TOKEN` secret, not the possibly-stale KV-cached refresh
  token) before retrying. This is what lets an updated refresh token secret
  take effect without manually clearing KV.
- **Static JS/CSS can lag behind a deploy in a visitor's browser.** There's no
  build step, so filenames never change (`gear.js` is always `gear.js`) —
  without an explicit caching policy, a browser can keep serving a
  pre-deploy copy of a script for a while, even though the HTML that
  references it updates immediately (HTML documents get revalidated every
  load; other assets don't by default). This is especially noticeable on iOS
  Safari, which has no true hard-refresh — a normal reload can still show
  new markup alongside old script behavior. Fixed by the root-level
  `_headers` file forcing `Cache-Control: no-cache, must-revalidate` on
  `/assets/js/*` and `/assets/css/*`, so every load revalidates (a fast 304
  if unchanged, a fresh fetch if not). Devices that cached an asset *before*
  this file existed may need one manual cache clear to pick it up; after
  that, deploys should propagate on the next load without one.

## Testing

- Worker unit tests with `vitest` + `@cloudflare/vitest-pool-workers`
  (mock the Strava fetch).
- `wrangler dev` for local Worker + `wrangler pages dev` for the static site.
- Verify rate-limit headroom and cache behaviour before going live.
