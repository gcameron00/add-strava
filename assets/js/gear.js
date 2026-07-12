/* =============================================================
   gear.js — powers the Gear overview page.
   Lists shoes and bikes tracked on Strava with wear indicators.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, el } = window.WK;
  const D = window.WORKOUTS_DATA;
  const $ = (id) => document.getElementById(id);
  if (!D) return;

  function wearLevel(pct) {
    if (pct >= 90) return { level: "danger", label: "Replace soon" };
    if (pct >= 75) return { level: "warn", label: "Wearing" };
    return { level: "good", label: "Good" };
  }

  function gearCard(g) {
    const icon = g.type === "shoe" ? "👟" : g.type === "bike" ? "🚲" : "⚙️";
    const hasTarget = g.retire_at != null;
    const pct = hasTarget ? (g.distance / g.retire_at) * 100 : null;
    const wl = hasTarget ? wearLevel(pct) : null;

    const head = el("div", { class: "card-head" },
      el("h3", null, `${icon} ${g.brand_name} ${g.model_name}`),
      g.primary ? el("span", { class: "badge good" }, "Primary") : (wl ? el("span", { class: "badge " + wl.level }, wl.label) : null)
    );

    const meta = el("div", { class: "muted small", style: "margin-bottom:.6rem" },
      [g.nickname, g.active ? "Active" : "Retired"].filter(Boolean).join(" · "));

    const dist = el("div", { class: "stat", style: "margin-bottom:.4rem" },
      el("div", { class: "stat-value", style: "font-size:1.4rem" }, fmt.km(g.distance).toFixed(0), el("span", { class: "unit" }, "km")),
      el("div", { class: "stat-sub" }, hasTarget
        ? `${fmt.km(Math.max(0, g.retire_at - g.distance)).toFixed(0)} km until suggested replacement`
        : "No replacement target set")
    );

    const children = [head, meta, dist];
    if (hasTarget) {
      const fillCls = wl.level === "good" ? "good" : wl.level === "warn" ? "warn" : "";
      children.push(el("div", { class: "meter" },
        el("div", { class: "track" },
          el("div", {
            class: "fill " + fillCls,
            style: `width:${Math.min(100, pct)}%` + (wl.level === "danger" ? ";background:var(--color-danger)" : ""),
          }))));
    }
    return el("div", { class: "card" }, ...children);
  }

  function init() {
    const shoesBox = $("gear-shoes");
    const bikesBox = $("gear-bikes");
    if (shoesBox) {
      const shoes = D.gear.filter((g) => g.type === "shoe");
      shoesBox.replaceChildren(...shoes.map(gearCard));
    }
    if (bikesBox) {
      const bikes = D.gear.filter((g) => g.type === "bike");
      bikesBox.replaceChildren(...bikes.map(gearCard));
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
