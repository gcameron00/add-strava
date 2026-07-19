# Repo review — concerns & improvements

_Reviewed 2026-07-19 against `main` @ `5c23212`. Observations only — nothing in
this document has been changed in the codebase._

The overall shape is good: a small, framework-free static site with a thin
Pages Functions backend, secrets kept server-side, sensible KV caching, and
unusually thorough docs (`IMPLEMENTATION_PLAN.md` documents real gotchas).
The items below are ordered by topic, with the ones worth acting on first
called out at the top.

---

## 🔴 Top priorities (3–5 things to look at first)

1. **The `claude.yml` auto-merge step merges unreviewed PRs — even when the
   Claude job failed.** The "Merge Claude's PR" step runs with
   `if: always()`, greps issue comments for a compare-URL, and
   `gh pr merge --merge` with no review, no CI gate, and no check that the
   branch was actually created by the action. See [CI / automation](#ci--automation).
2. **Saving settings can silently delete config for gear that isn't an
   active shoe.** `POST /api/config` replaces the whole config blob, and
   `settings.js` only re-submits entries for currently-active shoes — so a
   `retire_at`/`group` set on a shoe that later gets retired on Strava (or any
   future bike/other-gear entry) is wiped on the next save. See
   [Backend](#backend--pages-functions--kv).
3. **Upstream error text is injected into the page via `innerHTML`.**
   `data.js`'s error banner interpolates the API error message (which itself
   embeds raw Strava response bodies) into `innerHTML`. Low practical risk
   behind Zero Trust, but it's a one-line fix (`textContent`). See
   [Front end](#front-end).
4. **The dashboard crashes or renders garbage on empty data.**
   `renderHero()` throws a TypeError if `activities` is empty (new season,
   new athlete, 90-day gap), and the weekly chart divides by zero when there
   are no runs. See [Front end](#front-end).
5. **There are still no tests**, despite the implementation plan specifying
   vitest + `@cloudflare/vitest-pool-workers`. `aggregate.js` (pagination,
   lookback trimming, week bucketing) and `config.js` (sanitisation,
   merge-vs-replace) are exactly the kind of pure-ish logic that's cheap to
   test and easy to silently break. See [Testing & tooling](#testing--tooling).

---

## CI / automation

**`.github/workflows/claude.yml` — the auto-merge step (lines 40–84):**

- `if: always() && github.event_name == 'issues'` means the merge step runs
  even when the Claude step **failed or was cancelled**. If a partial branch
  and comment exist from a previous run, it can still get merged.
- The branch to merge is derived by grepping **all issue comments** for a
  `compare/...` URL. Anyone who can comment on an issue can plant a
  compare-URL pointing at any branch, and the workflow will open and merge a
  PR for it with `GH_PAT`. On a personal repo the audience is small, but the
  pattern is fragile: at minimum, restrict the comment author (e.g. only
  comments from the Claude bot/actions user) and take the *last* match, not
  the first.
- `gh pr merge` runs with no required checks and no review. Even for a
  personal site, consider requiring the Pages preview deploy to succeed, or
  gate the merge behind a label you add manually after glancing at the diff.
- The issue trigger requires the `enhancement` label — good — but the merge
  step doesn't re-verify anything about the PR contents.

**Other:**

- There's no CI at all for the code itself — not even a syntax check on the
  functions. A minimal workflow running `node --check` over `functions/**`
  and `assets/js/**` (or eslint) would catch typos before Pages deploys them.

## Security

- **Zero Trust as the single auth layer is a deliberate, documented choice**
  and it does close the `/api/config` open-write gap — but it's worth being
  aware that the entire API's security now rests on one dashboard-side
  config that has no representation in the repo. If the Access application
  is ever deleted/misconfigured, `/api/config` becomes a world-writable KV
  write with no second line of defence. A cheap belt-and-braces option:
  validate the `Cf-Access-Jwt-Assertion` header (or at least its presence)
  in the functions.
- **`_headers` sets no security headers.** Since you already have the file,
  adding `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `X-Frame-Options`/`frame-ancestors`, and a basic CSP for `/*` is nearly
  free — and a CSP would also neutralise the `innerHTML` issue below.
- **`/api/config` POST accepts unbounded input.** `sanitizeConfig` drops bad
  values but doesn't cap the number of `gear` entries or the `group` string
  length, so a (Zero-Trust-authenticated) client could still write an
  arbitrarily large blob into KV. Low risk, but a `slice`/length cap is two
  lines.
- Error responses pass through raw internals (`String(err)` including Strava
  response bodies and KV errors). Fine behind Access; would need tightening
  if anything ever became public.

## Backend — Pages Functions & KV

- **Config save is destructive (priority #2 above).** Two safer options:
  make `POST /api/config` merge into the existing blob rather than replace
  it, or have `settings.js` fetch the current config and re-submit entries
  it isn't editing. Merging server-side is the more robust fix since any
  future client gets it for free.
- **Token refresh has a race under concurrency.** Strava rotates refresh
  tokens on use. Two concurrent cold requests can both call
  `getAccessToken`, both POST `/oauth/token` with the same refresh token,
  and the loser can end up persisting a stale rotation to KV. The 401-retry
  path (falling back to the `STRAVA_REFRESH_TOKEN` secret) papers over this
  — but only until the secret itself is rotated out of validity. A KV-based
  lock is overkill; a simpler mitigation is to serve the stale summary while
  rebuilding (see next point), which makes concurrent cold rebuilds rare.
- **No request coalescing on a cold cache.** Every request that arrives
  after the 15-min TTL expires triggers its own full `buildSummary` (~10
  Strava calls each: athlete + stats + up to 5 activity pages + one per
  gear item). Two browser tabs are enough to double the Strava traffic. A
  stale-while-revalidate pattern (serve the expired cache immediately,
  rebuild via `context.waitUntil`) fixes both this and perceived latency,
  and is a natural stepping stone to the Phase 5 cron warmer.
- **`summary.js` checks the KV binding; `config.js` doesn't.** In an
  environment without the binding, `/api/config` throws an unhandled
  exception instead of the clear 500 that `/api/summary` returns. Same for
  the missing-secrets case in `strava.js` — a missing `STRAVA_CLIENT_ID`
  produces a confusing Strava-side error rather than a "not configured"
  message.
- **Gear fetches are fail-fast.** One deleted/permission-blocked gear item
  makes the whole summary build throw (and the site then leans on the stale
  cache indefinitely, per the documented gotcha). Consider `allSettled` for
  gear and dropping the failures — a missing shoe shouldn't take down the
  dashboard.
- Minor: `json()` is duplicated in both function files, and
  `CACHE_KEY = "cache:summary"` is defined independently in `summary.js`
  and `config.js` — a drift hazard; both belong in `_lib/`.

## Front end

- **`data.js` error banner uses `innerHTML` with upstream text (priority
  #3).** `showError` builds
  `` `...` + message `` into `innerHTML`, and `message` can contain raw
  Strava/KV error bodies via `/api/summary`'s `{ error: String(err) }`.
  Build the banner with `textContent` (or the existing `WK.el` helper with
  text children).
- **Empty states are missing (priority #4).**
  - `dashboard.js` `renderHero()`: `[...D.activities].sort(...)[0]` is
    `undefined` when the 90-day window is empty → `sportOf(a)` throws and,
    because `init()` isn't try/caught per-section, **every card below the
    hero also stays blank**.
  - `renderWeekly()`: `Math.max(...data)` is `0` for a runless period →
    `v / max` is `NaN` → `height:NaN%`.
  - Wrapping each `render*()` in a try/catch (or an early "no recent
    activities" branch) keeps one bad section from blanking the page.
- **`settings.js` doesn't check `res.ok`** on the initial
  `/api/summary` + `/api/config` fetches — a 502 with an `{ error }` body
  renders an empty-but-plausible settings form (no shoes, no goals), and a
  subsequent save would then wipe the real config (compounding priority #2).
- The loading experience is a blank page until `/api/summary` resolves —
  already on the roadmap, but worth prioritising given the cold-cache path
  can take multiple seconds (~10 sequential-ish Strava calls).
- `restricted/index.html` loads `dashboard.js`, so "Detailed metrics by
  sport" is the identical table from the public dashboard — the page
  currently adds only deep links. Fine as a placeholder; just noting the
  gap between the copy ("full metrics, private view") and what renders.

## Data correctness

- **Timezone drift in date maths.** Strava's `start_date_local` is the
  athlete's local wall-clock time but formatted with a `Z` suffix, so
  `new Date(a.start_date_local)` parses it as UTC. Everywhere it's compared
  against browser-local values (`fmt.relativeDay`, goal `sumSince`,
  `weeklyRunDistance` in the worker) there's an offset of the viewer's UTC
  offset — enough to shift a late-evening run into "Yesterday" or the wrong
  weekly bucket. Consistently stripping the `Z` (treat as naive local) or
  doing all bucketing in the athlete's timezone would fix it.
- **Two different definitions of "week".** The dashboard's weekly goal
  meter uses Monday-start calendar weeks; the weekly volume chart
  (`weeklyRunDistance`) uses rolling 7-day windows ending "now". The bar
  labelled "This wk" therefore doesn't match the "This week" meter next to
  it. Aligning the chart to Monday-start weeks would make them agree.
- `runWeekly` is computed at cache-build time from `Date.now()` but served
  for up to 15 minutes (indefinitely on the stale-cache path) — bucket
  boundaries can be slightly off around midnight/week rollover. Minor, but
  worth knowing when eyeballing the chart.
- YTD cards only cover Run/Ride/Swim (that's all Strava's stats endpoint
  offers) while the feed shows all sports — the "Year to date" section can
  look inconsistent with the feed for walkers/hikers. Cosmetic; could be
  derived from activities if it ever matters.

## Testing & tooling

- **No tests (priority #5).** Highest-value targets, in order:
  1. `aggregate.js` — pagination stop conditions, 90-day trimming, the
     `after`-param gotcha regression, `weeklyRunDistance` bucketing.
  2. `config.js` `sanitizeConfig` — and a regression test for the
     merge-vs-replace fix once made.
  3. `strava.js` — 401 retry path and refresh-token persistence.
- No lint/format config (eslint/prettier). With hand-rolled DOM code and no
  build step, a linter is the only thing standing between a typo and a
  broken deploy.
- `mock-data.js` is load-bearing for offline work but nothing checks it
  still matches the real `/api/summary` shape — it will drift. A tiny test
  asserting both share the same keys would keep it honest.

## Accessibility & UX polish

- Emoji used as meaningful icons (sport icons, 👟) aren't marked
  `aria-hidden`, so screen readers announce e.g. "athletics shoe" mid-label;
  conversely the bar chart conveys values only via `title` tooltips, which
  are invisible to keyboard and touch users. The progress ring does this
  correctly (`aria-hidden` + text label) — the same pattern could be applied
  to the chart.
- Filter buttons on Activities don't expose state (`aria-pressed`), and the
  chart has no text alternative (a visually-hidden table or summary
  sentence would do).
- Several inline `style="..."` attributes in the render scripts
  (`dashboard.js`, `gear.js`) duplicate what the design system in
  `styles.css` should own — worth folding into classes before they multiply.

## Docs & housekeeping

- The docs are genuinely good. Two small drift issues:
  - `IMPLEMENTATION_PLAN.md` still says Phase 2 is "in progress" and lists
    `/api/activities` + `/api/gear` as pending, while the README says the
    site is live — fine, but worth a status sweep so the plan doesn't rot.
  - `README.md` documents `python3 -m http.server` as local preview, but
    every page now hard-depends on `/api/summary`, so a plain static server
    renders only error banners. The honest instructions are
    `npm run dev` (wrangler) or swapping a page to `mock-data.js`.
- Since Pages deploys the repo root, `docs/`, `mock-data.js`, and
  `.dev.vars.example` all ship to the live site. Harmless behind Zero
  Trust, but a `_routes.json`/exclude list would keep the deployed surface
  intentional.
- The repo/package is named `add-strava`/`workouts` inconsistently with the
  site branding ("Workouts") — trivial, only worth aligning if the repo is
  ever renamed anyway.
