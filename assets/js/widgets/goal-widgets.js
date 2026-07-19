/* =============================================================
   goal-widgets.js — goal ring, goal meters, weekly volume chart and
   the per-sport metrics table. Extracted from the old dashboard.js.
   Goals are athlete-defined (KV config), not provided by Strava.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, SPORT, el, startOfWeek } = window.WK;
  const { register, ui } = window.WK.widgets;

  const PERIOD_LABEL = { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  const GERUND = { Run: "running", Ride: "riding", Swim: "swimming" };

  const sportName = (sport) => GERUND[sport] || (SPORT[sport]?.label || sport).toLowerCase();

  // Distance done vs target for one sport+period. Yearly comes from Strava's
  // YTD stats (covers the whole year); weekly/monthly are summed from the
  // loaded 90-day activity window.
  function goalProgress(D, sport, period) {
    const target = D.goals?.[sport]?.[period]?.target;
    let done;
    if (period === "yearly") {
      done = D.ytd?.[sport]?.distance || 0;
    } else {
      const now = new Date();
      const since = period === "weekly"
        ? startOfWeek(now)
        : new Date(now.getFullYear(), now.getMonth(), 1);
      done = D.activities
        .filter((a) => a.sport_type === sport && new Date(a.start_date_local) >= since)
        .reduce((t, a) => t + a.distance, 0);
    }
    return { target, done };
  }

  function noGoalsMessage() {
    return el("p", { class: "muted small" },
      "No goals set yet — add them in ",
      el("a", { href: "/settings/" }, "Settings"),
      "."
    );
  }

  function meter(label, done, target) {
    const pct = Math.min(100, (done / target) * 100);
    const cls = pct >= 100 ? "good" : pct >= 60 ? "" : "warn";
    return el("div", { class: "meter" },
      el("div", { class: "meter-top" },
        el("span", null, label),
        el("span", { class: "val" }, `${fmt.km(done).toFixed(1)} / ${fmt.km(target).toFixed(0)} km`)
      ),
      el("div", { class: "track" }, el("div", { class: "fill " + cls, style: `width:${pct}%` })),
      el("div", { class: "pace-hint" }, `${Math.round(pct)}% of target`)
    );
  }

  function progressRing(pct) {
    const r = 42, c = 2 * Math.PI * r;
    const off = c * (1 - pct / 100);
    const wrap = el("div", { class: "ring" });
    wrap.innerHTML = `
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle class="track-c" cx="48" cy="48" r="${r}" fill="none" stroke-width="9"></circle>
        <circle class="fill-c" cx="48" cy="48" r="${r}" fill="none" stroke-width="9"
                stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"></circle>
      </svg>
      <div class="ring-label">${pct}%</div>`;
    return wrap;
  }

  /* ---- Goal progress ring for one sport + period ---- */
  register({
    id: "goal-ring",
    title: "Goal ring",
    icon: "🎯",
    description: "Progress ring for one distance goal (sport + period).",
    defaultSpan: 4,
    configSchema: [
      { key: "sport", type: "sportSelect", label: "Sport", goalSports: true },
      { key: "period", type: "select", label: "Period", options: ["weekly", "monthly", "yearly"] },
    ],
    render(box, D, config) {
      const sport = config.sport || "Run";
      const period = config.period || "yearly";
      box.append(ui.cardHead(`${PERIOD_LABEL[period]} ${sportName(sport)} goal`));
      const { target, done } = goalProgress(D, sport, period);
      if (!target) {
        box.append(noGoalsMessage());
        return;
      }
      const pct = Math.min(100, Math.round((done / target) * 100));
      box.append(
        el("div", { class: "ring-wrap" },
          progressRing(pct),
          el("div", null,
            el("div", { class: "stat-label" }, `${PERIOD_LABEL[period]} goal`),
            el("div", { class: "stat-value stat-value-lg" }, `${fmt.km(done).toFixed(0)} `,
              el("span", { class: "unit" }, `/ ${fmt.km(target).toFixed(0)} km`)),
            el("div", { class: "stat-sub" }, `${fmt.km(Math.max(0, target - done)).toFixed(0)} km to go`)
          )
        )
      );
    },
  });

  /* ---- Goal meters (weekly/monthly/yearly) for one sport ---- */
  register({
    id: "goal-meters",
    title: "Goal meters",
    icon: "📊",
    description: "Progress bars for every goal period set for one sport.",
    defaultSpan: 6,
    configSchema: [
      { key: "sport", type: "sportSelect", label: "Sport", goalSports: true },
    ],
    render(box, D, config) {
      const sport = config.sport || "Run";
      const name = sportName(sport);
      box.append(ui.cardHead(`${name[0].toUpperCase()}${name.slice(1)} goals`,
        el("span", { class: "muted small" }, "weekly · monthly · yearly")));
      const meters = ["weekly", "monthly", "yearly"]
        .map((period) => ({ period, ...goalProgress(D, sport, period) }))
        .filter((m) => m.target)
        .map((m) => meter(
          { weekly: "This week", monthly: "This month", yearly: "This year" }[m.period],
          m.done, m.target
        ));
      if (meters.length) box.append(...meters);
      else box.append(noGoalsMessage());
      box.append(ui.footnote("Goals are set manually — not provided by Strava."));
    },
  });

  /* ---- Weekly running volume bar chart ---- */
  register({
    id: "weekly-volume",
    title: "Weekly run volume",
    icon: "📈",
    description: "Bar chart of running distance over the last 8 weeks.",
    defaultSpan: 6,
    render(box, D) {
      box.append(ui.cardHead("Weekly run volume", el("span", { class: "muted small" }, "last 8 weeks")));
      const data = D.runWeekly || [];
      const max = Math.max(...data, 0);
      if (!data.length || max === 0) {
        box.append(ui.emptyMessage("No runs in the last 8 weeks."));
        return;
      }
      const bars = el("div", { class: "barchart" });
      data.forEach((v) => {
        bars.append(el("div", {
          class: "bar",
          style: `height:${Math.max(6, (v / max) * 100)}%`,
          title: `${fmt.km(v).toFixed(1)} km`,
        }));
      });
      const labels = el("div", { class: "barchart-labels" });
      const n = data.length;
      data.forEach((_, i) => labels.append(el("span", null, i === n - 1 ? "This wk" : `-${n - 1 - i}`)));
      box.append(bars, labels);
    },
  });

  /* ---- Key metrics per activity type (table) ---- */
  register({
    id: "metrics-table",
    title: "Metrics by sport",
    icon: "🧮",
    description: "Aggregate table — activities, distance, time, elevation, HR per sport.",
    defaultSpan: 12,
    configSchema: [
      { key: "title", type: "text", label: "Card title", optional: true },
      { key: "aside", type: "text", label: "Card subtitle", optional: true },
    ],
    render(box, D, config) {
      box.append(ui.cardHead(config.title || "Key metrics by activity type",
        el("span", { class: "muted small" }, config.aside || "recent activities")));
      const agg = {};
      for (const a of D.activities) {
        const k = a.sport_type;
        agg[k] = agg[k] || { count: 0, distance: 0, time: 0, elev: 0, hr: 0, hrCount: 0 };
        agg[k].count++;
        agg[k].distance += a.distance || 0;
        agg[k].time += a.moving_time || 0;
        agg[k].elev += a.total_elevation_gain || 0;
        if (a.average_heartrate) { agg[k].hr += a.average_heartrate; agg[k].hrCount++; }
      }
      const rows = Object.entries(agg)
        .sort((a, b) => b[1].distance - a[1].distance)
        .map(([sport, m]) => {
          const s = SPORT[sport] || { label: sport, icon: "⭐" };
          return el("tr", null,
            el("td", null, el("span", { class: "chip", "data-sport": sport }, el("span", { class: "dot" }), `${s.icon} ${s.label}`)),
            el("td", { class: "num" }, m.count),
            el("td", { class: "num" }, m.distance ? fmt.distance(m.distance) : "—"),
            el("td", { class: "num" }, fmt.duration(m.time)),
            el("td", { class: "num" }, m.elev ? fmt.elevation(m.elev) : "—"),
            el("td", { class: "num" }, m.hrCount ? `${Math.round(m.hr / m.hrCount)} bpm` : "—")
          );
        });
      box.append(
        el("div", { class: "table-wrap" },
          el("table", { class: "data" },
            el("thead", null, el("tr", null,
              el("th", null, "Sport"),
              el("th", { class: "num" }, "Activities"),
              el("th", { class: "num" }, "Distance"),
              el("th", { class: "num" }, "Time"),
              el("th", { class: "num" }, "Elevation"),
              el("th", { class: "num" }, "Avg HR")
            )),
            el("tbody", null, ...rows)
          )
        )
      );
    },
  });
})();
