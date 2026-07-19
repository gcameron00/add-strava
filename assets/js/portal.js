/* =============================================================
   portal.js — renders one portal page from the layout document.
   Loaded by data.js after WORKOUTS_DATA (and WORKOUTS_LAYOUT) are
   set. The page's shell says which layout page it shows via
   <html data-page="slug">. Every widget renders independently —
   one bad widget must not blank the rest of the page.

   Edit mode (drag/resize/add/remove/configure) lives in the
   lazily-loaded edit-mode.js, which drives the page through the
   window.WKPortal API exposed at the bottom.
   ============================================================= */
(function () {
  "use strict";
  const D = window.WORKOUTS_DATA;
  if (!D) return;
  const { el } = window.WK;
  const W = window.WK.widgets;

  // "/" (or /index.html) means the first page; /p/<slug> names one. Slug
  // handling is isolated here + WK.hrefFor so switching to hash routing
  // would be a two-function change.
  function currentSlug() {
    const path = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    const m = path.match(/^\/p\/([a-z0-9-]+)$/i);
    return m ? m[1] : null;
  }

  function savedLayout() {
    return window.WORKOUTS_LAYOUT || null;
  }

  function effectiveLayout() {
    return savedLayout() || window.WK_DEFAULT_LAYOUT;
  }

  // The doc a Save must be based on: the stored layout, or a deep copy of
  // the shipped default the first time the user customises anything.
  function baseDoc() {
    return structuredClone(effectiveLayout());
  }

  // null slug -> first page; unknown slug (deleted/renamed page, stale
  // bookmark) also falls back to the first page rather than erroring.
  function pickPage(slug) {
    const pages = effectiveLayout().pages;
    if (!slug) return pages[0];
    return pages.find((p) => p.slug === slug) || pages[0];
  }

  let activePage = null; // the page object currently rendered (from the saved doc)

  function renderPageHead(page) {
    const head = document.querySelector("[data-page-head]");
    if (!head) return;
    const customise = el("button", { class: "btn customise-btn", type: "button" }, "✏️ Customise");
    customise.addEventListener("click", openEditMode);
    head.replaceChildren(
      el("div", { class: "page-head-row" },
        el("div", null,
          page.eyebrow ? el("div", { class: "eyebrow" }, page.eyebrow) : null,
          el("h1", null, page.heading || page.title),
          page.lede ? el("p", { class: "lede" }, page.lede) : null
        ),
        el("div", { class: "portal-actions" }, customise)
      )
    );
    if (page.title) document.title = `Workouts · ${page.title}`;
  }

  // One widget instance -> its grid cell. Errors and unknown templates get
  // a visible placeholder instead of taking the page down.
  function renderWidget(w) {
    const span = Math.min(12, Math.max(1, Math.round(Number(w.span) || 4)));
    const tpl = W.get(w.templateId);
    const bare = !!(tpl && tpl.bare);
    const cell = el("div", {
      class: (bare ? "widget-bare" : "card") + ` span-${span}`,
      "data-instance-id": w.instanceId,
      "data-template-id": w.templateId,
    });
    if (!tpl) {
      cell.append(
        el("div", { class: "card-head" }, el("h3", null, "Unknown widget")),
        el("p", { class: "muted small" }, `No widget template called “${w.templateId}” exists in this version of the site.`)
      );
      return cell;
    }
    try {
      tpl.render(cell, D, w.config || {});
    } catch (err) {
      console.error(`portal: widget ${w.templateId} (${w.instanceId}) failed`, err);
      cell.replaceChildren(
        el("div", { class: "card-head" }, el("h3", null, `${tpl.icon || "⚠"} ${tpl.title}`)),
        el("p", { class: "muted small" }, "This widget hit an error — see the console.")
      );
    }
    return cell;
  }

  function renderGrid(page) {
    const grid = document.querySelector("[data-portal-grid]");
    if (!grid) return;
    grid.replaceChildren(...(page.widgets || []).map(renderWidget));
    if (!(page.widgets || []).length) {
      grid.append(el("div", { class: "widget-bare span-12" },
        el("p", { class: "muted" }, "This page has no widgets yet — hit Customise to add some.")));
    }
  }

  function renderPage(page) {
    activePage = page;
    window.WK.renderNav(effectiveLayout().pages, page.slug);
    renderPageHead(page);
    renderGrid(page);
  }

  /* ---- Edit mode: lazily inject edit-mode.js on first use ---- */
  let editLoading = false;
  function openEditMode() {
    if (window.WKPortalEdit) {
      window.WKPortalEdit.enter();
      return;
    }
    if (editLoading) return;
    editLoading = true;
    const s = document.createElement("script");
    s.src = "/assets/js/edit-mode.js";
    s.onload = () => window.WKPortalEdit && window.WKPortalEdit.enter();
    s.onerror = () => { editLoading = false; console.error("Failed to load edit-mode.js"); };
    document.head.appendChild(s);
  }

  function init() {
    renderPage(pickPage(currentSlug()));
    const stamp = document.querySelector("[data-generated]");
    if (stamp) stamp.textContent = new Date(D.generatedAt).toLocaleString("en-GB");
  }

  // API for edit-mode.js (and Phase 4 page management).
  window.WKPortal = {
    data: D,
    currentSlug,
    savedLayout,
    effectiveLayout,
    baseDoc,
    pickPage,
    renderWidget,
    renderGrid,
    renderPage,
    getActivePage: () => activePage,
    setSavedLayout(layout) { window.WORKOUTS_LAYOUT = layout; },
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
