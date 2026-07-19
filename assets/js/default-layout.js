/* =============================================================
   default-layout.js — the layout document the site ships with,
   replicating the four original pages card-for-card. Used whenever
   no layout is stored in KV (GET /api/layout returns null), so
   "Reset to defaults" is just deleting the stored doc. Client-side
   only on purpose: mock/offline mode exercises the same path.
   ============================================================= */
window.WK_DEFAULT_LAYOUT = {
  version: 1,
  pages: [
    {
      id: "p-dashboard",
      slug: "dashboard",
      title: "Dashboard",
      eyebrow: "Training dashboard",
      heading: "Here's your week 👋",
      lede: "Recent activity, progress against your goals, key metrics by sport and a heads-up on gear that needs attention.",
      widgets: [
        { instanceId: "w-hero", templateId: "hero-activity", span: 8, config: {} },
        { instanceId: "w-ring", templateId: "goal-ring", span: 4, config: { sport: "Run", period: "yearly" } },
        { instanceId: "w-recent", templateId: "recent-activities", span: 6, config: { count: 6 } },
        { instanceId: "w-bytype", templateId: "latest-by-sport", span: 6, config: {} },
        { instanceId: "w-goals", templateId: "goal-meters", span: 6, config: { sport: "Run" } },
        { instanceId: "w-weekly", templateId: "weekly-volume", span: 6, config: {} },
        { instanceId: "w-metrics", templateId: "metrics-table", span: 12, config: {} },
        { instanceId: "w-gearwatch", templateId: "gear-warnings", span: 12, config: {} },
      ],
    },
    {
      id: "p-activities",
      slug: "activities",
      title: "Activities",
      eyebrow: "Activities",
      heading: "Activities by sport",
      lede: "Year-to-date totals per sport and a filterable feed of recent sessions. Use the buttons to focus on a single sport.",
      widgets: [
        { instanceId: "w-ytd", templateId: "sport-summary", span: 12, config: {} },
        { instanceId: "w-feed", templateId: "activity-feed", span: 12, config: {} },
      ],
    },
    {
      id: "p-gear",
      slug: "gear",
      title: "Gear",
      eyebrow: "Gear",
      heading: "Gear overview",
      lede: "Everything tracked on Strava. Shoes show a wear bar against a replacement target so you get a nudge before they're worn out.",
      widgets: [
        { instanceId: "w-shoes", templateId: "shoes-overview", span: 12, config: {} },
        { instanceId: "w-bikes", templateId: "bikes-overview", span: 12, config: {} },
      ],
    },
    {
      id: "p-restricted",
      slug: "restricted",
      title: "Restricted",
      eyebrow: "Private area",
      heading: "Restricted 🔒",
      lede: "The whole site sits behind Cloudflare Zero Trust Access — this area just goes deeper: full metrics and deep links into Strava.",
      widgets: [
        { instanceId: "w-r-hero", templateId: "hero-activity", span: 8, config: {} },
        { instanceId: "w-r-links", templateId: "strava-links", span: 4, config: {} },
        { instanceId: "w-r-metrics", templateId: "metrics-table", span: 12, config: { title: "Detailed metrics by sport", aside: "private view" } },
        {
          instanceId: "w-r-settings", templateId: "text-card", span: 12,
          config: {
            title: "Goals & gear retirement ⚙️",
            body: "Distance goals aren't provided by Strava — set your own in Settings. Shoe replacement targets are set on each shoe widget in edit mode.",
            linkText: "Manage goals →",
            linkHref: "/settings/",
          },
        },
        {
          instanceId: "w-r-planned", templateId: "text-card", span: 12,
          config: {
            title: "What lives here (planned)",
            body: "- Full activity history and raw splits, beyond the public highlights.\n- Heart-rate zones, training load and recovery trends.\n- Personal notes and private activities not shared publicly.\n- One-click deep links to the matching Strava activity pages.",
          },
        },
      ],
    },
  ],
};
