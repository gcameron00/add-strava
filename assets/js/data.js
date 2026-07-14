/* =============================================================
   data.js — fetches the live summary from the Cloudflare Pages
   Function and only then loads this page's render script (named
   via the data-render attribute on this script's own tag). On
   failure, shows an error banner instead — the render scripts
   never run with missing data, so they don't need to change.
   ============================================================= */
(function () {
  "use strict";
  const renderSrc = document.currentScript.dataset.render;

  function showError(message) {
    const main = document.querySelector("main.container");
    if (!main) return;
    const banner = document.createElement("div");
    banner.className = "banner";
    banner.setAttribute("role", "alert");
    banner.innerHTML = `<span>⚠</span><div><strong>Couldn't load your Strava data.</strong> ${message}</div>`;
    main.prepend(banner);
  }

  async function load() {
    const res = await fetch("/api/summary");
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error((body && body.error) || `HTTP ${res.status}`);
    return body;
  }

  load()
    .then((data) => {
      window.WORKOUTS_DATA = data;
      if (renderSrc) document.head.appendChild(Object.assign(document.createElement("script"), { src: renderSrc }));
    })
    .catch((err) => {
      console.error("Failed to load /api/summary:", err);
      showError(String((err && err.message) || err));
    });
})();
