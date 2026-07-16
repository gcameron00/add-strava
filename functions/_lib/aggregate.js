/* =============================================================
   aggregate.js — turns raw Strava API responses into the
   WORKOUTS_DATA shape the front end already renders (see
   assets/js/mock-data.js and docs/IMPLEMENTATION_PLAN.md).
   ============================================================= */
import { stravaGet } from "./strava.js";

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const LOOKBACK_DAYS = 90; // covers the activity feed + the 8-week running volume chart

export async function buildSummary(env) {
  // Goals and shoe retire_at targets aren't part of the Strava API — they're
  // athlete-defined config from /restricted/settings/, stored in KV under the
  // "config" key. Each period/sport is optional; nothing here is faked with
  // placeholder defaults.
  const config = (await env.WORKOUTS_KV.get("config", "json")) || {};
  const goals = config.goals || {};
  const gearOverrides = config.gear || {};

  const athlete = await fetchOrThrow("athlete profile", env, "/athlete");
  const activities = await fetchRecentActivities(env);
  const stats = await fetchOrThrow("athlete stats", env, `/athletes/${athlete.id}/stats`);

  const gear = await Promise.all([
    ...(athlete.shoes || []).map((g) => fetchGear(env, g.id, "shoe", gearOverrides)),
    ...(athlete.bikes || []).map((g) => fetchGear(env, g.id, "bike", gearOverrides)),
  ]);

  return {
    athlete: {
      id: athlete.id,
      firstname: athlete.firstname,
      lastname: athlete.lastname,
      profile_medium: athlete.profile_medium,
      city: athlete.city,
      country: athlete.country,
    },
    activities: activities.map(mapActivity),
    gear,
    goals,
    ytd: {
      Run: toTotals(stats.ytd_run_totals),
      Ride: toTotals(stats.ytd_ride_totals),
      Swim: toTotals(stats.ytd_swim_totals),
    },
    runWeekly: weeklyRunDistance(activities, 8),
    generatedAt: Date.now(),
  };
}

// Strava's /athlete/activities sorts newest-first by default, but switches to
// oldest-first if the `after` param is used — so instead of filtering with
// `after`, page through the default order and stop once we've gone far enough
// back (or hit a safety cap), then trim anything older than the lookback window.
const MAX_PAGES = 5; // 500 activities safety cap

async function fetchRecentActivities(env) {
  const cutoff = Date.now() - LOOKBACK_DAYS * DAY_MS;
  const perPage = 100;
  let all = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await fetchOrThrow(`athlete activities (page ${page})`, env, "/athlete/activities", {
      per_page: perPage,
      page,
    });
    all = all.concat(batch);
    const oldest = batch[batch.length - 1];
    if (batch.length < perPage) break;
    if (oldest && new Date(oldest.start_date_local).getTime() < cutoff) break;
  }
  return all.filter((a) => new Date(a.start_date_local).getTime() >= cutoff);
}

async function fetchOrThrow(label, env, path, params) {
  try {
    return await stravaGet(env, path, params);
  } catch (err) {
    throw new Error(`Unable to retrieve ${label}: ${err.message}`);
  }
}

async function fetchGear(env, id, type, overrides) {
  const g = await fetchOrThrow(`gear ${id}`, env, `/gear/${id}`);
  return {
    id: g.id,
    type,
    brand_name: g.brand_name,
    model_name: g.model_name,
    nickname: g.nickname || g.name,
    distance: g.distance,
    retire_at: overrides[id]?.retire_at ?? null,
    primary: g.primary,
    active: !g.retired,
  };
}

function toTotals(t) {
  if (!t) return { distance: 0, moving_time: 0, elevation_gain: 0, count: 0 };
  return {
    distance: t.distance,
    moving_time: t.moving_time,
    elevation_gain: t.elevation_gain,
    count: t.count,
  };
}

function mapActivity(a) {
  return {
    id: a.id,
    name: a.name,
    sport_type: a.sport_type,
    type: a.type,
    start_date_local: a.start_date_local,
    distance: a.distance,
    moving_time: a.moving_time,
    total_elevation_gain: a.total_elevation_gain,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_speed: a.average_speed,
    suffer_score: a.suffer_score ?? null,
    gear_id: a.gear_id ?? null,
  };
}

// metres of running per week, oldest to newest, for the last `weeks` weeks.
function weeklyRunDistance(activities, weeks) {
  const now = Date.now();
  const buckets = new Array(weeks).fill(0);
  for (const a of activities) {
    if (a.sport_type !== "Run") continue;
    const ageMs = now - new Date(a.start_date_local).getTime();
    const idx = weeks - 1 - Math.floor(ageMs / WEEK_MS);
    if (idx >= 0 && idx < weeks) buckets[idx] += a.distance;
  }
  return buckets;
}
