/* =============================================================
   strava.js — token refresh + a thin fetch wrapper for the
   Strava v3 API. Used by functions/api/*.js route handlers.
   ============================================================= */

const TOKEN_KEY = "strava:token";
const API_BASE = "https://www.strava.com/api/v3";

// Strava's refresh token can rotate on use, so the current one lives in
// KV (seeded from the STRAVA_REFRESH_TOKEN secret) rather than only ever
// reading the secret. See https://developers.strava.com/docs/authentication/
export async function getAccessToken(env, { forceRefresh = false } = {}) {
  const cached = await env.WORKOUTS_KV.get(TOKEN_KEY, "json");
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && cached && cached.expires_at > now + 60) {
    return cached.access_token;
  }

  // On a forced refresh (triggered by a 401 from a live call) the cached
  // refresh token is suspect too, so go back to the secret rather than
  // reusing it — otherwise updating STRAVA_REFRESH_TOKEN would never
  // actually take effect while a KV-cached token still exists.
  const refreshToken = forceRefresh ? env.STRAVA_REFRESH_TOKEN : cached?.refresh_token || env.STRAVA_REFRESH_TOKEN;
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
  const res = await fetchStrava(path, params, accessToken);
  if (res.ok) return res.json();

  if (res.status !== 401) {
    throw new Error(`Strava GET ${path} failed: ${res.status} ${await res.text()}`);
  }

  // A 401 means the cached access token is invalid — expired past our buffer,
  // revoked, or left over from before the refresh token / its scopes changed.
  // Drop it, force a fresh exchange, and retry once before giving up.
  const freshToken = await getAccessToken(env, { forceRefresh: true });
  const retry = await fetchStrava(path, params, freshToken);
  if (!retry.ok) {
    throw new Error(`Strava GET ${path} failed: ${retry.status} ${await retry.text()}`);
  }
  return retry.json();
}

function fetchStrava(path, params, accessToken) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, v);
  }
  return fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
}
