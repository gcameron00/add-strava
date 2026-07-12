/* =============================================================
   mock-data.js
   Sample data that mirrors the shape of the Strava API responses.
   This lets the front end be built and demoed with zero backend.
   When the Cloudflare Worker + Strava API are wired up, replace the
   `window.WORKOUTS_DATA` assignment with a fetch() to the Worker
   (see docs/IMPLEMENTATION_PLAN.md). The rendering code only reads
   from window.WORKOUTS_DATA, so nothing else needs to change.

   NOTE: dates are computed relative to "now" so the dashboard always
   looks fresh in the demo ("Today", "3 days ago", etc.).
   ============================================================= */
(function () {
  "use strict";

  const DAY = 86400000;
  const now = Date.now();
  const daysAgo = (d) => new Date(now - d * DAY).toISOString();

  // --- Athlete (mirrors Strava /athlete) ---
  const athlete = {
    id: 0,
    firstname: "Alex",
    lastname: "Runner",
    profile_medium: "/assets/img/avatar.svg",
    city: "Edinburgh",
    country: "United Kingdom",
  };

  // --- Recent activities (mirrors Strava /athlete/activities) ---
  // distance in metres, moving_time in seconds, elevation in metres.
  const activities = [
    {
      id: 101, name: "Morning intervals", sport_type: "Run", type: "Run",
      start_date_local: daysAgo(0), distance: 8200, moving_time: 2460,
      total_elevation_gain: 96, average_heartrate: 158, max_heartrate: 181,
      average_speed: 3.33, suffer_score: 74, gear_id: "g1",
    },
    {
      id: 102, name: "Commute home", sport_type: "Ride", type: "Ride",
      start_date_local: daysAgo(1), distance: 14300, moving_time: 2280,
      total_elevation_gain: 122, average_heartrate: 131, average_speed: 6.27,
      suffer_score: 38, gear_id: "b1",
    },
    {
      id: 103, name: "Lunch swim", sport_type: "Swim", type: "Swim",
      start_date_local: daysAgo(2), distance: 1500, moving_time: 1980,
      total_elevation_gain: 0, average_heartrate: 128, average_speed: 0.76,
      suffer_score: 30, gear_id: null,
    },
    {
      id: 104, name: "Long run — canal path", sport_type: "Run", type: "Run",
      start_date_local: daysAgo(3), distance: 21100, moving_time: 6720,
      total_elevation_gain: 168, average_heartrate: 149, max_heartrate: 172,
      average_speed: 3.14, suffer_score: 142, gear_id: "g1",
    },
    {
      id: 105, name: "Recovery walk", sport_type: "Walk", type: "Walk",
      start_date_local: daysAgo(4), distance: 5400, moving_time: 3900,
      total_elevation_gain: 40, average_heartrate: 96, average_speed: 1.38,
      suffer_score: 8, gear_id: null,
    },
    {
      id: 106, name: "Hill repeats", sport_type: "Run", type: "Run",
      start_date_local: daysAgo(6), distance: 10500, moving_time: 3300,
      total_elevation_gain: 286, average_heartrate: 162, max_heartrate: 184,
      average_speed: 3.18, suffer_score: 118, gear_id: "g2",
    },
    {
      id: 107, name: "Weekend loop", sport_type: "Ride", type: "Ride",
      start_date_local: daysAgo(7), distance: 62400, moving_time: 8100,
      total_elevation_gain: 720, average_heartrate: 141, average_speed: 7.70,
      suffer_score: 205, gear_id: "b1",
    },
    {
      id: 108, name: "Strength & core", sport_type: "WeightTraining", type: "Workout",
      start_date_local: daysAgo(8), distance: 0, moving_time: 2700,
      total_elevation_gain: 0, average_heartrate: 112, suffer_score: 22, gear_id: null,
    },
    {
      id: 109, name: "Tempo run", sport_type: "Run", type: "Run",
      start_date_local: daysAgo(10), distance: 12000, moving_time: 3240,
      total_elevation_gain: 74, average_heartrate: 165, max_heartrate: 186,
      average_speed: 3.70, suffer_score: 132, gear_id: "g2",
    },
    {
      id: 110, name: "Open water swim", sport_type: "Swim", type: "Swim",
      start_date_local: daysAgo(12), distance: 2000, moving_time: 2760,
      total_elevation_gain: 0, average_heartrate: 134, average_speed: 0.72,
      suffer_score: 55, gear_id: null,
    },
    {
      id: 111, name: "Pentland hike", sport_type: "Hike", type: "Hike",
      start_date_local: daysAgo(14), distance: 16800, moving_time: 15600,
      total_elevation_gain: 940, average_heartrate: 118, average_speed: 1.08,
      suffer_score: 90, gear_id: null,
    },
  ];

  // --- Gear (mirrors Strava /gear/{id}) ---
  // distance in metres. `retire_at` is a soft target the athlete sets.
  const gear = [
    {
      id: "g1", type: "shoe", brand_name: "Nike", model_name: "Pegasus 40",
      nickname: "Daily trainers", distance: 712000, retire_at: 800000,
      primary: true, active: true,
    },
    {
      id: "g2", type: "shoe", brand_name: "Saucony", model_name: "Endorphin Speed 3",
      nickname: "Tempo shoes", distance: 486000, retire_at: 700000,
      primary: false, active: true,
    },
    {
      id: "g3", type: "shoe", brand_name: "Hoka", model_name: "Speedgoat 5",
      nickname: "Trail shoes", distance: 224000, retire_at: 750000,
      primary: false, active: true,
    },
    {
      id: "b1", type: "bike", brand_name: "Canyon", model_name: "Endurace",
      nickname: "Road bike", distance: 4820000, retire_at: null,
      primary: true, active: true,
    },
  ];

  // --- Goals (athlete-defined; not part of the core Strava API) ---
  // These would live in Worker KV / a config file. Distances in metres.
  const goals = {
    Run: {
      weekly: { target: 40000, unit: "km" },
      monthly: { target: 160000, unit: "km" },
      yearly: { target: 1500000, unit: "km" },
    },
    Ride: {
      monthly: { target: 400000, unit: "km" },
      yearly: { target: 4000000, unit: "km" },
    },
    Swim: {
      monthly: { target: 20000, unit: "km" },
    },
  };

  // --- Year-to-date totals per sport (mirrors Strava /athlete/{id}/stats) ---
  // These are pre-aggregated so the demo doesn't have to sum a full year.
  const ytd = {
    Run:  { distance: 1042000, moving_time: 316800, elevation_gain: 12480, count: 132 },
    Ride: { distance: 2680000, moving_time: 349200, elevation_gain: 28400, count: 74 },
    Swim: { distance: 148000,  moving_time: 190800, elevation_gain: 0,     count: 61 },
  };

  // --- Weekly running volume, last 8 weeks (metres) — for the bar chart ---
  const runWeekly = [28400, 32100, 25600, 38900, 41200, 30500, 44800, 36700];

  window.WORKOUTS_DATA = { athlete, activities, gear, goals, ytd, runWeekly, generatedAt: now };
})();
