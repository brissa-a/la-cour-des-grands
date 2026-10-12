import type { DeputyId } from "../data/deputyId.ts"
import type { LayoutChoice } from "../forms/registry.ts"
import type { Clearance } from "../layout/freeArea.ts"
import { sourceKey, type Source } from "../sources/shapes.ts"
import type { Param } from "../param.ts"
import { readsVote } from "../view/view.ts"

export type Chrome = { readonly kind: "full" } | { readonly kind: "clean"; readonly title: boolean } | { readonly kind: "capture" }

export type StageInput = "panZoom" | "tap" | "none"

const SITE_CLEARANCE: Clearance = { x: 12, y: 12 }

// The preview image keeps the side margins, which some networks round off at the corners, and lends the rest to the chart's height.
const CAPTURE_CLEARANCE: Clearance = { x: 12, y: 4 }

export function parseChrome(read: (name: string) => string | null): Chrome {
  const clean = read("clean")
  if (clean === "true") return { kind: "clean", title: read("title") === "true" }
  if (clean === "capture") return { kind: "capture" }
  return { kind: "full" }
}

export function chromeParams(chrome: Chrome): readonly Param[] {
  switch (chrome.kind) {
    case "full":
      return []
    case "clean":
      return [
        ["clean", "true"],
        ["title", chrome.title ? "true" : null],
      ]
    case "capture":
      return [["clean", "capture"]]
  }
}

export function fullSiteUrl(page: string, view: readonly Param[], deputy: DeputyId | null): string {
  return pageUrl(page, [...view, ["deputy", deputy]])
}

export function embedUrl(page: string, view: readonly Param[]): string {
  return pageUrl(page, [...view, ...chromeParams({ kind: "clean", title: false })])
}

function pageUrl(page: string, params: readonly Param[]): string {
  const url = new URL(page)
  url.search = ""
  url.hash = ""
  for (const [name, value] of params) if (value !== null) url.searchParams.set(name, value)
  return url.href
}

export function legendShown(chrome: Chrome, colorSource: Source, layout: LayoutChoice): boolean {
  switch (chrome.kind) {
    case "full":
      return colorSource.kind !== "vote"
    case "clean":
      return colorSource.kind !== "vote" || !readsVote(layout)
    case "capture":
      return sourceKey(colorSource) !== sourceKey(layout.picks.main)
  }
}

export function stageInput(chrome: Chrome): StageInput {
  switch (chrome.kind) {
    case "full":
      return "panZoom"
    case "clean":
      return "tap"
    case "capture":
      return "none"
  }
}

export function stageClearance(chrome: Chrome): Clearance {
  switch (chrome.kind) {
    case "full":
    case "clean":
      return SITE_CLEARANCE
    case "capture":
      return CAPTURE_CLEARANCE
  }
}
