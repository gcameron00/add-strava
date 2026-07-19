/* =============================================================
   gear-widgets.js — gear watch, shoe/bike overviews, single-gear
   widgets, plus the strava-links and text-card utility widgets.
   Extracted from the old gear.js and dashboard.js renderGearWarnings.
   Retirement targets and groups are athlete-defined (KV config),
   not provided by Strava.
   ============================================================= */
(function () {
  "use strict";
  const { fmt, el } = window.WK;
  const { register, ui } = window.WK.widgets;

  function wearLevel(pct) {
    if (pct >= 90) return { level: "danger", label: "Replace soon" };
    if (pct >= 75) return { level: "warn", label: "Wearing" };
    return { level: "good", label: "Good" };
  }

  function wearFill(pct, wl) {
    const fillCls = wl.level === "good" ? "good" : wl.level === "warn" ? "warn" : "danger";
    return el("div", { class: "meter" },
      el("div", { class: "track" },
        el("div", { class: "fill " + fillCls, style: `width:${Math.min(100, pct)}%` })));
  }

  const gearIcon = (g) => (g.type === "shoe" ? "👟" : g.type === "bike" ? "🚲" : "⚙️");

  // Card body for one piece of gear (used by the overview grids and the
  // single shoe/bike widgets). Returns child nodes, not the card itself.
  function gearCardContent(g) {
    const hasTarget = g.retire_at != null;
    const pct = hasTarget ? (g.distance / g.retire_at) * 100 : null;
    const wl = hasTarget ? wearLevel(pct) : null;

    const head = ui.cardHead(`${gearIcon(g)} ${g.brand_name} ${g.model_name}`,
      g.primary ? el("span", { class: "badge good" }, "Primary")
        : (wl ? el("span", { class: "badge " + wl.level }, wl.label) : null));

    const meta = el("div", { class: "muted small gear-meta" },
      [g.nickname, g.active ? "Active" : "Retired"].filter(Boolean).join(" · "));

    const dist = el("div", { class: "stat gear-dist" },
      el("div", { class: "stat-value stat-value-xl" }, fmt.km(g.distance).toFixed(0), el("span", { class: "unit" }, "km")),
      el("div", { class: "stat-sub" }, hasTarget
        ? `${fmt.km(Math.max(0, g.retire_at - g.distance)).toFixed(0)} km until suggested replacement`
        : "No replacement target set")
    );

    const children = [head, meta, dist];
    if (hasTarget) children.push(wearFill(pct, wl));
    return children;
  }

  /* ---- Gear watch: shoes closest to retirement ---- */
  register({
    id: "gear-warnings",
    title: "Gear watch",
    icon: "👟",
    description: "Shoes ranked by wear against their replacement targets.",
    defaultSpan: 12,
    render(box, D) {
      box.append(ui.cardHead("Gear watch 👟", el("a", { href: "/p/gear" }, "Manage gear →")));
      const shoes = D.gear.filter((g) => g.type === "shoe" && g.active && g.retire_at);
      if (!shoes.length) {
        box.append(ui.emptyMessage("No shoes with a replacement target yet."));
        return;
      }
      const items = shoes
        .map((g) => ({ g, pct: (g.distance / g.retire_at) * 100 }))
        .sort((a, b) => b.pct - a.pct)
        .map(({ g, pct }) => {
          const wl = wearLevel(pct);
          const remaining = Math.max(0, g.retire_at - g.distance);
          return el("div", { class: "gear-item" },
            el("div", { class: "g-icon" }, "👟"),
            el("div", null,
              el("div", { class: "g-row" },
                el("span", { class: "g-name" }, `${g.brand_name} ${g.model_name}`),
                el("span", { class: "badge " + wl.level }, wl.label)
              ),
              el("div", { class: "g-mileage" }, `${fmt.km(g.distance).toFixed(0)} / ${fmt.km(g.retire_at).toFixed(0)} km · ${fmt.km(remaining).toFixed(0)} km left`),
              wearFill(pct, wl)
            )
          );
        });
      box.append(...items);
      box.append(ui.footnote("Replacement targets are set manually — not provided by Strava."));
    },
  });

  /* ---- All shoes, grouped by the athlete-defined group tag ---- */
  register({
    id: "shoes-overview",
    title: "Shoes overview",
    icon: "👟",
    description: "Every shoe on Strava, grouped by tag, with wear bars.",
    defaultSpan: 12,
    bare: true,
    render(box, D) {
      box.append(el("div", { class: "section-head" }, el("h2", null, "Shoes 👟")));
      const shoes = D.gear.filter((g) => g.type === "shoe");
      if (!shoes.length) {
        box.append(ui.emptyMessage("No shoes tracked on Strava."));
        return;
      }
      const groups = new Map();
      for (const g of shoes) {
        const key = g.group || "Other";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(g);
      }
      const keys = [...groups.keys()].sort((a, b) => {
        if (a === "Other") return 1;
        if (b === "Other") return -1;
        return a.localeCompare(b);
      });
      box.append(...keys.map((key) =>
        el("div", { class: "gear-group" },
          el("h3", null, key),
          el("div", { class: "grid cols-3" },
            ...groups.get(key).map((g) => el("div", { class: "card" }, ...gearCardContent(g))))
        )
      ));
    },
  });

  /* ---- All bikes ---- */
  register({
    id: "bikes-overview",
    title: "Bikes overview",
    icon: "🚲",
    description: "Every bike on Strava with total distance.",
    defaultSpan: 12,
    bare: true,
    render(box, D) {
      box.append(el("div", { class: "section-head" }, el("h2", null, "Bikes 🚲")));
      const bikes = D.gear.filter((g) => g.type === "bike");
      if (!bikes.length) {
        box.append(ui.emptyMessage("No bikes tracked on Strava."));
        return;
      }
      box.append(el("div", { class: "grid cols-3" },
        ...bikes.map((g) => el("div", { class: "card" }, ...gearCardContent(g)))));
    },
  });

  /* ---- One specific shoe / bike ---- */
  // gearId binds the instance to one piece of gear; retire-at and group are
  // write-through fields saved via POST /api/config, not the layout doc.
  function singleGearTemplate(type, title, icon, description) {
    register({
      id: type,
      title,
      icon,
      description,
      defaultSpan: 4,
      configSchema: [
        { key: "gearId", type: "gearSelect", gearType: type, label: title, required: true },
        ...(type === "shoe" ? [
          { key: "retireAtKm", type: "number", label: "Retire at (km)", writeThrough: "gearConfig", configKey: "retire_at" },
          { key: "group", type: "text", label: "Group", writeThrough: "gearConfig", configKey: "group" },
        ] : []),
      ],
      render(box, D, config) {
        const g = D.gear.find((x) => x.id === config.gearId && x.type === type);
        if (!g) {
          box.append(ui.cardHead(`${icon} ${title}`),
            ui.emptyMessage(config.gearId
              ? "This gear is no longer on Strava — pick another in the widget settings."
              : "Pick which one in the widget settings (edit mode → ⚙)."));
          return;
        }
        box.append(...gearCardContent(g));
      },
    });
  }
  singleGearTemplate("shoe", "Shoe", "👟", "One shoe's mileage and wear against its retirement target.");
  singleGearTemplate("bike", "Bike", "🚲", "One bike's total distance.");

  /* ---- Strava deep links ---- */
  register({
    id: "strava-links",
    title: "Open in Strava",
    icon: "🔗",
    description: "Deep links to the Strava pages behind this dashboard.",
    defaultSpan: 4,
    render(box) {
      box.append(
        ui.cardHead("Open in Strava"),
        el("p", { class: "muted small" }, "Deep links out to the real Strava pages that back this dashboard."),
        el("div", { class: "access-links start" },
          el("a", { class: "btn primary", href: "https://www.strava.com/athlete/training", target: "_blank", rel: "noopener" }, "Training log ↗"),
          el("a", { class: "btn", href: "https://www.strava.com/athletes/me", target: "_blank", rel: "noopener" }, "My profile ↗"),
          el("a", { class: "btn", href: "https://www.strava.com/settings/gear", target: "_blank", rel: "noopener" }, "Gear ↗")
        )
      );
    },
  });

  /* ---- Free-text card ---- */
  // Body: blank-line-separated paragraphs; lines starting "- " become bullets.
  register({
    id: "text-card",
    title: "Text card",
    icon: "📝",
    description: "A card with your own title and text (paragraphs and bullets).",
    defaultSpan: 12,
    configSchema: [
      { key: "title", type: "text", label: "Title" },
      { key: "body", type: "textarea", label: "Body" },
      { key: "linkText", type: "text", label: "Button text", optional: true },
      { key: "linkHref", type: "text", label: "Button link", optional: true },
    ],
    render(box, D, config) {
      if (config.title) box.append(ui.cardHead(config.title));
      const prose = el("div", { class: "prose" });
      const blocks = String(config.body || "").split(/\n\s*\n/).filter((b) => b.trim());
      for (const block of blocks) {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.every((l) => l.startsWith("- "))) {
          prose.append(el("ul", null, ...lines.map((l) => el("li", null, l.slice(2)))));
        } else {
          prose.append(el("p", null, lines.join(" ")));
        }
      }
      box.append(prose);
      if (config.linkText && config.linkHref) {
        box.append(el("div", { class: "access-links start" },
          el("a", { class: "btn primary", href: config.linkHref }, config.linkText)));
      }
    },
  });
})();
