/* =============================================================
   strava.js — token refresh + a thin fetch wrapper for the
   Strava v3 API. Used by functions/api/*.js route handlers.
   ============================================================= */

const TOKEN_KEY = "strava:token";
const API_BASE = "https://www.strava.com/api/v3";

// Strava's refresh token can rotate on use, so the current one lives in
// KV (seeded from the STRAVA_REFRESH_TOKEN secret) rather than only ever
// reading the secret. See https://developers.strava.com/docs/authentication/
export async function getAccessToken(env) {
  const cached = await env.WORKOUTS_KV.get(TOKEN_KEY, "json");
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.expires_at > now + 60) {
    return cached.access_token;
  }

  const refreshToken = cached?.refresh_token || env.STRAVA_REFRESH_TOKEN;
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  await env.WORKOUTS_KV.put(
    TOKEN_KEY,
    JSON.stringify({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    })
  );
  return data.access_token;
}

export async function stravaGet(env, path, params = {}) {
  const accessToken = await getAccessToken(env);
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Strava GET ${path} failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}
