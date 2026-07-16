# Workouts — a Strava dashboard mini-site

A small personal mini-site that turns [Strava](https://www.strava.com) activity
into an at-a-glance training dashboard. Lives at `workouts.gcameron.com`.

Built as **static HTML, CSS and vanilla JavaScript — no framework, no build
step** — and hosted on **Cloudflare Pages**. The live Strava integration runs
on a **Cloudflare Pages Function** so that API tokens never reach the browser.

> **Status:** live. The dashboard, activities feed and gear list are powered by
> real Strava data via a Cloudflare Pages Function. See
> [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) for how it's
> wired up; future ideas are in [`docs/ROADMAP.md`](docs/ROADMAP.md).
  
---

## Features

- **Dashboard** (`/`) — the homepage:
  - Most recent activity (Today / Yesterday / N days ago) and what it was
  - Most recent activity **per sport**
  - Running progress vs **weekly / monthly / yearly** goals
  - **Key metrics per activity type** (distance, time, elevation, avg HR)
  - **Gear warnings** — shoes approaching their replacement mileage
- **Activities** (`/activities/`) — year-to-date totals per sport and a
  filterable activity feed.
- **Gear** (`/gear/`) — shoes and bikes tracked on Strava, with wear bars.
- **Restricted** (`/restricted/`) — a private area intended to sit behind
  **Cloudflare Zero Trust Access**, with deeper metrics and deep links into
  Strava.
- **About** (`/about/`) — what the site is and how it's built.
- Light/dark theming with a manual toggle, responsive layout, keyboard-
  accessible navigation.

## Project structure

```
.
├── index.html              # Dashboard (public)
├── about/index.html        # About page
├── activities/index.html   # Activities by sport
├── gear/index.html         # Gear overview
├── restricted/index.html   # Private area (to be Zero Trust protected)
├── assets/
│   ├── favicon.svg
│   ├── img/powered-by-strava.svg
│   ├── css/styles.css      # Design system: tokens + components
│   └── js/
│       ├── main.js         # Shared: theme toggle, nav, formatters (window.WK)
│       ├── data.js         # Fetches /api/summary, then loads the page's render script
│       ├── mock-data.js    # Demo data shaped like the Strava API (offline UI work)
│       ├── dashboard.js    # Renders the dashboard
│       ├── activities.js   # Renders the activities page
│       └── gear.js         # Renders the gear page
├── functions/               # Cloudflare Pages Functions (the API backend)
│   ├── api/summary.js       # GET /api/summary — cached, aggregated payload
│   └── _lib/
│       ├── strava.js        # Token refresh + Strava fetch wrapper
│       └── aggregate.js     # Builds the WORKOUTS_DATA shape from Strava responses
├── wrangler.toml            # KV binding + Pages Functions config
├── package.json             # wrangler devDependency for local `npm run dev`
├── .dev.vars.example        # Template for local Strava secrets (.dev.vars, gitignored)
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── ROADMAP.md
└── README.md
```

## How the data layer works

Every page renders from a single global object, `window.WORKOUTS_DATA`. Each
page loads [`assets/js/data.js`](assets/js/data.js), which fetches
`/api/summary` from the Cloudflare Pages Function (see [`functions/`](functions/))
and, once the data lands, loads that page's render script — named via the
`data-render` attribute on the `data.js` `<script>` tag (`dashboard.js`,
`activities.js` or `gear.js`). If the fetch fails, `data.js` shows an error
banner instead and the render script is never loaded, so those files never
have to handle missing data themselves.

[`assets/js/mock-data.js`](assets/js/mock-data.js) mirrors the Strava API shape
and is kept around for offline UI work — point a page's script tag at it
instead of `data.js` if you want to preview layout changes without a live
backend.

## Local preview

No build step — serve the folder with any static server:

```bash
# Python
python3 -m http.server 8080

# or Node
npx serve .
```

Then open <http://localhost:8080>. Root-absolute paths (`/assets/...`,
`/about/`) work when served from the project root.

## Deploying to Cloudflare Pages

1. Connect this repository to a new Cloudflare Pages project.
2. Framework preset: **None**. Build command: *(empty)*. Output directory: `/`
   (the repo root is already the site root).
3. Add your custom domain, e.g. `workouts.mysite.com`.
4. Protect the private area by adding a **Zero Trust Access** application for
   the path `workouts.mysite.com/restricted*`.

Full details, including the Worker + Strava OAuth setup, are in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Notes on data & privacy

Public pages show summary metrics only; anything more sensitive stays behind
the Zero Trust-protected `/restricted` area (not yet enforced — see the
implementation plan). This project is not affiliated with or endorsed by
Strava; use of the Strava API is subject to the
[Strava API Agreement](https://www.strava.com/legal/api).
