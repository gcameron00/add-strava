# Roadmap & future enhancements

Ideas beyond the first build-out, grouped by theme. Nothing here is committed —
it's a backlog to pull from.

## Near-term (once live data is flowing)

- **Dedicated per-sport pages** — `/activities/running`, `/activities/cycling`,
  `/activities/swimming` with sport-specific metrics (pace/splits for runs,
  power/speed for rides, `/100m` pace for swims). The current Activities page
  already filters by sport as a starting point.
- **Activity detail view** — open a single activity with map, splits and a
  heart-rate chart; deep-link out to the matching Strava page.
- **Configurable goals UI** — edit weekly/monthly/yearly targets and per-shoe
  replacement mileage from the `/restricted` area instead of a config file.
- **Loading & empty states** — skeletons while `/api/summary` loads, friendly
  empty states when a sport has no activities.
- **Unit preference** — km/miles toggle, saved like the theme preference.

## Data & insights

- **Trends** — rolling 4-week volume, week-over-week deltas, month-over-month
  comparisons.
- **Training load** — acute vs chronic load (ATL/CTL), suffer-score trends,
  simple "fresh / neutral / fatigued" readiness hint.
- **Heart-rate zones** — time-in-zone distribution per activity and per week.
- **Personal records** — fastest 5K/10K, longest ride, biggest climb, auto-
  detected from history.
- **Consistency** — a GitHub-style activity heatmap / streak calendar.

## Gear

- **Multi-gear tracking** — replacement targets for more than shoes (chains,
  cassettes, tyres) with per-component mileage.
- **Cost-per-km** — enter a purchase price, show lifetime value.
- **Retirement history** — archive of retired shoes and how far they lasted.

## Platform & polish

- **PWA** — installable, offline-friendly with a cached last-known summary.
- **Share cards** — generate an OG image per activity/week for social sharing.
- **Webhooks** — real-time cache invalidation on new Strava uploads
  (see implementation plan, Phase 5).
- **Multi-athlete** — support more than one connected Strava account.
- **i18n / locale** — dates, units and number formatting per locale.

## Quality

- **Worker tests** — mock the Strava API; assert the aggregation shape.
- **Accessibility pass** — automated axe checks + manual keyboard/screen-reader
  review; verify colour contrast in both themes.
- **Performance budget** — keep the site framework-free and under a small JS
  budget; lazy-load charts if any library is introduced.
- **Analytics** — privacy-friendly (e.g. Cloudflare Web Analytics), no cookies.
