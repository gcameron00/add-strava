/* =============================================================
   aggregate.js — turns raw Strava API responses into the
   WORKOUTS_DATA shape the front end already renders (see
   assets/js/mock-data.js and docs/IMPLEMENTATION_PLAN.md).
   ============================================================= */
import { stravaGet } from "./strava.js";

// goals and shoe/bike retire_at targets aren't part of the Strava API —
// they're athlete-defined config, stored in KV under the "config" key and
// falling back to these defaults until the /restricted goals UI exists.
const DEFAULT_GOALS = {
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

const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
const LOOKBACK_DAYS = 90; // covers the activity feed + the 8-week running volume chart

export async function buildSummary(env) {
  const config = (await env.WORKOUTS_KV.get("config", "json")) || {};
  const goals = config.goals || DEFAULT_GOALS;
  const gearOverrides = config.gear || {};

  const athlete = await stravaGet(env, "/athlete");

  const after = Math.floor((Date.now() - LOOKBACK_DAYS * DAY_MS) / 1000);
  const activities = await stravaGet(env, "/athlete/activities", { after, per_page: 100 });

  const stats = await stravaGet(env, `/athletes/${athlete.id}/stats`);

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

async function fetchGear(env, id, type, overrides) {
  const g = await stravaGet(env, `/gear/${id}`);
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
