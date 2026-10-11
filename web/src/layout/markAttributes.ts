import type { Lay, Tone } from "../forms/form.ts"
import type { Point } from "../sources/shapes.ts"

type TextAttributes = {
  readonly textAnchor: "start" | "middle" | "end"
  readonly dominantBaseline?: "middle"
  readonly transform?: string
}

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
