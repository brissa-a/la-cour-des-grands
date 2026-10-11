import type { DeputyId } from "../data/deputyId.ts"
import type { FeatureKey } from "../data/features.ts"
import { numberFormat } from "../profile/format.ts"
import type { ReadVote } from "../votes/sources.ts"
import { binnedParts, categoryParts, voteParts } from "./parts.ts"
import { MISSING, NOT_GIVEN, SEAT, type Line, type Numbers, type Parts, type Reading, type Seats, type Source } from "./shapes.ts"
import type { FeatureValues, NumberValues } from "./values.ts"
import { numberView } from "./views.ts"

export type ReadInputs = {
  readonly drawn: readonly DeputyId[]
  readonly values: ReadonlyMap<FeatureKey, FeatureValues>
  readonly vote: ReadVote | null
  readonly seats: Seats
}

export function readingOf(source: Source, { drawn, values: loaded, vote, seats }: ReadInputs): Reading | null {
  switch (source.kind) {
    case "category": {
      const values = loaded.get(source.key)
      if (values?.kind !== "category") return null
      const nominal = categoryParts(values, drawn)
      return { source, data: { nominal }, lineOf: partLine(nominal) }
    }
    case "number": {
      const values = loaded.get(source.key)
      if (values?.kind !== "number") return null
      const numbers = numbersOf(values, drawn)
      return { source, data: { numbers, ordinal: binnedParts(numbers, numberView(source.key).binWidth) }, lineOf: numberLine(numbers) }
    }
    case "vote": {
      if (vote === null) return null
      const nominal = voteParts(vote, drawn)
      return { source, data: { nominal }, lineOf: partLine(nominal) }
    }
    case "seat":
      return readSeats(seats)
  }
}

export function readSeats(seats: Seats): Reading<"seat"> {
  return { source: SEAT, data: { seats }, lineOf: () => null }
}

export function numbersOf({ feature, valueOf }: NumberValues, drawn: readonly DeputyId[]): Numbers {
  return { feature, unit: numberView(feature.key).unit, drawn, valueOf: id => valueOf.get(id) ?? null }
}

function partLine({ title, parts, keyOf }: Parts): (id: DeputyId) => Line {
  return id => {
    const key = keyOf(id)
    if (key === MISSING) return { label: NOT_GIVEN, caption: title, missing: true }
    return { label: parts.find(part => part.key === key)?.label ?? key, caption: null, missing: false }
  }
}

function numberLine({ feature, unit, valueOf }: Numbers): (id: DeputyId) => Line {
  return id => {
    const value = valueOf(id)
    if (value === null) return { label: NOT_GIVEN, caption: feature.title, missing: true }
    return { label: unit ? `${numberFormat.format(value)} ${unit}` : numberFormat.format(value), caption: unit ? null : feature.title, missing: false }
  }
}
