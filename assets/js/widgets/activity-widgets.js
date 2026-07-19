/* =============================================================
   activity-widgets.js — widget templates built on the activity feed:
   hero card, recent list, latest-per-sport, YTD summary, full feed.
   Extracted from the old dashboard.js / activities.js render functions.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, sportOf, SPORT, el } = window.WK;
  const { register, ui } = window.WK.widgets;

  const sportFilter = (list, sport) =>
    sport ? list.filter((a) => a.sport_type === sport) : list;

  /* ---- Hero: most recent activity ---- */
  register({
    id: "hero-activity",
    title: "Most recent activity",
    icon: "🏅",
    description: "Big card for your latest activity — distance, time, pace, elevation.",
    defaultSpan: 8,
    configSchema: [
      { key: "sport", type: "sportSelect", label: "Only this sport", optional: true },
    ],
    render(box, D, config) {
      const a = ui.byDateDesc(sportFilter(D.activities, config.sport))[0];
      if (!a) {
        box.append(
          ui.cardHead("Most recent activity"),
          ui.emptyMessage("No activities in the last 90 days.")
        );
        return;
      }
      const s = sportOf(a);
      box.append(
        ui.cardHead("Most recent activity",
          el("span", { class: "chip", "data-sport": a.sport_type }, el("span", { class: "dot" }), s.label)),
        el("div", { class: "stat" },
          el("div", { class: "stat-label" }, fmt.relativeDay(a.start_date_local) + " · " + fmt.dateFull(a.start_date_local)),
          el("div", { class: "hero-title" }, `${s.icon} ${a.name}`)
        ),
        el("div", { class: "grid cols-4" },
          ui.miniStat("Distance", a.distance ? fmt.distance(a.distance) : "—"),
          ui.miniStat("Time", fmt.duration(a.moving_time)),
          ui.miniStat(s.primary === "speed" ? "Speed" : "Pace", ui.primaryMetric(a) || "—"),
          ui.miniStat("Elevation", fmt.elevation(a.total_elevation_gain))
        )
      );
    },
  });

  /* ---- Recent activities list ---- */
  register({
    id: "recent-activities",
    title: "Recent activities",
    icon: "📋",
    description: "Compact list of your latest activities.",
    defaultSpan: 6,
    configSchema: [
      { key: "count", type: "number", label: "How many", min: 1, max: 20 },
      { key: "sport", type: "sportSelect", label: "Only this sport", optional: true },
    ],
    render(box, D, config) {
      const count = Number(config.count) > 0 ? Math.min(20, Math.round(Number(config.count))) : 6;
      const list = ui.byDateDesc(sportFilter(D.activities, config.sport)).slice(0, count);
      box.append(ui.cardHead("Recent activities", el("a", { href: "/p/activities" }, "View all →")));
      if (!list.length) {
        box.append(ui.emptyMessage("No recent activities."));
        return;
      }
      box.append(el("div", { class: "activity-list" }, ...list.map(ui.activityRow)));
    },
  });

  /* ---- Most recent activity per sport type ---- */
  register({
    id: "latest-by-sport",
    title: "Most recent by sport",
    icon: "🗂️",
    description: "One small card per sport with the latest session.",
    defaultSpan: 6,
    render(box, D) {
      const latestBySport = {};
      for (const a of D.activities) {
        const key = a.sport_type;
        if (!latestBySport[key] || new Date(a.start_date_local) > new Date(latestBySport[key].start_date_local)) {
          latestBySport[key] = a;
        }
      }
      const cards = ui.byDateDesc(Object.values(latestBySport)).map((a) => {
        const s = sportOf(a);
        return el("div", { class: "card" },
          el("div", { class: "card-head" },
            el("span", { class: "chip", "data-sport": a.sport_type }, el("span", { class: "dot" }), s.label),
            el("span", { class: "muted small" }, fmt.relativeDay(a.start_date_local))
          ),
          el("div", { class: "a-title tight" }, `${s.icon} ${a.name}`),
          el("div", { class: "muted small" },
            [a.distance ? fmt.distance(a.distance) : null, fmt.duration(a.moving_time), ui.primaryMetric(a)]
              .filter(Boolean).join(" · ")
          )
        );
      });
      box.append(ui.cardHead("Most recent by sport"));
      if (!cards.length) {
        box.append(ui.emptyMessage("No recent activities."));
        return;
      }
      box.append(el("div", { class: "grid cols-2" }, ...cards));
    },
  });

  /* ---- Year-to-date summary cards, one per sport ---- */
  register({
    id: "sport-summary",
    title: "Year to date",
    icon: "📆",
    description: "Year-to-date totals per sport (distance, time, elevation).",
    defaultSpan: 12,
    bare: true,
    render(box, D) {
      const cards = Object.entries(D.ytd).map(([sport, m]) => {
        const s = SPORT[sport] || { label: sport, icon: "⭐" };
        return el("div", { class: "card" },
          el("div", { class: "card-head" },
            el("span", { class: "chip", "data-sport": sport }, el("span", { class: "dot" }), `${s.icon} ${s.label}`),
            el("span", { class: "muted small" }, "Year to date")
          ),
          el("div", { class: "stat" },
            el("div", { class: "stat-value" }, fmt.km(m.distance).toFixed(0), el("span", { class: "unit" }, "km")),
            el("div", { class: "stat-sub" }, `${m.count} activities · ${fmt.duration(m.moving_time)} · ${fmt.elevation(m.elevation_gain)} climbed`)
          )
        );
      });
      box.append(
        el("div", { class: "section-head" }, el("h2", null, "Year to date")),
        el("div", { class: "grid cols-3" }, ...cards)
      );
    },
  });

  /* ---- Full activity feed with sport filter buttons ---- */
  // The filter is instance-local UI state: switching sports re-renders just
  // this widget and is not saved (config.sport only sets the initial filter).
  register({
    id: "activity-feed",
    title: "Activity feed",
    icon: "📜",
    description: "Filterable table of all loaded activities, newest first.",
    defaultSpan: 12,
    bare: true,
    configSchema: [
      { key: "sport", type: "sportSelect", label: "Initial sport filter", optional: true },
    ],
    render(box, D, config) {
      let activeSport = config.sport || "All";

      const filterBox = el("div", { class: "access-links feed-filters" });
      const tableWrap = el("div", { class: "table-wrap" });

      function renderFilters() {
        const sports = ["All", ...Array.from(new Set(D.activities.map((a) => a.sport_type)))];
        filterBox.replaceChildren(...sports.map((sp) => {
          const s = SPORT[sp] || { label: sp === "All" ? "All" : sp, icon: sp === "All" ? "📋" : "⭐" };
          const btn = el("button", {
            class: "btn" + (sp === activeSport ? " primary" : ""),
            type: "button",
          }, `${s.icon} ${s.label}`);
          btn.addEventListener("click", () => {
            activeSport = sp;
            renderFilters();
            renderFeed();
          });
          return btn;
        }));
      }

      function renderFeed() {
        const list = ui.byDateDesc(
          D.activities.filter((a) => activeSport === "All" || a.sport_type === activeSport)
        );
        if (!list.length) {
          tableWrap.replaceChildren(el("p", { class: "muted" }, "No activities for this sport yet."));
          return;
        }
        const rows = list.map((a) => {
          const s = sportOf(a);
          return el("tr", null,
            el("td", null,
              el("div", { class: "a-title" }, `${s.icon} ${a.name}`),
              el("div", { class: "muted small" }, `${s.label} · ${fmt.dateFull(a.start_date_local)}`)
            ),
            el("td", { class: "num" }, a.distance ? fmt.distance(a.distance) : "—"),
            el("td", { class: "num" }, fmt.duration(a.moving_time)),
            el("td", { class: "num" }, ui.primaryMetric(a) || "—"),
            el("td", { class: "num" }, a.total_elevation_gain ? fmt.elevation(a.total_elevation_gain) : "—"),
            el("td", { class: "num" }, a.average_heartrate ? `${Math.round(a.average_heartrate)}` : "—")
          );
        });
        tableWrap.replaceChildren(
          el("table", { class: "data" },
            el("thead", null, el("tr", null,
              el("th", null, "Activity"),
              el("th", { class: "num" }, "Distance"),
              el("th", { class: "num" }, "Time"),
              el("th", { class: "num" }, "Pace / Speed"),
              el("th", { class: "num" }, "Elev"),
              el("th", { class: "num" }, "HR")
            )),
            el("tbody", null, ...rows)
          )
        );
      }

      renderFilters();
      renderFeed();
      box.append(
        el("div", { class: "section-head" }, el("h2", null, "Activity feed")),
        filterBox,
        el("div", { class: "card" }, tableWrap)
      );
    },
  });
})();
