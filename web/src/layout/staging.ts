import type { DeputyId } from "../data/deputyId.ts"
import type { Scene } from "../forms/form.ts"
import type { Reading } from "../sources/shapes.ts"

export type Staging = { readonly scene: Scene; readonly reading: Reading; readonly arrangement: object }

const STAGGER_GROUP = 40
const STAGGER_S = 0.012

export function nextStaging(placed: Staging | null, last: Staging | null, room: Staging, drawn: readonly DeputyId[]): Staging {
  if (placed) return placed
  return last && drawn.every(id => last.scene.dots.has(id)) ? last : room
}

export function staggerDelay(index: number, sinceArrangedMs: number): number {
  return Math.max(0, (index % STAGGER_GROUP) * STAGGER_S - sinceArrangedMs / 1000)
}
