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
- [ ] Connect the repo to a Cloudflare Pages project and set the custom domain

## Phase 1 — Strava API app + OAuth

1. Create an API application at <https://www.strava.com/settings/api>.
   Note the **Client ID** and **Client Secret**; set the callback domain.
2. Do the one-time OAuth authorization-code flow to obtain a **refresh token**
   with the scopes you need: `read`, `activity:read_all`, `profile:read_all`.
3. Store secrets on the Worker (never in the repo):
   ```bash
   wrangler secret put STRAVA_CLIENT_ID
   wrangler secret put STRAVA_CLIENT_SECRET
   wrangler secret put STRAVA_REFRESH_TOKEN
   ```
   Docs: <https://developers.strava.com/docs/authentication/>

## Phase 2 — Cloudflare Worker API

1. Scaffold a Worker (`wrangler init`), add a **KV namespace** for token +
   response caching.
2. Implement a token manager: exchange the refresh token for a short-lived
   access token, cache it in KV until `expires_at`, refresh on demand.
3. Add endpoints (an `itty-router`-style router keeps this tiny):
   - `GET /api/summary` — the dashboard payload (see shape below).
   - `GET /api/activities?sport=Run&page=1` — paged activity feed.
   - `GET /api/gear` — gear list with computed wear.
4. Fetch from Strava, aggregate, and **cache the summary in KV** for ~15 min to
   stay well within Strava's rate limits (100 req / 15 min, 1000 / day).
5. Serve the Worker on the same domain via a Pages Function or a route so the
   front end can call same-origin `/api/*` with no CORS.

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

## Phase 3 — Point the front end at the Worker

Replace the mock assignment in `mock-data.js` (or add a `data.js` that wins) with:

```js
window.WORKOUTS_DATA = await fetch("/api/summary").then((r) => {
  if (!r.ok) throw new Error("summary failed");
  return r.json();
});
```

Then re-run the existing `init()` renders. Add a loading skeleton and an error
state. Because every page reads only from `WORKOUTS_DATA`, no rendering code
changes.

## Phase 4 — Protect `/restricted` with Zero Trust

1. In the Cloudflare **Zero Trust** dashboard, add a **Self-hosted Access
   application** for `workouts.mysite.com/restricted*`.
2. Add a policy (e.g. *Allow* → your email, or a one-time PIN / Google login).
3. Verify the public pages stay open and `/restricted` prompts for auth.
4. Optionally have the Worker check the `Cf-Access-Jwt-Assertion` header before
   returning private-only fields.

Docs: <https://developers.cloudflare.com/cloudflare-one/applications/configure-apps/self-hosted-public-app/>

## Phase 5 — Freshness

- Add a Worker **Cron Trigger** to warm the KV summary cache every ~15 min so
  the first visitor of the hour doesn't pay the Strava round-trip.
- (Optional) Subscribe to the Strava **Webhook Events API** to invalidate the
  cache the moment a new activity is uploaded.

---

## Environment / config checklist

| Where | Name | Purpose |
|-------|------|---------|
| Worker secret | `STRAVA_CLIENT_ID` | OAuth app id |
| Worker secret | `STRAVA_CLIENT_SECRET` | OAuth app secret |
| Worker secret | `STRAVA_REFRESH_TOKEN` | long-lived refresh token |
| Worker KV | `TOKENS` | cached access token |
| Worker KV | `CACHE` | cached `/api/summary` payload |
| Worker KV | `CONFIG` | goals + gear replacement targets |

## Testing

- Worker unit tests with `vitest` + `@cloudflare/vitest-pool-workers`
  (mock the Strava fetch).
- `wrangler dev` for local Worker + `wrangler pages dev` for the static site.
- Verify rate-limit headroom and cache behaviour before going live.
