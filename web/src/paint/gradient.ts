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

export const gradient = definePaint({ label: "Dégradé", shapes: ["numbers"], paint: paintNumbers })
