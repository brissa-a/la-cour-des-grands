import { chromeParams, parseChrome, type Chrome } from "../../web/src/embed/chrome.ts"
import { metaTexts } from "../../web/src/share/texts.ts"
import { canonicalView, drawable, FALLBACK_PATH, imagePath, type CanonicalQuery, type CanonicalView, type RenderId } from "./canonical.ts"
import type { PublicOrigin } from "./config.ts"
import type { Release, Releases } from "./releases.ts"
import { pageHtml, type PageTemplate } from "./tags.ts"

export type PageSite = { readonly template: PageTemplate; readonly origin: PublicOrigin; readonly render: RenderId }

export type PageAnswer =
  | { readonly kind: "page"; readonly html: string; readonly prerender: { readonly release: Release; readonly view: CanonicalView } | null }
  | { readonly kind: "redirect"; readonly location: string }

export function pagePath(query: string): string {
  return query === "" ? "/" : `/?${query}`
}

function withChrome(query: CanonicalQuery, chrome: Chrome): string {
  const params = new URLSearchParams(query)
  for (const [name, value] of chromeParams(chrome)) if (value !== null) params.append(name, value)
  return params.toString()
}

export function answerPage(rawQuery: string | null, releases: Releases, { template, origin, render }: PageSite): PageAnswer {
  if (releases.kind === "starting") return { kind: "page", html: template.plain, prerender: null }
  const params = new URLSearchParams(rawQuery ?? "")
  const release = releases.current
  const view = canonicalView(params, release.data)
  const target = withChrome(view.query, parseChrome(name => params.get(name)))
  if (rawQuery !== (target === "" ? null : target)) return { kind: "redirect", location: pagePath(target) }
  const shown = drawable(view.shared, release.data)
  const texts = metaTexts((shown ? view : canonicalView(new URLSearchParams(), release.data)).shared, release.data)
  return {
    kind: "page",
    html: pageHtml(template, {
      title: texts.title,
      description: texts.description,
      url: origin + pagePath(view.query),
      image: origin + (shown ? imagePath(release.version, render, view.image) : FALLBACK_PATH),
      imageAlt: texts.imageAlt,
    }),
    prerender: shown ? { release, view } : null,
  }
}
