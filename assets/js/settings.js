/* =============================================================
   settings.js — powers /settings/. Distance goals (saved to KV via
   GET/POST /api/config) and portal-layout housekeeping. Shoe
   retirement targets and groups are edited on the shoe widgets in
   Customise mode, not here.
   ============================================================= */
(function () {
  "use strict";
  const { el } = window.WK;
  const $ = (id) => document.getElementById(id);

  const SPORTS = [
    { key: "Run", label: "Running", icon: "🏃" },
    { key: "Ride", label: "Riding", icon: "🚴" },
    { key: "Swim", label: "Swimming", icon: "🏊" },
  ];
  const PERIODS = [
    { key: "weekly", label: "Weekly" },
    { key: "monthly", label: "Monthly" },
    { key: "yearly", label: "Yearly" },
  ];

  function numberField(id, label, value) {
    return el("label", { class: "field" },
      el("span", null, label),
      el("input", {
        type: "number", id, min: "0", step: "0.1", placeholder: "km",
        value: value != null ? String(value) : "",
      })
    );
  }

  function renderGoalsFields(goals) {
    const box = $("goals-fields");
    if (!box) return;
    const cards = SPORTS.map((sport) => {
      const sportGoals = goals[sport.key] || {};
      const fields = PERIODS.map((p) => {
        const km = sportGoals[p.key]?.target != null ? sportGoals[p.key].target / 1000 : null;
        return numberField(`goal-${sport.key}-${p.key}`, p.label, km);
      });
      return el("div", { class: "card" },
        el("div", { class: "card-head" }, el("h3", null, `${sport.icon} ${sport.label}`)),
        ...fields
      );
    });
    box.replaceChildren(...cards);
  }

  function collectGoals() {
    const goals = {};
    for (const sport of SPORTS) {
      const sportGoals = {};
      for (const p of PERIODS) {
        const input = $(`goal-${sport.key}-${p.key}`);
        const km = input && input.value !== "" ? Number(input.value) : null;
        if (km != null && km > 0) sportGoals[p.key] = { target: Math.round(km * 1000), unit: "km" };
      }
      if (Object.keys(sportGoals).length) goals[sport.key] = sportGoals;
    }
    return goals;
  }

  function initResetLayout() {
    const btn = $("reset-layout-btn");
    const status = $("reset-status");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      if (!confirm("Reset all pages and widgets to the shipped defaults? Your goals and gear settings are kept.")) return;
      btn.disabled = true;
      if (status) status.textContent = "Resetting…";
      try {
        const res = await fetch("/api/layout", { method: "DELETE" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (status) status.textContent = "Layout reset.";
      } catch (err) {
        console.error("Failed to reset layout:", err);
        if (status) status.textContent = "Failed to reset — see console.";
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function init() {
    const status = $("save-status");
    const btn = $("save-btn");
    initResetLayout();

    // A failed load must not render an empty-but-plausible form: saving it
    // would clear real goals.
    try {
      const res = await fetch("/api/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const config = await res.json();
      renderGoalsFields(config.goals || {});
    } catch (err) {
      console.error("Failed to load current settings:", err);
      if (status) status.textContent = "Failed to load current settings — see console.";
      return;
    }

    if (btn) {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        if (status) status.textContent = "Saving…";
        try {
          // Always send the goals key: its presence means "replace goals
          // wholesale" to /api/config (gear-only bodies leave goals alone).
          const res = await fetch("/api/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ goals: collectGoals() }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (status) status.textContent = "Saved.";
        } catch (err) {
          console.error("Failed to save settings:", err);
          if (status) status.textContent = "Failed to save — see console.";
        } finally {
          btn.disabled = false;
        }
      });
    }
  }

  init();
})();
