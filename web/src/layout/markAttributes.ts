import type { Lay, Mark, Tone } from "../forms/form.ts"
import type { Point } from "../sources/shapes.ts"

export type RoomMark = Extract<Mark, { kind: "room" }>

type RoomAttributes = {
  readonly room: string
  readonly fit: string
  readonly background: string
  readonly seat: (seat: Point) => { readonly cx: number; readonly cy: number; readonly r: number }
}

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

// The room draws at `scale` times its own units, like the dots, then shrinks back, so the fit's transition repaints in Chrome.
export function roomAttributes({ fit, radius }: RoomMark, scale: number): RoomAttributes {
  return {
    room: `scale(${1 / scale})`,
    fit: `translate(${fit.offset.x * scale}px, ${fit.offset.y * scale}px) scale(${fit.scale})`,
    background: `scale(${scale})`,
    seat: ({ x, y }) => ({ cx: x * scale, cy: y * scale, r: radius * scale }),
  }
}
