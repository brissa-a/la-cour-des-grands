import type { DeputyId } from "../data/deputyId.ts"
import type { Where } from "../forms/form.ts"
import type { Colored } from "../paint/registry.ts"
import { sourceKey, type Line, type Reading, type Source } from "../sources/shapes.ts"
import { PREVIEW_HEADER_FEATURES } from "../sources/views.ts"

export type ColorLine = Line & { readonly color: string }

export function sameSource(a: Source, b: Source): boolean {
  return sourceKey(a) === sourceKey(b)
}

export function colorLine({ reading, paint }: Colored, id: DeputyId): ColorLine | null {
  if (inHeader(reading.source)) return null
  const line = reading.lineOf(id)
  return line && { ...line, color: paint.colorOf(id) }
}

export function layoutLine(layout: Reading, colored: Colored, id: DeputyId): Line | null {
  if (sameSource(layout.source, colored.reading.source) || inHeader(layout.source)) return null
  return layout.lineOf(id)
}

export function layoutPlace(layout: Reading, colored: Colored, where: Where | null): Extract<Where, { kind: "part" }> | null {
  return where?.kind === "part" && !sameSource(layout.source, colored.reading.source) ? where : null
}

function inHeader(source: Source): boolean {
  return PREVIEW_HEADER_FEATURES.has(sourceKey(source))
}
