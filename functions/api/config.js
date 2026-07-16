/* GET/POST /api/config — read/write the athlete-defined goals and shoe
   retirement targets. None of this comes from Strava; it's a JSON blob
   stored in KV under the "config" key, edited from /restricted/settings/. */

const CONFIG_KEY = "config";
const CACHE_KEY = "cache:summary";
const SPORTS = ["Run", "Ride", "Swim"];
const PERIODS = ["weekly", "monthly", "yearly"];

export async function onRequestGet({ env }) {
  const config = (await env.WORKOUTS_KV.get(CONFIG_KEY, "json")) || {};
  return json(config);
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const config = sanitizeConfig(body);
  await env.WORKOUTS_KV.put(CONFIG_KEY, JSON.stringify(config));
  // Force the next /api/summary call to rebuild with the new config instead
  // of serving up to 15 minutes of the old goals/retirement targets.
  await env.WORKOUTS_KV.delete(CACHE_KEY);
  return json(config);
}

// Every field is optional — anything missing, blank or non-positive is
// dropped rather than stored as a zero/null, so the dashboard can tell
// "not set" apart from "set to zero".
function sanitizeConfig(body) {
  const goals = {};
  const rawGoals = (body && body.goals) || {};
  for (const sport of SPORTS) {
    const rawSport = rawGoals[sport];
    if (!rawSport) continue;
    const sportGoals = {};
    for (const period of PERIODS) {
      const target = toPositiveNumber(rawSport[period]?.target);
      if (target != null) sportGoals[period] = { target, unit: "km" };
    }
    if (Object.keys(sportGoals).length) goals[sport] = sportGoals;
  }

  const gear = {};
  const rawGear = (body && body.gear) || {};
  for (const [id, entry] of Object.entries(rawGear)) {
    const retireAt = toPositiveNumber(entry?.retire_at);
    const group = toTrimmedString(entry?.group);
    const clean = {};
    if (retireAt != null) clean.retire_at = retireAt;
    if (group != null) clean.group = group;
    if (Object.keys(clean).length) gear[id] = clean;
  }

  return { goals, gear };
}

function toPositiveNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function toTrimmedString(v) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
