import { useMemo, useRef } from "react"
import type { DeputyId } from "../data/deputyId.ts"
import type { Frame } from "../forms/form.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { layOut } from "../forms/registry.ts"
import { readSeats } from "../sources/read.ts"
import type { Data, Seats } from "../sources/shapes.ts"
import { nextStaging, type Arrangement, type Staging } from "./staging.ts"

export function useStaging(ready: Arrangement | null, frame: Frame | null, seats: Seats, drawn: readonly DeputyId[]): Staging {
  const last = useRef<Staging | null>(null)
  const arrangement = ready ?? last.current?.arrangement ?? null
  const placed = useMemo(() => {
    if (!arrangement || !frame) return null
    const data: Partial<Data> = arrangement.reading.data
    const scene = layOut(arrangement.form, data, { frame, order: arrangement.order })
    return scene && { scene, reading: arrangement.reading, arrangement }
  }, [arrangement, frame])
  const room = useMemo(() => ({ scene: placeHemicycle(seats), reading: readSeats(seats), arrangement: null }), [seats])
  const staging = nextStaging([placed, last.current], room, drawn)
  last.current = staging
  return staging
}
