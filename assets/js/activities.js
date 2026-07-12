/* =============================================================
   activities.js — powers the "Activities by sport" page.
   Renders per-sport summary cards (YTD) + a filterable activity feed.
   Filter by sport with ?sport=Run in the URL or the filter buttons.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, sportOf, SPORT, el } = window.WK;
  const D = window.WORKOUTS_DATA;
  const $ = (id) => document.getElementById(id);
  if (!D) return;

  const params = new URLSearchParams(location.search);
  let activeSport = params.get("sport") || "All";

  function primaryMetric(a) {
    const s = sportOf(a);
    return s.primary ? fmt[s.primary](a.average_speed) : null;
  }

  // Year-to-date summary cards, one per sport that has YTD stats.
  function renderSummary() {
    const box = $("sport-summary");
    if (!box) return;
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
    box.replaceChildren(...cards);
  }

  // Filter buttons for each sport present in the feed.
  function renderFilters() {
    const box = $("sport-filters");
    if (!box) return;
    const sports = ["All", ...Array.from(new Set(D.activities.map((a) => a.sport_type)))];
    box.replaceChildren(...sports.map((sp) => {
      const s = SPORT[sp] || { label: sp === "All" ? "All" : sp, icon: sp === "All" ? "📋" : "⭐" };
      const btn = el("button", {
        class: "btn" + (sp === activeSport ? " primary" : ""),
        type: "button",
      }, `${s.icon} ${s.label}`);
      btn.addEventListener("click", () => {
        activeSport = sp;
        const url = new URL(location.href);
        if (sp === "All") url.searchParams.delete("sport"); else url.searchParams.set("sport", sp);
        history.replaceState(null, "", url);
        renderFilters();
        renderFeed();
      });
      return btn;
    }));
  }

  // Full activity feed (filtered), newest first.
  function renderFeed() {
    const box = $("activity-feed");
    if (!box) return;
    const list = [...D.activities]
      .filter((a) => activeSport === "All" || a.sport_type === activeSport)
      .sort((x, y) => new Date(y.start_date_local) - new Date(x.start_date_local));

    if (!list.length) {
      box.replaceChildren(el("p", { class: "muted" }, "No activities for this sport yet."));
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
        el("td", { class: "num" }, primaryMetric(a) || "—"),
        el("td", { class: "num" }, a.total_elevation_gain ? fmt.elevation(a.total_elevation_gain) : "—"),
        el("td", { class: "num" }, a.average_heartrate ? `${Math.round(a.average_heartrate)}` : "—")
      );
    });

    box.replaceChildren(
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

  function init() {
    renderSummary();
    renderFilters();
    renderFeed();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
