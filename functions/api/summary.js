/* GET /api/summary — the dashboard payload, cached in KV for 15 min to
   stay well within Strava's rate limits (100 req/15 min, 1000/day). */
import { buildSummary } from "../_lib/aggregate.js";

const CACHE_KEY = "cache:summary";
const CACHE_TTL_MS = 15 * 60 * 1000;

export async function onRequestGet({ env }) {
  const cached = await env.WORKOUTS_KV.get(CACHE_KEY, "json");
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return json(cached.data);
  }

  try {
    const data = await buildSummary(env);
    await env.WORKOUTS_KV.put(CACHE_KEY, JSON.stringify({ storedAt: Date.now(), data }));
    return json(data);
  } catch (err) {
    // Serve a stale cache rather than a broken dashboard if Strava is
    // unreachable or rate-limited.
    if (cached) return json(cached.data);
    return json({ error: String(err) }, 502);
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
