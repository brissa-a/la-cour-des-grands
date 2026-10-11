import type { DeputyId } from "../data/deputyId.ts"
import { DOT_RADIUS, NO_HOLLOW, type Frame, type Scene } from "../forms/form.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import type { Arrangement } from "../forms/registry.ts"
import type { Reading } from "../sources/shapes.ts"

export type Staging = { readonly scene: Scene; readonly reading: Reading; readonly arrangement: Arrangement | null }

export type Motion = { readonly delay: number; readonly duration: number; readonly easing: string }

const STAGGER_GROUP = 40
const STAGGER_S = 0.012
const FLIGHT_S = 0.9
const PAINTED_S = 1 / 60
const STANDARD = "cubic-bezier(0.4, 0, 0.2, 1)"
const DECELERATE = "cubic-bezier(0, 0, 0.2, 1)"

const UNMEASURED: Scene = { card: "beside", radius: DOT_RADIUS, snap: 0, dots: new Map(), hollow: NO_HOLLOW, marks: [], lines: [], where: () => null }

// Before the stage is measured the room places nobody, or its dots would fly in from an unfitted room to the fitted one.
export function roomStaging(reading: Reading<"seat">, frame: Frame | null): Staging {
  return { scene: frame ? placeHemicycle({ main: reading.data.seats }, { frame }) : UNMEASURED, reading, arrangement: null }
}

export function nextStaging(candidates: readonly (Staging | null)[], room: Staging, drawn: readonly DeputyId[]): Staging {
  return candidates.find(staging => staging !== null && drawn.every(id => staging.scene.dots.has(id))) ?? room
}

export function motionOf(index: number, sinceArrangedMs: number): Motion {
  const start = (index % STAGGER_GROUP) * STAGGER_S
  const flown = sinceArrangedMs / 1000 - start
  if (flown < PAINTED_S) return { delay: Math.max(0, -flown), duration: FLIGHT_S, easing: STANDARD }
  if (flown < FLIGHT_S) return { delay: 0, duration: FLIGHT_S - flown, easing: DECELERATE }
  return { delay: 0, duration: FLIGHT_S, easing: STANDARD }
}

export function transitionOf({ delay, duration, easing }: Motion) {
  return { transitionDelay: `${delay}s`, transitionDuration: `${duration}s`, transitionTimingFunction: easing }
}
