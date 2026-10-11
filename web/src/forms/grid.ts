export const MAX_COLUMN_WIDTH = 30

const ROUND_STEPS = [5, 10, 20, 25, 30, 40, 50, 60, 80, 100, 150, 200]

export type Bounds = { readonly width: number; readonly height: number; readonly tickWidth: number; readonly overhangs: readonly number[] }

export type Geometry = { readonly across: number; readonly gap: number; readonly rows: number; readonly pitch: number }

export function bestGeometry(columns: number, largest: number, { width, height, tickWidth, overhangs }: Bounds): Geometry {
  let best: Geometry = { across: 1, gap: 1, rows: largest, pitch: 0 }
  for (let across = 1; across <= MAX_COLUMN_WIDTH; across++) {
    const gap = Math.max(1, Math.round(across / 4))
    const rows = Math.ceil(largest / across)
    const span = columns * across + (columns - 1) * gap + 2
    const fits = overhangs.map((overhang, i) => (width - overhang) / (span - centerOffset(i, across, gap)))
    const pitch = Math.min(height / rows, (width - tickWidth) / span, ...fits)
    if (pitch > best.pitch) best = { across, gap, rows, pitch }
  }
  return best
}

export function centerOffset(column: number, across: number, gap: number): number {
  return 1 + column * (across + gap) + across / 2
}

export function gridStep(rows: number, columnWidth: number): number {
  const target = (rows * columnWidth) / 4
  const deputies = ROUND_STEPS.find(step => step >= target && step % columnWidth === 0)
  return deputies ? deputies / columnWidth : Math.max(1, Math.round(rows / 4))
}
