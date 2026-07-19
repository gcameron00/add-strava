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

- **A widget portal** — every block (recent activity hero, goal ring/meters,
  weekly volume chart, per-sport metrics, gear watch, activity feed, single
  shoe/bike cards, …) is a **widget template**; pages are lists of widget
  *instances* you can move, resize (grid span), add, remove and configure
  from the **Customise** button on any page.
- **User-defined pages** — the shipped Dashboard / Activities / Gear /
  Restricted pages are just the default layout. Add, rename or delete pages
  (minimum one); the first page lives at `/`, the rest at `/p/<slug>`, and
  the nav follows.
- **Per-instance config** — e.g. a shoe widget is bound to one shoe; its
  retirement target and group are edited on the widget itself (saved to the
  athlete config, not the layout). Duplicate instances are fine and show the
  same data.
- **Settings** (`/settings/`) — distance goals + reset-layout-to-defaults.
- **About** (`/about/`) — what the site is and how it's built.
- Light/dark theming with a manual toggle, responsive layout, keyboard-
  accessible navigation (edit mode's move/resize buttons work without a
  pointer — drag is an enhancement).
- The whole site sits behind **Cloudflare Zero Trust Access** — nothing here
  is public.

## Project structure

```
.
├── index.html              # The single portal shell (all portal pages render here)
├── about/index.html        # About page
├── settings/index.html     # Distance goals + layout reset (not from Strava)
├── _redirects              # 301s for old URLs + /p/* rewrite to the portal shell
├── assets/
│   ├── favicon.svg
│   ├── img/powered-by-strava.svg
│   ├── css/styles.css      # Design system: tokens + components + edit-mode UI
│   └── js/
│       ├── main.js         # Shared: theme toggle, nav render, formatters (window.WK)
│       ├── data.js         # Fetches /api/summary + /api/layout, then loads portal.js
│       ├── mock-data.js    # Demo data shaped like the Strava API (offline UI work)
│       ├── default-layout.js # The shipped pages/widgets (used when no layout is stored)
│       ├── portal.js       # Renders a portal page from the layout document
│       ├── edit-mode.js    # Customise mode (lazy-loaded): drag, resize, add, config
│       ├── nav.js          # Dynamic nav for the non-portal pages (settings/about)
│       ├── settings.js     # Renders/saves the goals settings page
│       └── widgets/
│           ├── registry.js         # Widget template registry (WK.widgets) + shared helpers
│           ├── activity-widgets.js # hero, recent list, by-sport, YTD summary, feed
│           ├── goal-widgets.js     # goal ring/meters, weekly volume, metrics table
│           └── gear-widgets.js     # gear watch, shoe/bike overviews + singles, text card
├── functions/               # Cloudflare Pages Functions (the API backend)
│   ├── api/summary.js       # GET /api/summary — cached, aggregated payload
│   ├── api/config.js        # GET/POST /api/config — goals + gear retirement config
│   ├── api/layout.js        # GET/POST/DELETE /api/layout — the portal layout document
│   └── _lib/
│       ├── strava.js        # Token refresh + Strava fetch wrapper
│       ├── aggregate.js     # Builds the WORKOUTS_DATA shape from Strava responses
│       └── layout.js        # sanitizeLayout — validation/caps for the layout doc
├── wrangler.toml            # KV binding + Pages Functions config
├── package.json             # wrangler devDependency for local `npm run dev`
├── .dev.vars.example        # Template for local Strava secrets (.dev.vars, gitignored)
├── _headers                 # Forces JS/CSS to revalidate on every load (no build-time cache-busting)
├── docs/
│   ├── IMPLEMENTATION_PLAN.md
│   └── ROADMAP.md
└── README.md
```

## How the data layer works

Every page renders from two globals: `window.WORKOUTS_DATA` (the Strava
summary) and `window.WORKOUTS_LAYOUT` (the layout document, or `null` for
"use the shipped default"). [`assets/js/data.js`](assets/js/data.js) fetches
`/api/summary` and `/api/layout` in parallel, then loads
[`portal.js`](assets/js/portal.js), which picks the page for the current URL
(`/` = first page, `/p/<slug>` via the `_redirects` rewrite) and renders its
widgets — each one isolated in a try/catch so one bad widget can't blank the
page. A summary failure shows an error banner and stops; a layout failure
just falls back to [`default-layout.js`](assets/js/default-layout.js).

The layout document lives in KV under `layout` (`{version, pages[]}`, each
page `{id, slug, title, …, widgets[]}` and each widget
`{instanceId, templateId, span, config}`). Saving from Customise mode POSTs
the whole document; the previous version is kept under `layout:backup` and
`DELETE /api/layout` resets to defaults. Widget templates register themselves
on `WK.widgets` (see [`assets/js/widgets/registry.js`](assets/js/widgets/registry.js))
with a `configSchema` that drives the auto-generated per-instance settings
dialog; fields marked `writeThrough: "gearConfig"` (shoe retire-at / group)
save via `POST /api/config` instead of the layout.

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
4. Protect the whole site with a **Zero Trust Access** application for
   `workouts.mysite.com/*` (a single site-wide policy, rather than gating
   just `/restricted*`).

Full details, including the Worker + Strava OAuth setup, are in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

## Notes on data & privacy

The whole site sits behind Cloudflare Zero Trust Access — there's no public
page. This project is not affiliated with or endorsed by Strava; use of the
Strava API is subject to the
[Strava API Agreement](https://www.strava.com/legal/api).
