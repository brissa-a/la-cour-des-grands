import type { FeatureKey } from "../data/features.ts"
import type { VotePosition } from "../votes/positions.ts"
import type { ColoringKey } from "./coloring.ts"

export const DEFAULT_COLORING: FeatureKey = "deputies/init.csv:group"

export const HIDDEN_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "deputies/init.csv:in_office",
])

export const PREVIEW_HEADER_FEATURES: ReadonlySet<ColoringKey> = new Set<ColoringKey>([
  "deputies/init.csv:group",
  "deputies/init.csv:department",
  "deputies/init.csv:department_number",
])

export const NEUTRAL = "#5f6368"

export const PALETTE = [
  "#4e79a7", "#f28e2b", "#e15759", "#76b7b2", "#59a14f",
  "#edc948", "#b07aa1", "#ff9da7", "#9c755f", "#bab0ac",
]

// Pour and Contre differ in lightness, not just hue, so they stay apart under deuteranopia and protanopia.
export const POSITION_COLORS: Readonly<Record<VotePosition, string>> = {
  for: "#56d1a3",
  against: "#c03710",
  abstain: "#f9e03f",
  not_voting: "#8c8c8c",
  absent: "#383838",
}

export type NumberView = { gradient: readonly [string, string]; ticks: number; unit: string; binWidth?: number }

const GENERIC_NUMBER: NumberView = { gradient: ["#d6e6f5", "#08306b"], ticks: 3, unit: "" }

const NUMBER_VIEWS: Partial<Record<FeatureKey, NumberView>> = {
  "deputies/init.csv:age": { gradient: ["#fde0c5", "#7a2e0e"], ticks: 5, unit: "ans", binWidth: 5 },
}

export function numberView(key: FeatureKey): NumberView {
  return NUMBER_VIEWS[key] ?? GENERIC_NUMBER
}
