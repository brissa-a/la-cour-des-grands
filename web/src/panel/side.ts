export type Side = "open" | "folded" | "yielded"

export function toggled(side: Side): Side {
  return side === "open" ? "folded" : "open"
}

export function besideSheet(side: Side, sheetOpen: boolean, crowded: boolean): Side {
  if (sheetOpen && crowded) return side === "open" ? "yielded" : side
  return side === "yielded" ? "open" : side
}
