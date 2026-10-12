export type PreviewTags = {
  readonly title: string
  readonly description: string
  readonly url: string
  readonly image: string
  readonly imageAlt: string
}

export type PageTemplate = { readonly plain: string; readonly before: string; readonly after: string }

export const IMAGE_WIDTH = 1200

export const IMAGE_HEIGHT = 630

const SITE_NAME = "La cour des grands"

const CHARSET = '<meta charset="utf-8" />'

const STATIC_PREVIEW_TAG = /\s*<(?:meta (?:property="og:[^"]*"|name="(?:twitter:[^"]*|description)")|link rel="canonical")[^>]*>/gi

export function escapeHtml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("'", "&#39;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

export function previewTagsHtml(tags: PreviewTags): string {
  const meta = (attribute: "property" | "name", key: string, content: string) => `<meta ${attribute}="${key}" content="${escapeHtml(content)}" />`
  return [
    meta("property", "og:title", tags.title),
    meta("property", "og:description", tags.description),
    meta("property", "og:url", tags.url),
    `<link rel="canonical" href="${escapeHtml(tags.url)}" />`,
    meta("property", "og:image", tags.image),
    meta("property", "og:image:width", String(IMAGE_WIDTH)),
    meta("property", "og:image:height", String(IMAGE_HEIGHT)),
    meta("property", "og:image:type", "image/jpeg"),
    meta("property", "og:image:alt", tags.imageAlt),
    meta("property", "og:type", "website"),
    meta("property", "og:site_name", SITE_NAME),
    meta("property", "og:locale", "fr_FR"),
    meta("name", "twitter:card", "summary_large_image"),
    meta("name", "description", tags.description),
  ]
    .map(tag => `\n    ${tag}`)
    .join("")
}

// The charset declaration stays first: browsers look for it in the first 1024 bytes, which the tags could push it out of.
export function parseTemplate(html: string): PageTemplate {
  const at = html.indexOf(CHARSET)
  if (at === -1) throw new Error(`index.html: no ${CHARSET}`)
  const end = at + CHARSET.length
  return { plain: html, before: html.slice(0, end), after: html.slice(end).replace(STATIC_PREVIEW_TAG, "") }
}

export function pageHtml(template: PageTemplate, tags: PreviewTags): string {
  return template.before + previewTagsHtml(tags) + template.after
}
