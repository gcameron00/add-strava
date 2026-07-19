/* =============================================================
   access.js — belt-and-braces check that a request came through
   Cloudflare Zero Trust Access. Access normally gates everything
   at the edge before it reaches these functions, but that rests
   entirely on dashboard-side config with no representation in
   this repo — if the Access application were ever deleted or
   misconfigured, /api/* would be exposed with no second line of
   defence. So: require the JWT header Access injects on every
   authenticated request. Presence-only; full signature
   validation would need the team domain + Access public certs.
   ============================================================= */

// Local `wrangler pages dev` has no Access layer in front of it, so the
// header never exists there — set DISABLE_ACCESS_CHECK=true in .dev.vars
// (never in the Pages project's production settings).
export function requireAccess(request, env) {
  if (env.DISABLE_ACCESS_CHECK === "true") return null;
  if (request.headers.get("cf-access-jwt-assertion")) return null;
  return new Response(
    JSON.stringify({ error: "Missing Cloudflare Access token" }),
    { status: 403, headers: { "content-type": "application/json" } }
  );
}
