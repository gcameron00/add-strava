/* =============================================================
   nav.js — dynamic nav for non-portal pages (/settings/, /about/).
   Portal pages get their nav from portal.js; these static pages
   fetch the layout document themselves so the nav shows the user's
   pages, falling back to the shipped default (or the static HTML
   nav) when the fetch fails.
   ============================================================= */
(function () {
  "use strict";
  async function init() {
    let pages = null;
    try {
      const res = await fetch("/api/layout");
      if (res.ok) pages = (await res.json()).layout?.pages || null;
    } catch { /* fall through to default */ }
    pages = pages || window.WK_DEFAULT_LAYOUT?.pages;
    if (pages) window.WK.renderNav(pages, null);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
