/* =============================================================
   main.js — shared behaviour + formatting helpers
   Loaded on every page. Exposes helpers on window.WK.
   ============================================================= */
(function () {
  "use strict";

  /* ---------- Theme toggle (persisted) ---------- */
  const root = document.documentElement;
  const stored = localStorage.getItem("wk-theme");
  if (stored === "light" || stored === "dark") root.setAttribute("data-theme", stored);

  function toggleTheme() {
    const current =
      root.getAttribute("data-theme") ||
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("wk-theme", next);
  }

  /* ---------- Nav: mobile toggle + active link ---------- */
  function initNav() {
    const btn = document.querySelector(".nav-toggle");
    const nav = document.querySelector(".nav");
    if (btn && nav) {
      btn.addEventListener("click", () => {
        const open = nav.classList.toggle("open");
        btn.setAttribute("aria-expanded", String(open));
      });
    }
    // Delegated so the theme button survives renderNav rebuilding the links.
    if (nav) {
      nav.addEventListener("click", (e) => {
        if (e.target.closest("[data-theme-toggle]")) toggleTheme();
      });
    }

    // Mark the current page in the static nav (renderNav redoes this once
    // the layout document is known).
    const path = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    document.querySelectorAll(".nav a").forEach((a) => {
      const href = a.getAttribute("href").replace(/\/$/, "") || "/";
      if (href === path) a.setAttribute("aria-current", "page");
    });
  }

  /* ---------- Portal routing + dynamic nav ---------- */
  // The first portal page lives at "/"; every other page at /p/<slug>
  // (a _redirects 200-rewrite serves the root shell for /p/*).
  function hrefFor(slug, pages) {
    return pages && pages.length && pages[0].slug === slug ? "/" : `/p/${slug}`;
  }

  // Rebuild the nav links from the layout document's pages, keeping the
  // fixed Settings/About entries and the theme toggle at the end.
  function renderNav(pages, activeSlug) {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const path = location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    const fixed = [["Settings", "/settings/"], ["About", "/about/"]].map(([label, href]) => {
      const a = el("a", { href }, label);
      if (href.replace(/\/$/, "") === path) a.setAttribute("aria-current", "page");
      return a;
    });
    nav.replaceChildren(
      ...pages.map((p) => {
        const a = el("a", { href: hrefFor(p.slug, pages) }, p.title);
        if (p.slug === activeSlug) a.setAttribute("aria-current", "page");
        return a;
      }),
      ...fixed,
      el("button", { class: "icon-btn", "data-theme-toggle": "", "aria-label": "Toggle light/dark theme" }, "◑")
    );
  }

  /* ---------- Formatters ---------- */
  const fmt = {
    // metres -> "8.2 km" (or "950 m" for short distances)
    distance(m) {
      if (m == null) return "—";
      if (m < 1000) return `${Math.round(m)} m`;
      return `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
    },
    km(m) { return m == null ? 0 : m / 1000; },
    // seconds -> "1:23:45" or "23:45"
    duration(s) {
      if (s == null) return "—";
      s = Math.round(s);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      const pad = (n) => String(n).padStart(2, "0");
      return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
    },
    // running pace from m/s -> "4:52 /km"
    pace(mps) {
      if (!mps) return "—";
      const secPerKm = 1000 / mps;
      const m = Math.floor(secPerKm / 60);
      const s = Math.round(secPerKm % 60);
      return `${m}:${String(s).padStart(2, "0")} /km`;
    },
    // m/s -> "22.6 km/h"
    speed(mps) {
      if (!mps) return "—";
      return `${(mps * 3.6).toFixed(1)} km/h`;
    },
    // swim pace m/s -> "1:38 /100m"
    swimPace(mps) {
      if (!mps) return "—";
      const secPer100 = 100 / mps;
      const m = Math.floor(secPer100 / 60);
      const s = Math.round(secPer100 % 60);
      return `${m}:${String(s).padStart(2, "0")} /100m`;
    },
    elevation(m) { return m == null ? "—" : `${Math.round(m)} m`; },
    // ISO date -> "Today", "Yesterday", "3 days ago", or "12 Jun"
    relativeDay(iso) {
      const then = new Date(iso);
      const today = new Date();
      const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diffDays = Math.round((startOfDay(today) - startOfDay(then)) / 86400000);
      if (diffDays <= 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 14) return "Last week";
      return then.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    },
    dateFull(iso) {
      return new Date(iso).toLocaleDateString("en-GB", {
        weekday: "short", day: "numeric", month: "short",
      });
    },
  };

  /* ---------- Sport metadata ---------- */
  const SPORT = {
    Run: { label: "Run", icon: "🏃", primary: "pace" },
    Ride: { label: "Ride", icon: "🚴", primary: "speed" },
    Swim: { label: "Swim", icon: "🏊", primary: "swimPace" },
    Walk: { label: "Walk", icon: "🚶", primary: "pace" },
    Hike: { label: "Hike", icon: "🥾", primary: "speed" },
    WeightTraining: { label: "Strength", icon: "🏋️", primary: null },
    Workout: { label: "Workout", icon: "💪", primary: null },
  };
  function sportOf(a) {
    return SPORT[a.sport_type] || SPORT[a.type] ||
      { label: a.sport_type || "Other", icon: "⭐", primary: null };
  }

  /* ---------- Date helpers ---------- */
  // Monday-start week — the one week definition used everywhere (goal meters,
  // weekly chart) so the numbers can't drift apart.
  function startOfWeek(now = new Date()) {
    const d = new Date(now);
    const day = (d.getDay() + 6) % 7;
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  }

  /* ---------- Tiny DOM helper ---------- */
  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        if (k === "class") node.className = v;
        else if (k === "html") node.innerHTML = v;
        else if (k === "aria") for (const [ak, av] of Object.entries(v)) node.setAttribute("aria-" + ak, av);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children.flat()) {
      if (c == null) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  window.WK = { fmt, SPORT, sportOf, el, toggleTheme, startOfWeek, hrefFor, renderNav, DAY: 86400000 };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNav);
  } else {
    initNav();
  }
})();
