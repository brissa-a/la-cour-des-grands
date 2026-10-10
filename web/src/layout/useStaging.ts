import { useMemo, useRef } from "react"
import type { DeputyId } from "../data/deputyId.ts"
import type { Frame, Order } from "../forms/form.ts"
import { placeHemicycle } from "../forms/hemicycle.ts"
import { layOut, type FormName } from "../forms/registry.ts"
import { readSeats } from "../sources/read.ts"
import type { Data, Reading, Seats } from "../sources/shapes.ts"
import { nextStaging, type Staging } from "./staging.ts"

export function useStaging(form: FormName, reading: Reading | null, order: Order | null, frame: Frame | null, seats: Seats, drawn: readonly DeputyId[]): Staging {
  const arrangement = useMemo(() => reading && order && { form, reading, order }, [form, reading, order])
  const placed = useMemo(() => {
    if (!arrangement || !frame) return null
    const data: Partial<Data> = arrangement.reading.data
    const scene = layOut(arrangement.form, data, { frame, order: arrangement.order })
    return scene && { scene, reading: arrangement.reading, arrangement }
  }, [arrangement, frame])
  const room = useMemo(() => {
    const seated = readSeats(seats)
    return { scene: placeHemicycle(seats), reading: seated, arrangement: seated }
  }, [seats])
  const last = useRef<Staging | null>(null)
  const staging = nextStaging(placed, last.current, room, drawn)
  last.current = staging
  return staging
}
