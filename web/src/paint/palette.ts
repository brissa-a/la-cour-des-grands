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

export const palette = definePaint({ label: "Couleurs", shapes: ["nominal"], paint: paintParts })
