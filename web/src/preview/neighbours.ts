export type Direction = "left" | "right"

export function step<Id>(lines: readonly (readonly Id[])[], id: Id, direction: Direction): Id | null {
  for (const line of lines) {
    const at = line.indexOf(id)
    if (at !== -1) return line[direction === "left" ? at - 1 : at + 1] ?? null
  }
  return null
}
