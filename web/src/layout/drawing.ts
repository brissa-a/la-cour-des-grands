import type { VoteView } from "../votes/useVoteView.ts"
import { settleMs, type MotionPreference } from "./staging.ts"

export type Drawing = "loading" | "ready" | "error"

export type Aim<T> = { readonly wanted: T | null; readonly shown: T | null }

export type DrawingFacts<Color, Layout> = {
  readonly vote: VoteView["status"]
  readonly valuesFailed: boolean
  readonly color: Aim<Color>
  readonly arrangement: Aim<Layout>
  readonly measured: boolean
  readonly motion: MotionPreference
  readonly sinceChangeMs: number
  readonly fontsPainted: boolean
}

export function drawingOf<Color, Layout>(facts: DrawingFacts<Color, Layout>): Drawing {
  if (facts.valuesFailed) return "error"
  switch (facts.vote) {
    case "missing":
    case "failed":
      return "error"
    case "loading":
      return "loading"
    case "none":
    case "ready":
      return drawn(facts) && settled(facts) ? "ready" : "loading"
  }
}

function drawn<Color, Layout>({ color, arrangement, measured }: DrawingFacts<Color, Layout>): boolean {
  return reached(color) && reached(arrangement) && measured
}

function reached<T>({ wanted, shown }: Aim<T>): boolean {
  return wanted !== null && shown === wanted
}

function settled<Color, Layout>({ sinceChangeMs, motion, fontsPainted }: DrawingFacts<Color, Layout>): boolean {
  return sinceChangeMs >= settleMs(motion) && fontsPainted
}
