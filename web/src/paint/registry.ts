import type { Data, KindsFor, Reading, Source, SourceKind, SourceOf } from "../sources/shapes.ts"
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

export type Colored = { readonly reading: Reading; readonly paint: Paint }

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

type PaintsFor<K extends SourceKind> = { [P in PaintName]: K extends KindsFor<ShapesOf<P>> ? P : never }[PaintName]

export const DEFAULT_PAINT: { readonly [K in ColorChoice["of"]["kind"]]: PaintsFor<K> } = { category: "palette", number: "gradient", vote: "palette" }

export function coloringsOf(source: Source): ColorChoice[] {
  return Object.values(COLORINGS).flatMap(choose => choose(source) ?? [])
}

export function isDefaultColoring(choice: ColorChoice): boolean {
  return DEFAULT_PAINT[choice.of.kind] === choice.paint
}

export function colorWith(choice: ColorChoice, read: (source: Source) => Reading | null): Colored | null {
  const reading = read(choice.of)
  if (!reading) return null
  const data: Partial<Data> = reading.data
  const paint = paintAs(choice.paint, data)
  return paint && { reading, paint }
}

function paintAs<P extends PaintName>(paint: P, data: Partial<Pick<Data, ShapesOf<P>>>): Paint | null {
  const spec = REGISTRY[paint]
  for (const shape of spec.shapes) {
    const input = data[shape]
    if (input !== undefined) return spec.paint(input)
  }
  return null
}
