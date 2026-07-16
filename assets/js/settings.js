/* =============================================================
   settings.js — powers /restricted/settings/. Lets you set distance
   goals and shoe retirement targets, neither of which come from
   Strava, and saves them to KV via GET/POST /api/config.
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

  function textField(id, label, value) {
    return el("label", { class: "field" },
      el("span", null, label),
      el("input", { type: "text", id, placeholder: "e.g. Hiking", value: value || "" })
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

  function renderGearFields(gearList, gearConfig) {
    const box = $("gear-fields");
    if (!box) return;
    const shoes = gearList.filter((g) => g.type === "shoe" && g.active);
    if (!shoes.length) {
      box.replaceChildren(el("p", { class: "muted" }, "No active shoes found on Strava."));
      return;
    }
    const rows = shoes.map((g) => {
      const current = gearConfig[g.id]?.retire_at;
      const km = current != null ? current / 1000 : null;
      const group = gearConfig[g.id]?.group || "";
      return el("div", { class: "gear-item editable" },
        el("div", { class: "g-icon" }, "👟"),
        el("div", null,
          el("div", { class: "g-name" }, `${g.brand_name} ${g.model_name}`),
          el("div", { class: "g-mileage" }, `${g.nickname ? g.nickname + " · " : ""}${(g.distance / 1000).toFixed(0)} km so far`)
        ),
        textField(`group-${g.id}`, "Group", group),
        numberField(`gear-${g.id}`, "Retire at", km)
      );
    });
    box.replaceChildren(...rows);
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

  function collectGear(shoes) {
    const gear = {};
    for (const g of shoes) {
      const kmInput = $(`gear-${g.id}`);
      const groupInput = $(`group-${g.id}`);
      const km = kmInput && kmInput.value !== "" ? Number(kmInput.value) : null;
      const group = groupInput && groupInput.value.trim() !== "" ? groupInput.value.trim() : null;
      const entry = {};
      if (km != null && km > 0) entry.retire_at = Math.round(km * 1000);
      if (group) entry.group = group;
      if (Object.keys(entry).length) gear[g.id] = entry;
    }
    return gear;
  }

  async function init() {
    const status = $("save-status");
    const btn = $("save-btn");
    let shoes = [];

    try {
      const [summary, config] = await Promise.all([
        fetch("/api/summary").then((r) => r.json()),
        fetch("/api/config").then((r) => r.json()),
      ]);
      shoes = (summary.gear || []).filter((g) => g.type === "shoe" && g.active);
      renderGoalsFields(config.goals || {});
      renderGearFields(summary.gear || [], config.gear || {});
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
          const body = { goals: collectGoals(), gear: collectGear(shoes) };
          const res = await fetch("/api/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
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
