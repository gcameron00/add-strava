/* =============================================================
   registry.js — widget template registry + shared render helpers.
   A widget template is:
     { id, title, icon, description, defaultSpan, bare?, configSchema?,
       render(container, D, config) }
   - `render` builds DOM into `container` (a .card unless `bare`) and must
     tolerate empty data; throws are caught per-widget by portal.js.
   - `configSchema` drives the auto-generated per-instance config dialog
     in edit mode. Field: { key, type, label, ... } where type is one of
     "text" | "number" | "select" | "sportSelect" | "gearSelect".
     `writeThrough: "gearConfig"` fields save via POST /api/config
     (retire_at / group) instead of the layout document.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, sportOf, el } = window.WK;

  const templates = new Map();

  /* ---------- Shared helpers used by several widget modules ---------- */

  function byDateDesc(list) {
    return [...list].sort(
      (x, y) => new Date(y.start_date_local) - new Date(x.start_date_local)
    );
  }

  // Sport-specific "primary metric" (pace for runs, speed for rides, etc.)
  function primaryMetric(a) {
    const s = sportOf(a);
    if (!s.primary) return null;
    return fmt[s.primary](a.average_speed);
  }

  function emptyMessage(text) {
    return el("p", { class: "muted small" }, text);
  }

  function cardHead(title, aside) {
    return el("div", { class: "card-head" },
      typeof title === "string" ? el("h3", null, title) : title,
      aside || null
    );
  }

  function footnote(text) {
    return el("p", { class: "muted small footnote" }, text);
  }

  function miniStat(label, value) {
    return el("div", { class: "stat" },
      el("div", { class: "stat-label" }, label),
      el("div", { class: "stat-value stat-value-md" }, value)
    );
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

  window.WK.widgets = {
    register(t) { templates.set(t.id, t); },
    get(id) { return templates.get(id); },
    all() { return [...templates.values()]; },
    ui: { byDateDesc, primaryMetric, emptyMessage, cardHead, footnote, miniStat, activityRow },
  };
})();
