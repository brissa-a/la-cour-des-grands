import type { Data, KindsFor, Source, SourceOf } from "../sources/shapes.ts"
import { gradient } from "./gradient.ts"
import type { Paint, PaintSpec } from "./paint.ts"
import { palette } from "./palette.ts"

export const PAINTS = { palette, gradient }

export type PaintName = keyof typeof PAINTS

type ShapesOf<P extends PaintName> = (typeof PAINTS)[P]["shapes"][number]

const REGISTRY: { readonly [P in PaintName]: PaintSpec<ShapesOf<P>> } = PAINTS

export type ColorChoice = {
  [P in PaintName]: { [K in KindsFor<ShapesOf<P>>]: { readonly paint: P; readonly of: SourceOf<K> } }[KindsFor<ShapesOf<P>>]
}[PaintName]

export const COLORINGS: { readonly [P in PaintName]: (source: Source) => Extract<ColorChoice, { readonly paint: P }> | null } = {
  palette: source => {
    switch (source.kind) {
      case "category":
        return { paint: "palette", of: source }
      case "vote":
        return { paint: "palette", of: source }
      case "number":
      case "seat":
        return null
    }
  },
  gradient: source => (source.kind === "number" ? { paint: "gradient", of: source } : null),
}

export function coloringsOf(source: Source): ColorChoice[] {
  return Object.values(COLORINGS).flatMap(choose => choose(source) ?? [])
}

export function paintWith<P extends PaintName>(paint: P, data: Partial<Pick<Data, ShapesOf<P>>>): Paint | null {
  const spec = REGISTRY[paint]
  for (const shape of spec.shapes) {
    const input = data[shape]
    if (input !== undefined) return spec.paint(input)
  }
  return null
}
