import type { Framing } from "../forms/form.ts"
import type { VoteView } from "../votes/useVoteView.ts"
import { settleMs, type MotionPreference } from "./staging.ts"

export type Drawing = "loading" | "ready" | "error"

export type Aim<T> = { readonly wanted: T | null; readonly shown: T | null }

export type DrawingFacts<Color, Layout> = {
  readonly vote: VoteView["status"]
  readonly valuesFailed: boolean
  readonly color: Aim<Color>
  readonly arrangement: Aim<Layout>
  readonly framing: Framing["kind"]
  readonly motion: MotionPreference
  readonly sinceChangeMs: number
  readonly painted: boolean
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
      if (facts.framing === "cramped") return "error"
      return drawn(facts) && settled(facts) ? "ready" : "loading"
  }
}

function drawn<Color, Layout>({ color, arrangement, framing }: DrawingFacts<Color, Layout>): boolean {
  return reached(color) && reached(arrangement) && framing === "fitted"
}

function reached<T>({ wanted, shown }: Aim<T>): boolean {
  return wanted !== null && shown === wanted
}

function settled<Color, Layout>({ sinceChangeMs, motion, painted }: DrawingFacts<Color, Layout>): boolean {
  return sinceChangeMs >= settleMs(motion) && painted
}
