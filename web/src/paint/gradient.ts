import { each } from "../glyph/glyph.ts"
import type { Numbers } from "../sources/shapes.ts"
import { NEUTRAL, numberView } from "../sources/views.ts"
import { definePaint, LAST, type Paint } from "./paint.ts"

export function paintNumbers({ feature, unit, drawn, valueOf }: Numbers): Paint {
  const view = numberView(feature.key)
  const numbers = drawn.flatMap(id => {
    const value = valueOf(id)
    return value === null ? [] : [value]
  })
  const min = Math.min(...numbers)
  const max = Math.max(...numbers)
  const span = max - min || 1
  const ratio = (n: number) => (n - min) / span
  const [from, to] = view.gradient
  return {
    colorOf: id => {
      const value = valueOf(id)
      return value === null ? NEUTRAL : `color-mix(in oklab, ${to} ${(ratio(value) * 100).toFixed(1)}%, ${from})`
    },
    rank: id => valueOf(id) ?? LAST,
    legend: {
      kind: "ramp",
      title: feature.title,
      unit,
      gradient: view.gradient,
      min,
      max,
      mean: numbers.reduce((sum, n) => sum + n, 0) / numbers.length,
      ticks: Array.from({ length: view.ticks }, (_, i) => {
        const value = Math.round(min + (span * i) / (view.ticks - 1))
        return { value, ratio: ratio(value) }
      }),
      missing: drawn.length - numbers.length,
      valueOf,
    },
  }
}

const STEPS = each(
  [[3, 0.1], [5.25, 0.23], [7.5, 0.36], [9.75, 0.48], [12, 0.61], [14.25, 0.74], [16.5, 0.87], [18.75, 1]],
  ([x, opacity]) => ({ kind: "block", x, y: 7.5, width: 2.3, height: 9, round: 0, opacity }),
)

export const gradient = definePaint({
  label: "Dégradé",
  glyph: [...STEPS, { kind: "stroke", d: "M4.2 7.5H19.8A1.2 1.2 0 0 1 21 8.7V15.3A1.2 1.2 0 0 1 19.8 16.5H4.2A1.2 1.2 0 0 1 3 15.3V8.7A1.2 1.2 0 0 1 4.2 7.5Z", width: 1, opacity: 0.6 }],
  shapes: ["numbers"],
  paint: paintNumbers,
})
