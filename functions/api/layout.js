/* GET/POST/DELETE /api/layout — the portal layout document: user-defined
   pages and their widget instances. Stored wholesale in KV under "layout";
   null means "use the client-side default layout". Unlike /api/config this
   never touches cache:summary — the layout doesn't affect the Strava
   aggregate. The previous doc is kept under "layout:backup" as a
   one-deep undo for a bad save. */

import { requireAccess } from "../_lib/access.js";
import { sanitizeLayout } from "../_lib/layout.js";

const LAYOUT_KEY = "layout";
const BACKUP_KEY = "layout:backup";

export async function onRequestGet({ request, env }) {
  const denied = requireAccess(request, env);
  if (denied) return denied;
  const layout = await env.WORKOUTS_KV.get(LAYOUT_KEY, "json");
  return json({ layout: layout || null });
}

export async function onRequestPost({ request, env }) {
  const denied = requireAccess(request, env);
  if (denied) return denied;
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { layout, error } = sanitizeLayout(body);
  if (error) return json({ error }, 400);

  const previous = await env.WORKOUTS_KV.get(LAYOUT_KEY);
  if (previous != null) await env.WORKOUTS_KV.put(BACKUP_KEY, previous);
  await env.WORKOUTS_KV.put(LAYOUT_KEY, JSON.stringify(layout));
  return json({ layout });
}

// Reset to defaults: with no stored doc, the client falls back to the
// shipped WK_DEFAULT_LAYOUT.
export async function onRequestDelete({ request, env }) {
  const denied = requireAccess(request, env);
  if (denied) return denied;
  const previous = await env.WORKOUTS_KV.get(LAYOUT_KEY);
  if (previous != null) await env.WORKOUTS_KV.put(BACKUP_KEY, previous);
  await env.WORKOUTS_KV.delete(LAYOUT_KEY);
  return json({ layout: null });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
