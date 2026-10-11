export const GLYPH_BOX = 24

export type GlyphPart =
  | { readonly kind: "dot"; readonly x: number; readonly y: number; readonly r: number }
  | { readonly kind: "block"; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly round: number; readonly opacity: number }
  | { readonly kind: "stroke"; readonly d: string; readonly width: number; readonly opacity: number }

export type Glyph = readonly [GlyphPart, ...GlyphPart[]]

type Pair = readonly [number, number]

export function each(pairs: readonly [Pair, ...Pair[]], part: (pair: Pair) => GlyphPart): Glyph {
  const [first, ...rest] = pairs
  return [part(first), ...rest.map(part)]
}

export function dots(r: number, centres: readonly [Pair, ...Pair[]]): Glyph {
  return each(centres, ([x, y]) => ({ kind: "dot", x, y, r }))
}
