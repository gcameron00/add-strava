/* Validation for the portal layout document (KV key "layout").
   Mirrors sanitizeConfig's defensive style: clamp what can be clamped,
   reject what can't. The server deliberately does NOT check templateIds
   against a widget list — it can't know the client registry — the client
   renders a placeholder for templates it doesn't recognise. */

const ID_RE = /^[a-z0-9-]{1,64}$/i;
// Slugs that must never become portal pages: real routes and asset roots.
const RESERVED_SLUGS = new Set(["settings", "about", "api", "assets", "restricted-settings", "p"]);

const MAX_PAGES = 12;
const MAX_WIDGETS_PER_PAGE = 40;
const MAX_WIDGET_CONFIG_BYTES = 2048;
const MAX_DOC_BYTES = 128 * 1024;

// Returns { layout } on success or { error } on failure.
export function sanitizeLayout(body) {
  if (!body || typeof body !== "object") return { error: "Body must be a JSON object" };
  if (body.version !== 1) return { error: "Unsupported layout version" };
  if (!Array.isArray(body.pages)) return { error: "pages must be an array" };
  if (body.pages.length < 1) return { error: "At least one page is required" };
  if (body.pages.length > MAX_PAGES) return { error: `At most ${MAX_PAGES} pages` };

  const slugs = new Set();
  const pages = [];
  for (const raw of body.pages) {
    if (!raw || typeof raw !== "object") return { error: "Each page must be an object" };
    const id = str(raw.id, 64);
    const slug = str(raw.slug, 64);
    if (!id || !ID_RE.test(id)) return { error: "Bad page id" };
    if (!slug || !ID_RE.test(slug)) return { error: `Bad page slug: ${JSON.stringify(raw.slug).slice(0, 80)}` };
    const key = slug.toLowerCase();
    if (RESERVED_SLUGS.has(key)) return { error: `Slug "${slug}" is reserved` };
    if (slugs.has(key)) return { error: `Duplicate slug "${slug}"` };
    slugs.add(key);

    const title = str(raw.title, 80);
    if (!title) return { error: `Page "${slug}" needs a title` };

    if (!Array.isArray(raw.widgets)) return { error: `Page "${slug}": widgets must be an array` };
    if (raw.widgets.length > MAX_WIDGETS_PER_PAGE) {
      return { error: `Page "${slug}": at most ${MAX_WIDGETS_PER_PAGE} widgets` };
    }
    const widgets = [];
    for (const w of raw.widgets) {
      if (!w || typeof w !== "object") return { error: `Page "${slug}": each widget must be an object` };
      const instanceId = str(w.instanceId, 64);
      const templateId = str(w.templateId, 64);
      if (!instanceId || !ID_RE.test(instanceId)) return { error: `Page "${slug}": bad widget instanceId` };
      if (!templateId || !ID_RE.test(templateId)) return { error: `Page "${slug}": bad widget templateId` };
      const span = Math.min(12, Math.max(1, Math.round(Number(w.span)) || 4));
      const config = w.config && typeof w.config === "object" && !Array.isArray(w.config) ? w.config : {};
      if (JSON.stringify(config).length > MAX_WIDGET_CONFIG_BYTES) {
        return { error: `Page "${slug}": widget config too large` };
      }
      widgets.push({ instanceId, templateId, span, config });
    }

    pages.push({
      id, slug, title,
      eyebrow: str(raw.eyebrow, 80) || "",
      heading: str(raw.heading, 120) || title,
      lede: str(raw.lede, 300) || "",
      widgets,
    });
  }

  const layout = { version: 1, pages };
  if (JSON.stringify(layout).length > MAX_DOC_BYTES) return { error: "Layout document too large" };
  return { layout };
}

function str(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
