import { useMemo, useRef } from "react"
import type { DeputyId } from "../data/deputyId.ts"
import type { Frame } from "../forms/form.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { layOut, type Arrangement } from "../forms/registry.ts"
import { readSeats } from "../sources/read.ts"
import type { Seats } from "../sources/shapes.ts"
import { nextStaging, type Staging } from "./staging.ts"

export function useStaging(ready: Arrangement | null, frame: Frame | null, seats: Seats, drawn: readonly DeputyId[]): Staging {
  const last = useRef<Staging | null>(null)
  const arrangement = ready ?? last.current?.arrangement ?? null
  const placed = useMemo(
    () => arrangement && frame && { scene: layOut(arrangement, frame), reading: arrangement.reading, arrangement },
    [arrangement, frame],
  )
  const room = useMemo(() => ({ scene: placeHemicycle({ main: seats }), reading: readSeats(seats), arrangement: null }), [seats])
  const staging = nextStaging([placed, last.current], room, drawn)
  last.current = staging
  return staging
}
