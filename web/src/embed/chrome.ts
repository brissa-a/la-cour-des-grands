import type { DeputyId } from "../data/deputyId.ts"
import type { LayoutChoice } from "../forms/registry.ts"
import type { Source } from "../sources/shapes.ts"
import type { Param } from "../url.ts"
import { readsVote } from "../view/view.ts"

export type Chrome = { readonly kind: "full" } | { readonly kind: "clean"; readonly title: boolean }

export function parseChrome(read: (name: string) => string | null): Chrome {
  if (read("clean") !== "true") return { kind: "full" }
  return { kind: "clean", title: read("title") === "true" }
}

export function fullSiteUrl(page: string, view: readonly Param[], deputy: DeputyId | null): string {
  return pageUrl(page, [...view, ["deputy", deputy]])
}

export function embedUrl(page: string, view: readonly Param[]): string {
  return pageUrl(page, [...view, ["clean", "true"]])
}

function pageUrl(page: string, params: readonly Param[]): string {
  const url = new URL(page)
  url.search = ""
  url.hash = ""
  for (const [name, value] of params) if (value !== null) url.searchParams.set(name, value)
  return url.href
}

export function legendShown(chrome: Chrome, colorSource: Source, layout: LayoutChoice): boolean {
  if (colorSource.kind !== "vote") return true
  return chrome.kind === "clean" && !readsVote(layout)
}
