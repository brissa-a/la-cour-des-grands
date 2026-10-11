import { dots } from "../glyph/glyph.ts"
import type { Categories } from "../sources/shapes.ts"
import { definePaint, LAST, type Paint } from "./paint.ts"

export function paintParts(parts: Categories): Paint {
  const rankOf = new Map(parts.parts.map((part, i) => [part.key, i]))
  return {
    colorOf: parts.colorOf,
    rank: id => rankOf.get(parts.keyOf(id)) ?? LAST,
    legend: { kind: "swatches", title: parts.title, swatches: parts.parts, keyOf: parts.keyOf },
  }
}

export const palette = definePaint({
  label: "Couleurs",
  glyph: [
    {
      kind: "stroke",
      d: "M12 3.6c-4.8 0-8.4 3.5-8.4 8.1 0 4.5 3.6 8.7 8 8.7 1.1 0 1.7-.6 1.7-1.5 0-.9-.8-1.3-.8-2.2 0-1 .8-1.6 1.8-1.6h2.3c2.9 0 4.8-1.9 4.8-4.4 0-4-4.3-7.1-9.4-7.1z",
      width: 1.7,
      opacity: 1,
    },
    ...dots(1.5, [[7.9, 11.4], [10.3, 7.5], [14.7, 7.6], [8.7, 15.5]]),
  ],
  shapes: ["nominal"],
  paint: paintParts,
})
