/* =============================================================
   edit-mode.js — the portal's Customise mode. Lazily loaded by
   portal.js on first use so the normal read path stays light.

   Works on a deep copy of the current page; nothing touches the
   saved layout until Save POSTs the whole document to /api/layout.
   The move/span/remove buttons are the accessible baseline — drag
   is an enhancement on top (pointer events, incl. touch).

   Write-through config fields (shoe retire-at / group) save via
   POST /api/config immediately on Apply — they're athlete gear
   settings, not layout, and live in the KV config blob.
   ============================================================= */
(function () {
  "use strict";
  const { el, SPORT } = window.WK;
  const W = window.WK.widgets;
  const P = window.WKPortal;
  const D = P.data;

  let working = null; // deep copy of the page being edited
  let originalSlug = null;
  let dirty = false;
  let bar = null;
  let dialog = null;

  const SLUG_RE = /^[a-z0-9-]{1,64}$/;
  const RESERVED_SLUGS = new Set(["settings", "about", "api", "assets", "p"]);
  const slugify = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);

  const grid = () => document.querySelector("[data-portal-grid]");
  const uuid = () =>
    (crypto.randomUUID ? crypto.randomUUID() : `w-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  /* ================= enter / exit ================= */

  function enter() {
    if (working) return;
    working = structuredClone(P.getActivePage());
    originalSlug = working.slug;
    dirty = false;
    window.addEventListener("beforeunload", warnUnsaved);
    renderBar();
    renderEditGrid();
    document.querySelector(".customise-btn")?.setAttribute("hidden", "");
  }

  function exit() {
    working = null;
    dirty = false;
    window.removeEventListener("beforeunload", warnUnsaved);
    bar?.remove();
    bar = null;
    grid()?.classList.remove("editing");
    P.renderPage(P.pickPage(P.currentSlug()));
  }

  function warnUnsaved(e) {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = "";
  }

  function markDirty() {
    dirty = true;
    setStatus("Unsaved changes");
  }

  /* ================= edit bar ================= */

  function renderBar() {
    const addBtn = el("button", { class: "btn", type: "button" }, "＋ Add widget");
    addBtn.addEventListener("click", openAddDialog);
    const pageBtn = el("button", { class: "btn", type: "button" }, "Page settings");
    pageBtn.addEventListener("click", openPageDialog);
    const newPageBtn = el("button", { class: "btn", type: "button" }, "＋ New page");
    newPageBtn.addEventListener("click", openNewPageDialog);
    const cancelBtn = el("button", { class: "btn", type: "button" }, "Cancel");
    cancelBtn.addEventListener("click", () => {
      if (dirty && !confirm("Discard your layout changes?")) return;
      exit();
    });
    const saveBtn = el("button", { class: "btn primary", type: "button" }, "Save layout");
    saveBtn.addEventListener("click", () => save(saveBtn));
    bar = el("div", { class: "edit-bar" },
      el("strong", null, "✏️ Editing layout"),
      addBtn,
      pageBtn,
      newPageBtn,
      el("span", { class: "muted small edit-status", "aria-live": "polite" }),
      el("span", { class: "spacer" }),
      cancelBtn,
      saveBtn
    );
    grid().before(bar);
  }

  function setStatus(text) {
    const s = bar?.querySelector(".edit-status");
    if (s) s.textContent = text;
  }

  /* ================= grid in edit state ================= */

  function renderEditGrid() {
    const g = grid();
    if (!g) return;
    g.classList.add("editing");
    g.replaceChildren(...working.widgets.map(renderEditCell));
    if (!working.widgets.length) {
      g.append(el("div", { class: "widget-bare span-12" },
        el("p", { class: "muted" }, "No widgets — use “＋ Add widget” above.")));
    }
  }

  function renderEditCell(w) {
    const cell = P.renderWidget(w);
    cell.classList.add("edit-cell");
    cell.append(toolbar(w));
    return cell;
  }

  const iconBtn = (label, text, onClick) => {
    const b = el("button", { class: "icon-btn tool-btn", type: "button", "aria-label": label, title: label }, text);
    b.addEventListener("click", onClick);
    return b;
  };

  function toolbar(w) {
    const tpl = W.get(w.templateId);
    const handle = el("button", {
      class: "icon-btn tool-btn drag-handle", type: "button",
      "aria-label": "Drag to reorder (or use the arrow buttons)", title: "Drag to reorder",
    }, "⠿");
    attachDrag(handle, w);
    return el("div", { class: "edit-toolbar" },
      handle,
      iconBtn("Move earlier", "◀", () => move(w, -1)),
      iconBtn("Move later", "▶", () => move(w, 1)),
      iconBtn("Narrower", "−", () => resize(w, -1)),
      iconBtn("Wider", "＋", () => resize(w, 1)),
      tpl?.configSchema?.length ? iconBtn("Widget settings", "⚙", () => openConfigDialog(w)) : null,
      iconBtn("Remove widget", "✕", () => remove(w))
    );
  }

  const indexOfW = (w) => working.widgets.findIndex((x) => x.instanceId === w.instanceId);

  function move(w, delta) {
    const i = indexOfW(w);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= working.widgets.length) return;
    [working.widgets[i], working.widgets[j]] = [working.widgets[j], working.widgets[i]];
    markDirty();
    renderEditGrid();
    grid().querySelector(`[data-instance-id="${w.instanceId}"] .drag-handle`)?.focus();
  }

  function resize(w, delta) {
    const next = Math.min(12, Math.max(1, (Number(w.span) || 4) + delta));
    if (next === w.span) return;
    w.span = next;
    markDirty();
    const cell = grid().querySelector(`[data-instance-id="${w.instanceId}"]`);
    if (cell) cell.className = cell.className.replace(/span-\d+/, `span-${next}`);
  }

  function remove(w) {
    const i = indexOfW(w);
    if (i < 0) return;
    working.widgets.splice(i, 1);
    markDirty();
    renderEditGrid();
  }

  /* ================= drag to reorder ================= */
  // The layout is an ordered flow in one grid, so dragging is purely a
  // reorder: while dragging, the placeholder (the real cell, dimmed) is
  // moved around with insertBefore and the grid reflows; on drop the new
  // DOM order becomes the working order.

  function attachDrag(handle, w) {
    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      const g = grid();
      const cell = g.querySelector(`[data-instance-id="${w.instanceId}"]`);
      if (!cell) return;

      const rect = cell.getBoundingClientRect();
      const ghost = cell.cloneNode(true);
      ghost.classList.add("drag-ghost");
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.append(ghost);
      cell.classList.add("drag-placeholder");
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      const startOrder = domOrder();
      let moved = false;

      const positionGhost = (ev) => {
        ghost.style.left = `${ev.clientX - offX}px`;
        ghost.style.top = `${ev.clientY - offY}px`;
      };
      positionGhost(e);

      const onMove = (ev) => {
        moved = true;
        positionGhost(ev);
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.(".edit-cell");
        if (!target || target === cell || target.parentElement !== g) return;
        const r = target.getBoundingClientRect();
        // Before/after by which half of the target the pointer is in —
        // horizontal midpoint for same-row targets, vertical otherwise.
        const sameRow = ev.clientY >= r.top && ev.clientY <= r.bottom;
        const before = sameRow ? ev.clientX < r.left + r.width / 2 : ev.clientY < r.top + r.height / 2;
        g.insertBefore(cell, before ? target : target.nextSibling);
      };

      const cleanup = () => {
        ghost.remove();
        cell.classList.remove("drag-placeholder");
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onCancel);
        document.removeEventListener("keydown", onKey);
      };

      const onUp = () => {
        cleanup();
        const order = domOrder();
        if (moved && order.join() !== startOrder.join()) {
          working.widgets.sort((a, b) => order.indexOf(a.instanceId) - order.indexOf(b.instanceId));
          markDirty();
        }
      };

      const onCancel = () => { cleanup(); renderEditGrid(); };
      const onKey = (ev) => { if (ev.key === "Escape") onCancel(); };

      handle.setPointerCapture(e.pointerId);
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onCancel);
      document.addEventListener("keydown", onKey);
    });
  }

  function domOrder() {
    return [...grid().querySelectorAll(":scope > [data-instance-id]")].map((c) => c.dataset.instanceId);
  }

  /* ================= dialogs ================= */

  function openDialog(...children) {
    dialog?.remove();
    dialog = el("dialog", { class: "portal-dialog" }, ...children);
    document.body.append(dialog);
    dialog.addEventListener("close", () => { dialog.remove(); dialog = null; });
    dialog.showModal();
  }

  /* ---- add widget ---- */
  function openAddDialog() {
    const rows = W.all().map((tpl) => {
      const btn = el("button", { class: "btn primary", type: "button" }, "Add");
      btn.addEventListener("click", () => {
        working.widgets.push({
          instanceId: uuid(),
          templateId: tpl.id,
          span: tpl.defaultSpan || 4,
          config: {},
        });
        markDirty();
        renderEditGrid();
        dialog.close();
        grid().lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      return el("div", { class: "widget-pick" },
        el("div", { class: "wp-icon" }, tpl.icon || "🧩"),
        el("div", null,
          el("div", { class: "wp-title" }, tpl.title),
          el("div", { class: "muted small" }, tpl.description || "")
        ),
        btn
      );
    });
    const closeBtn = el("button", { class: "btn", type: "button" }, "Close");
    closeBtn.addEventListener("click", () => dialog.close());
    openDialog(
      el("h3", null, "Add a widget"),
      el("div", { class: "widget-pick-list" }, ...rows),
      el("div", { class: "dialog-actions" }, closeBtn)
    );
  }

  /* ---- per-instance config ---- */

  function sportOptions(field) {
    const sports = field.goalSports ? ["Run", "Ride", "Swim"] : Object.keys(SPORT);
    return sports.map((s) => ({ value: s, label: `${SPORT[s]?.icon || ""} ${SPORT[s]?.label || s}`.trim() }));
  }

  function gearOptions(field) {
    return D.gear
      .filter((g) => (!field.gearType || g.type === field.gearType) && g.active)
      .map((g) => ({ value: g.id, label: [g.brand_name, g.model_name, g.nickname && `(${g.nickname})`].filter(Boolean).join(" ") }));
  }

  function selectField(name, label, options, value, allowEmpty) {
    const select = el("select", { name },
      allowEmpty ? el("option", { value: "" }, "—") : null,
      ...options.map((o) => {
        const opt = el("option", { value: o.value }, o.label);
        if (o.value === value) opt.selected = true;
        return opt;
      })
    );
    return el("label", { class: "field" }, el("span", null, label), select);
  }

  // Current value of a write-through field comes from the live gear data
  // (retire_at / group on the summary payload), not the layout config.
  function writeThroughValue(field, gearId) {
    const g = D.gear.find((x) => x.id === gearId);
    if (!g) return "";
    if (field.configKey === "retire_at") return g.retire_at != null ? String(g.retire_at / 1000) : "";
    if (field.configKey === "group") return g.group || "";
    return "";
  }

  function openConfigDialog(w) {
    const tpl = W.get(w.templateId);
    if (!tpl?.configSchema?.length) return;
    const form = el("form", { method: "dialog", class: "config-form" });

    for (const field of tpl.configSchema) {
      const val = w.config?.[field.key];
      if (field.type === "select") {
        form.append(selectField(field.key, field.label,
          field.options.map((o) => ({ value: o, label: o })), val, !!field.optional));
      } else if (field.type === "sportSelect") {
        form.append(selectField(field.key, field.label, sportOptions(field), val, !!field.optional));
      } else if (field.type === "gearSelect") {
        form.append(selectField(field.key, field.label, gearOptions(field), val, !field.required));
      } else if (field.type === "number") {
        form.append(el("label", { class: "field" }, el("span", null, field.label),
          el("input", {
            type: "number", name: field.key, min: field.min ?? 0, max: field.max ?? null, step: "any",
            value: field.writeThrough ? writeThroughValue(field, w.config?.gearId) : (val != null ? String(val) : ""),
          })));
      } else if (field.type === "textarea") {
        const ta = el("textarea", { name: field.key, rows: 6 });
        ta.value = val != null ? String(val) : "";
        form.append(el("label", { class: "field" }, el("span", null, field.label), ta));
      } else {
        form.append(el("label", { class: "field" }, el("span", null, field.label),
          el("input", {
            type: "text", name: field.key,
            value: field.writeThrough ? writeThroughValue(field, w.config?.gearId) : (val != null ? String(val) : ""),
          })));
      }
    }

    // Switching gear re-fills the write-through fields from the newly
    // selected gear so you edit that gear's values, not the old one's.
    const gearSelect = form.querySelector("select[name=gearId]");
    if (gearSelect) {
      gearSelect.addEventListener("change", () => {
        for (const field of tpl.configSchema) {
          if (!field.writeThrough) continue;
          const input = form.querySelector(`[name=${field.key}]`);
          if (input) input.value = writeThroughValue(field, gearSelect.value);
        }
      });
    }

    const status = el("span", { class: "muted small", "aria-live": "polite" });
    const cancelBtn = el("button", { class: "btn", type: "button" }, "Cancel");
    cancelBtn.addEventListener("click", () => dialog.close());
    const applyBtn = el("button", { class: "btn primary", type: "submit" }, "Apply");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const gearPatch = {};
      let gearPatchId = null;

      for (const field of tpl.configSchema) {
        const raw = fd.get(field.key);
        const value = raw == null ? "" : String(raw).trim();
        if (field.writeThrough === "gearConfig") {
          gearPatchId = String(fd.get("gearId") || w.config?.gearId || "");
          if (field.configKey === "retire_at") {
            const km = Number(value);
            if (value !== "" && km > 0) gearPatch.retire_at = Math.round(km * 1000);
          } else if (value !== "") {
            gearPatch[field.configKey] = value;
          }
          continue;
        }
        if (value === "") delete w.config[field.key];
        else if (field.type === "number") w.config[field.key] = Number(value);
        else w.config[field.key] = value;
      }

      // Gear settings save immediately (they're config, not layout) and the
      // local copy is patched so the re-render shows them right away.
      if (gearPatchId) {
        applyBtn.disabled = true;
        status.textContent = "Saving gear settings…";
        try {
          const res = await fetch("/api/config", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ gear: { [gearPatchId]: gearPatch } }),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const g = D.gear.find((x) => x.id === gearPatchId);
          if (g) {
            g.retire_at = gearPatch.retire_at ?? null;
            g.group = gearPatch.group ?? null;
          }
        } catch (err) {
          console.error("Failed to save gear settings:", err);
          status.textContent = "Failed to save gear settings — see console.";
          applyBtn.disabled = false;
          return;
        }
      }

      markDirty();
      dialog.close();
      renderEditGrid();
    });

    form.append(el("div", { class: "dialog-actions" }, status, cancelBtn, applyBtn));
    openDialog(el("h3", null, `${tpl.icon || ""} ${tpl.title} settings`.trim()), form);
  }

  /* ================= page management ================= */

  function textInput(name, label, value, placeholder) {
    return el("label", { class: "field" }, el("span", null, label),
      el("input", { type: "text", name, value: value || "", placeholder: placeholder || null }));
  }

  function validSlug(slug, ignorePageId) {
    if (!SLUG_RE.test(slug)) return "Slug must be letters, numbers and hyphens";
    if (RESERVED_SLUGS.has(slug)) return `"${slug}" is a reserved address`;
    const clash = P.effectiveLayout().pages.some((p) => p.slug === slug && p.id !== ignorePageId);
    if (clash) return `Another page already uses "${slug}"`;
    return null;
  }

  // Edit the current page's identity (title/slug/heading text). Applied to
  // the working copy — persisted by Save layout like everything else.
  function openPageDialog() {
    const form = el("form", { method: "dialog", class: "config-form" },
      textInput("title", "Page title (shown in the nav)", working.title),
      textInput("slug", "Address (/p/…)", working.slug),
      textInput("eyebrow", "Eyebrow (small text above the heading)", working.eyebrow),
      textInput("heading", "Heading", working.heading),
      textInput("lede", "Intro sentence", working.lede)
    );

    const status = el("span", { class: "muted small", "aria-live": "polite" });
    const onlyPage = P.effectiveLayout().pages.length <= 1;
    const deleteBtn = el("button", { class: "btn", type: "button" },
      onlyPage ? "Can't delete the last page" : "Delete page…");
    deleteBtn.disabled = onlyPage;
    deleteBtn.addEventListener("click", deletePage);
    const cancelBtn = el("button", { class: "btn", type: "button" }, "Cancel");
    cancelBtn.addEventListener("click", () => dialog.close());
    const applyBtn = el("button", { class: "btn primary", type: "submit" }, "Apply");

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get("title") || "").trim();
      const slug = String(fd.get("slug") || "").trim().toLowerCase();
      if (!title) { status.textContent = "A title is required"; return; }
      const slugError = validSlug(slug, working.id);
      if (slugError) { status.textContent = slugError; return; }
      working.title = title;
      working.slug = slug;
      working.eyebrow = String(fd.get("eyebrow") || "").trim();
      working.heading = String(fd.get("heading") || "").trim() || title;
      working.lede = String(fd.get("lede") || "").trim();
      markDirty();
      dialog.close();
    });

    form.append(el("div", { class: "dialog-actions" }, status, deleteBtn, cancelBtn, applyBtn));
    openDialog(el("h3", null, "Page settings"), form);
  }

  // Deleting and creating pages change the whole document, so they save
  // immediately (no working-copy limbo across a navigation).
  async function deletePage() {
    if (!confirm(`Delete the page “${working.title}” and its widgets? This saves immediately.`)) return;
    const doc = P.baseDoc();
    doc.pages = doc.pages.filter((p) => p.id !== working.id);
    const saved = await postLayout(doc);
    if (!saved) return;
    dirty = false;
    location.href = window.WK.hrefFor(saved.pages[0].slug, saved.pages);
  }

  function openNewPageDialog() {
    const form = el("form", { method: "dialog", class: "config-form" },
      textInput("title", "Page title", "", "e.g. Trail running"),
      textInput("slug", "Address (/p/…)", "", "auto from the title")
    );
    const status = el("span", { class: "muted small", "aria-live": "polite" });
    const cancelBtn = el("button", { class: "btn", type: "button" }, "Cancel");
    cancelBtn.addEventListener("click", () => dialog.close());
    const createBtn = el("button", { class: "btn primary", type: "submit" }, "Create page");

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const title = String(fd.get("title") || "").trim();
      const slug = String(fd.get("slug") || "").trim().toLowerCase() || slugify(title);
      if (!title) { status.textContent = "A title is required"; return; }
      const slugError = validSlug(slug, null);
      if (slugError) { status.textContent = slugError; return; }
      if (dirty && !confirm("Creating a page saves and leaves this one — discard its unsaved changes?")) return;

      const doc = P.baseDoc();
      doc.pages.push({ id: `p-${uuid()}`, slug, title, eyebrow: "", heading: title, lede: "", widgets: [] });
      createBtn.disabled = true;
      status.textContent = "Creating…";
      const saved = await postLayout(doc);
      if (!saved) { createBtn.disabled = false; status.textContent = "Failed — see console."; return; }
      dirty = false;
      location.href = window.WK.hrefFor(slug, saved.pages);
    });

    form.append(el("div", { class: "dialog-actions" }, status, cancelBtn, createBtn));
    openDialog(el("h3", null, "New page"), form);
  }

  /* ================= save ================= */

  async function postLayout(doc) {
    try {
      const res = await fetch("/api/layout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(doc),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || `HTTP ${res.status}`);
      P.setSavedLayout(body.layout);
      return body.layout;
    } catch (err) {
      console.error("Failed to save layout:", err);
      return null;
    }
  }

  async function save(saveBtn) {
    const doc = P.baseDoc();
    const i = doc.pages.findIndex((p) => p.id === working.id);
    if (i >= 0) doc.pages[i] = working;
    else doc.pages.push(working);

    saveBtn.disabled = true;
    setStatus("Saving…");
    const saved = await postLayout(doc);
    if (!saved) {
      setStatus("Save failed — see console.");
      saveBtn.disabled = false;
      return;
    }
    dirty = false;
    // A slug rename moves the page's address — follow it.
    if (working.slug !== originalSlug) {
      location.href = window.WK.hrefFor(working.slug, saved.pages);
      return;
    }
    exit();
  }

  window.WKPortalEdit = { enter };
})();
