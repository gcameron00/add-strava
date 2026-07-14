# Workouts — a Strava dashboard mini-site

A small personal mini-site that turns [Strava](https://www.strava.com) activity
into an at-a-glance training dashboard. Intended to live at something like
`workouts.mysite.com`.

Built as **static HTML, CSS and vanilla JavaScript — no framework, no build
step** — and hosted on **Cloudflare Pages**. The live Strava integration will
run on a **Cloudflare Worker** so that API tokens never reach the browser.

> **Status:** first front-end mock-up. Everything you see is *demo data* shaped
> like the Strava API — nothing talks to Strava yet. The plan to wire it up
> lives in [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md); future
> ideas are in [`docs/ROADMAP.md`](docs/ROADMAP.md).
 
---

## Features (front-end mock-up)

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
│   ├── css/styles.css      # Design system: tokens + components
│   └── js/
│       ├── main.js         # Shared: theme toggle, nav, formatters (window.WK)
│       ├── mock-data.js    # Demo data shaped like the Strava API
│       ├── dashboard.js    # Renders the dashboard
│       ├── activities.js   # Renders the activities page
│       └── gear.js         # Renders the gear page
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── ROADMAP.md
└── README.md
```

## How the data layer works

Every page renders from a single global object, `window.WORKOUTS_DATA`, provided
today by [`assets/js/mock-data.js`](assets/js/mock-data.js). It intentionally
mirrors the shapes returned by the Strava API (distances in metres, times in
seconds, `sport_type`, `gear_id`, etc.).

When the backend is ready, the only change needed is to replace the mock with a
fetch from the Cloudflare Worker:

```js
window.WORKOUTS_DATA = await fetch("/api/summary").then((r) => r.json());
```

The rendering code (`dashboard.js`, `activities.js`, `gear.js`) doesn't change.

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

All figures shown right now are fictional. When live, public pages will show
summary metrics only; anything sensitive stays behind the Zero Trust-protected
`/restricted` area. This project is not affiliated with or endorsed by Strava;
use of the Strava API is subject to the
[Strava API Agreement](https://www.strava.com/legal/api).
