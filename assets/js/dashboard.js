/* =============================================================
   dashboard.js — renders the homepage dashboard from WORKOUTS_DATA.
   Each render function targets a container by id and is a no-op if
   that container is missing, so pages can include only what they need.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, sportOf, el } = window.WK;
  const D = window.WORKOUTS_DATA;
  const $ = (id) => document.getElementById(id);

  // Sport-specific "primary metric" (pace for runs, speed for rides, etc.)
  function primaryMetric(a) {
    const s = sportOf(a);
    if (!s.primary) return null;
    return fmt[s.primary](a.average_speed);
  }

  // ---- One activity row ----
  function activityRow(a) {
    const s = sportOf(a);
    const primary = primaryMetric(a);
    return el("div", { class: "activity" },
      el("div", { class: "a-icon" }, s.icon),
      el("div", null,
        el("div", { class: "a-title" }, a.name),
        el("div", { class: "a-meta" },
          `${s.label} · ${fmt.relativeDay(a.start_date_local)}` +
          (a.average_heartrate ? ` · ${Math.round(a.average_heartrate)} bpm` : "")
        )
      ),
      el("div", { class: "a-stats" },
        el("div", { class: "big" }, a.distance ? fmt.distance(a.distance) : fmt.duration(a.moving_time)),
        el("div", { class: "sub" }, primary || fmt.duration(a.moving_time))
      )
    );
  }

  // ---- Hero: most recent activity ----
  function renderHero() {
    const box = $("hero-activity");
    if (!box) return;
    const a = [...D.activities].sort(
      (x, y) => new Date(y.start_date_local) - new Date(x.start_date_local)
    )[0];
    const s = sportOf(a);
    box.replaceChildren(
      el("div", { class: "card-head" },
        el("h3", null, "Most recent activity"),
        el("span", { class: "chip", "data-sport": a.sport_type }, el("span", { class: "dot" }), s.label)
      ),
      el("div", { class: "stat" },
        el("div", { class: "stat-label" }, fmt.relativeDay(a.start_date_local) + " · " + fmt.dateFull(a.start_date_local)),
        el("div", { style: "font-size:1.35rem;font-weight:700;margin:.15rem 0 .6rem" }, `${s.icon} ${a.name}`)
      ),
      el("div", { class: "grid cols-4" },
        miniStat("Distance", a.distance ? fmt.distance(a.distance) : "—"),
        miniStat("Time", fmt.duration(a.moving_time)),
        miniStat(s.primary === "swimPace" ? "Pace" : s.primary === "speed" ? "Speed" : "Pace", primaryMetric(a) || "—"),
        miniStat("Elevation", fmt.elevation(a.total_elevation_gain))
      )
    );
  }

  function miniStat(label, value) {
    return el("div", { class: "stat" },
      el("div", { class: "stat-label" }, label),
      el("div", { class: "stat-value", style: "font-size:1.15rem" }, value)
    );
  }

  // ---- Recent activities list ----
  function renderRecent() {
    const box = $("recent-list");
    if (!box) return;
    const list = [...D.activities]
      .sort((x, y) => new Date(y.start_date_local) - new Date(x.start_date_local))
      .slice(0, 6);
    box.replaceChildren(...list.map(activityRow));
  }

  // ---- Most recent activity per sport type ----
  function renderByType() {
    const box = $("by-type");
    if (!box) return;
    const latestBySport = {};
    for (const a of D.activities) {
      const key = a.sport_type;
      if (!latestBySport[key] || new Date(a.start_date_local) > new Date(latestBySport[key].start_date_local)) {
        latestBySport[key] = a;
      }
    }
    const cards = Object.values(latestBySport)
      .sort((x, y) => new Date(y.start_date_local) - new Date(x.start_date_local))
      .map((a) => {
        const s = sportOf(a);
        return el("div", { class: "card" },
          el("div", { class: "card-head" },
            el("span", { class: "chip", "data-sport": a.sport_type }, el("span", { class: "dot" }), s.label),
            el("span", { class: "muted small" }, fmt.relativeDay(a.start_date_local))
          ),
          el("div", { class: "a-title", style: "margin-bottom:.4rem" }, `${s.icon} ${a.name}`),
          el("div", { class: "muted small" },
            [a.distance ? fmt.distance(a.distance) : null, fmt.duration(a.moving_time), primaryMetric(a)]
              .filter(Boolean).join(" · ")
          )
        );
      });
    box.replaceChildren(...cards);
  }

  // ---- Running goals (meters + ytd ring) ----
  function renderGoals() {
    const box = $("run-goals");
    if (!box) return;
    const goals = D.goals.Run;
    const runs = D.activities.filter((a) => a.sport_type === "Run");
    const now = new Date();
    const startOfWeek = (() => {
      const d = new Date(now); const day = (d.getDay() + 6) % 7; // Monday start
      d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day); return d;
    })();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const sumSince = (since) => runs
      .filter((a) => new Date(a.start_date_local) >= since)
      .reduce((t, a) => t + a.distance, 0);

    const weekDone = sumSince(startOfWeek);
    const monthDone = sumSince(startOfMonth);
    const yearDone = D.ytd.Run.distance;

    box.replaceChildren(
      meter("This week", weekDone, goals.weekly.target),
      meter("This month", monthDone, goals.monthly.target),
      meter("This year", yearDone, goals.yearly.target)
    );

    const ring = $("run-goal-ring");
    if (ring) {
      const pct = Math.min(100, Math.round((yearDone / goals.yearly.target) * 100));
      ring.replaceChildren(
        progressRing(pct),
        el("div", null,
          el("div", { class: "stat-label" }, "Yearly goal"),
          el("div", { class: "stat-value", style: "font-size:1.3rem" }, `${fmt.km(yearDone).toFixed(0)} `,
            el("span", { class: "unit" }, `/ ${fmt.km(goals.yearly.target).toFixed(0)} km`)),
          el("div", { class: "stat-sub" }, `${fmt.km(goals.yearly.target - yearDone).toFixed(0)} km to go`)
        )
      );
    }
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

  // ---- Weekly running volume bar chart ----
  function renderWeekly() {
    const box = $("weekly-chart");
    if (!box) return;
    const data = D.runWeekly;
    const max = Math.max(...data);
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
    box.replaceChildren(bars, labels);
  }

  // ---- Key metrics per activity type (table) ----
  function renderMetricsTable() {
    const box = $("metrics-table");
    if (!box) return;
    // Aggregate the loaded activities per sport.
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
        const s = window.WK.SPORT[sport] || { label: sport, icon: "⭐" };
        return el("tr", null,
          el("td", null, el("span", { class: "chip", "data-sport": sport }, el("span", { class: "dot" }), `${s.icon} ${s.label}`)),
          el("td", { class: "num" }, m.count),
          el("td", { class: "num" }, m.distance ? fmt.distance(m.distance) : "—"),
          el("td", { class: "num" }, fmt.duration(m.time)),
          el("td", { class: "num" }, m.elev ? fmt.elevation(m.elev) : "—"),
          el("td", { class: "num" }, m.hrCount ? `${Math.round(m.hr / m.hrCount)} bpm` : "—")
        );
      });
    box.replaceChildren(
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
    );
  }

  // ---- Gear warnings ----
  function renderGearWarnings() {
    const box = $("gear-warnings");
    if (!box) return;
    const shoes = D.gear.filter((g) => g.type === "shoe" && g.active && g.retire_at);
    const items = shoes
      .map((g) => ({ g, pct: (g.distance / g.retire_at) * 100 }))
      .sort((a, b) => b.pct - a.pct)
      .map(({ g, pct }) => {
        const level = pct >= 90 ? "danger" : pct >= 75 ? "warn" : "good";
        const label = pct >= 90 ? "Replace soon" : pct >= 75 ? "Wearing" : "OK";
        const remaining = Math.max(0, g.retire_at - g.distance);
        return el("div", { class: "gear-item" },
          el("div", { class: "g-icon" }, "👟"),
          el("div", null,
            el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:.5rem" },
              el("span", { class: "g-name" }, `${g.brand_name} ${g.model_name}`),
              el("span", { class: "badge " + level }, label)
            ),
            el("div", { class: "g-mileage" }, `${fmt.km(g.distance).toFixed(0)} / ${fmt.km(g.retire_at).toFixed(0)} km · ${fmt.km(remaining).toFixed(0)} km left`),
            el("div", { class: "meter", style: "margin:.4rem 0 0" },
              el("div", { class: "track" }, el("div", { class: "fill " + (level === "good" ? "good" : level === "warn" ? "warn" : ""), style: `width:${Math.min(100, pct)}%` + (level === "danger" ? ";background:var(--color-danger)" : "") })))
          )
        );
      });
    box.replaceChildren(...items);
  }

  function init() {
    if (!D) return;
    renderHero();
    renderRecent();
    renderByType();
    renderGoals();
    renderWeekly();
    renderMetricsTable();
    renderGearWarnings();
    const stamp = document.querySelector("[data-generated]");
    if (stamp) stamp.textContent = new Date(D.generatedAt).toLocaleString("en-GB");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
