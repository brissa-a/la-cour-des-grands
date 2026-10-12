import type { ColoredPart } from "../sources/shapes.ts"

export type Excerpt = { readonly shown: readonly ColoredPart[]; readonly hidden: number }

// A preview image holds a dozen swatches beside the room; past that it names the largest parts and counts the rest.
export const CAPTURE_SWATCHES = { whole: 12, kept: 8 } as const

export function captureExcerpt(parts: readonly ColoredPart[]): Excerpt {
  if (parts.length <= CAPTURE_SWATCHES.whole) return { shown: parts, hidden: 0 }
  const shown = parts.toSorted((a, b) => b.members.length - a.members.length).slice(0, CAPTURE_SWATCHES.kept)
  return { shown, hidden: parts.length - shown.length }
}
