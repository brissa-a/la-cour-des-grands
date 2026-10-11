import type { Lay, Tone } from "../forms/form.ts"
import type { Point } from "../sources/shapes.ts"

type TextAttributes = {
  readonly textAnchor: "start" | "middle" | "end"
  readonly dominantBaseline?: "middle"
  readonly transform?: string
}

type NameAttributes = { readonly x?: number; readonly dx?: number; readonly dy?: number; readonly style?: { readonly fontSize: number } }

export const RULE_CLASS: Readonly<Record<Tone, string | undefined>> = { grid: undefined, base: "chart-baseline", leader: "chart-leader" }

export function labelAttributes(at: Point, lay: Lay): TextAttributes {
  switch (lay.kind) {
    case "flat":
      return { textAnchor: "middle" }
    case "slanted":
      return { textAnchor: "end", transform: `rotate(${-lay.degrees} ${at.x} ${at.y})` }
    case "inline":
      return { textAnchor: lay.anchor, dominantBaseline: "middle" }
  }
}

export function nameAttributes(at: Point, lay: Lay): NameAttributes | null {
  switch (lay.kind) {
    case "flat":
      return { x: at.x, dy: lay.lineHeight }
    case "slanted":
      return null
    case "inline":
      return { dx: lay.gap, style: { fontSize: lay.textSize } }
  }
}
