import type { DeputyId } from "../data/deputyId.ts"
import { DOT_RADIUS, NO_HOLLOW, type Frame, type Scene } from "../forms/form.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { placesOf, samePlaces, type Arrangement, type Places } from "../forms/registry.ts"
import type { Reading } from "../sources/shapes.ts"

export type Staging = { readonly scene: Scene; readonly reading: Reading; readonly arrangement: Arrangement | null; readonly places: Places }

export type Motion = { readonly delay: number; readonly duration: number; readonly easing: string }

export type MotionPreference = "full" | "reduced"

export type Wave = { readonly places: Places; readonly at: number; readonly still: ReadonlySet<DeputyId> }

const STAGGER_GROUP = 40
const STAGGER_S = 0.012
const FLIGHT_S = 0.9
const PAINTED_S = 1 / 60
const STANDARD = "cubic-bezier(0.4, 0, 0.2, 1)"
const DECELERATE = "cubic-bezier(0, 0, 0.2, 1)"
const INSTANT: Motion = { delay: 0, duration: 0, easing: STANDARD }

const UNMEASURED: Scene = { card: "beside", radius: DOT_RADIUS, snap: 0, dots: new Map(), hollow: NO_HOLLOW, marks: [], hub: null, lines: [], where: () => null }

// Before the stage is measured the room places nobody, or its dots would fly in from an unfitted room to the fitted one.
export function roomStaging(reading: Reading<"seat">, frame: Frame | null): Staging {
  const inputs = { main: reading.data.seats }
  return { scene: frame ? placeHemicycle(inputs, { frame }) : UNMEASURED, reading, arrangement: null, places: placesOf("hemicycle", inputs, null) }
}

export function nextStaging(candidates: readonly (Staging | null)[], room: Staging, drawn: readonly DeputyId[]): Staging {
  return candidates.find(staging => staging !== null && drawn.every(id => staging.scene.dots.has(id))) ?? room
}

// A refit alone keeps the wave, and in a new wave the dots that do not fly to another seat move with the room, so no dot
// leaves the room when it refits.
export function waveFor(last: Wave, places: Places, scenes: { readonly before: Scene; readonly after: Scene }, now: number): Wave {
  return samePlaces(last.places, places) ? last : { places, at: now, still: unflown(scenes.before, scenes.after) }
}

export function dotMotion(wave: Wave, id: DeputyId, index: number, now: number, preference: MotionPreference): Motion {
  return motionOf(wave.still.has(id) ? 0 : index, now - wave.at, preference)
}

function unflown(before: Scene, after: Scene): ReadonlySet<DeputyId> {
  const seatOf = (scene: Scene, id: DeputyId) => {
    const where = scene.where(id)
    return where?.kind === "seat" ? where.number : null
  }
  return new Set([...after.dots.keys()].filter(id => seatOf(after, id) !== null && (!before.dots.has(id) || seatOf(before, id) === seatOf(after, id))))
}

export function motionOf(index: number, sinceArrangedMs: number, preference: MotionPreference): Motion {
  if (preference === "reduced") return INSTANT
  const start = (index % STAGGER_GROUP) * STAGGER_S
  const flown = sinceArrangedMs / 1000 - start
  if (flown < PAINTED_S) return { delay: Math.max(0, -flown), duration: FLIGHT_S, easing: STANDARD }
  if (flown < FLIGHT_S) return { delay: 0, duration: FLIGHT_S - flown, easing: DECELERATE }
  return { delay: 0, duration: FLIGHT_S, easing: STANDARD }
}

// The drawing's stylesheet transitions (fill, room fade) are shorter than one flight, so they end within the wave.
export function settleMs(preference: MotionPreference): number {
  return preference === "reduced" ? 0 : ((STAGGER_GROUP - 1) * STAGGER_S + FLIGHT_S) * 1000
}

export function transitionOf({ delay, duration, easing }: Motion) {
  return { transitionDelay: `${delay}s`, transitionDuration: `${duration}s`, transitionTimingFunction: easing }
}
