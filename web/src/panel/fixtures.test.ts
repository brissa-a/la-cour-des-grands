import assert from "node:assert/strict"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { CategoryFeature, NumberFeature, ValueRow } from "../data/features.ts"
import { isoDate } from "../data/isoDate.ts"
import type { LayoutChoice } from "../forms/registry.ts"
import { readingOf } from "../sources/read.ts"
import { seatsOf } from "../sources/seats.ts"
import { SEAT, VOTE, type Reading, type Source } from "../sources/shapes.ts"
import type { FeatureValues } from "../sources/values.ts"
import type { VotePosition } from "../votes/positions.ts"
import type { ReadVote } from "../votes/sources.ts"
import { voteId } from "../votes/voteId.ts"
import type { Vote } from "../votes/votes.ts"
import type { Plain, PlainView, ReadsVote } from "../view/view.ts"
import type { ColorChoice } from "../paint/registry.ts"

export const GROUP: CategoryFeature = { kind: "category", key: "deputies/init.csv:group", file: "deputies/init.csv", column: "group", title: "Groupe politique", values: "g" }
export const CIVILITY: CategoryFeature = { kind: "category", key: "deputies/init.csv:civility", file: "deputies/init.csv", column: "civility", title: "Civilité", values: "c" }
export const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "deputies/init.csv", column: "age", title: "Âge" }
export const FEATURES = [CIVILITY, AGE, GROUP]

const scrutin = voteId("VTANR5L17V8427")
assert.ok(scrutin)
export const SCRUTIN = scrutin

export const PA = Array.from({ length: 7 }, (_, i) => deputyId(`PA${i}`))
export const DRAWN = PA.slice(0, 6)

export const GROUP_COLOR: Plain<ColorChoice> = { paint: "palette", of: GROUP }
export const AGE_COLOR: Plain<ColorChoice> = { paint: "gradient", of: AGE }
export const CIVILITY_COLOR: Plain<ColorChoice> = { paint: "palette", of: CIVILITY }
export const GROUP_COLUMNS: Plain<LayoutChoice> = { form: "columns", picks: { main: GROUP } }
export const VOTE_COLUMNS: ReadsVote<LayoutChoice> = { form: "columns", picks: { main: VOTE } }
export const VOTE_RINGS: ReadsVote<LayoutChoice> = { form: "halfRings", picks: { main: VOTE } }
export const HEMICYCLE: Plain<LayoutChoice> = { form: "hemicycle", picks: { main: SEAT } }
export const DEFAULT_VIEW: PlainView = { scrutin: null, color: GROUP_COLOR, layout: HEMICYCLE }

export function table(...values: readonly string[]): ValueRow[] {
  return values.map(value => ({ value, label: value, short: undefined, color: undefined }))
}

export function categoryValues(feature: CategoryFeature, rows: readonly ValueRow[], held: readonly string[]): FeatureValues {
  return { kind: "category", feature, valueOf: new Map(held.flatMap((value, i): [DeputyId, string][] => (value ? [[PA[i] ?? assert.fail(), value]] : []))), table: rows }
}

export function numberValues(feature: NumberFeature, held: readonly (number | null)[]): FeatureValues {
  return { kind: "number", feature, valueOf: new Map(held.flatMap((value, i): [DeputyId, number][] => (value === null ? [] : [[PA[i] ?? assert.fail(), value]]))) }
}

export const SEATS = seatsOf(
  { deputies: DRAWN.map((id, i) => ({ id, seat: { number: String(i + 1), x: i, y: 0 } })), emptySeats: [{ number: "7", x: 6, y: 0 }, { number: "8", x: 7, y: 0 }] },
  { viewBox: "0 0 1 1", markup: "" },
)

export function readVoteOf(positions: readonly VotePosition[]): ReadVote {
  const id = voteId("VTANR5L17V8427")
  const date = isoDate("2026-07-20")
  assert.ok(id && date)
  const vote: Vote = { id, number: 8427, date, title: "t", kind: "ordinary", result: "adopted", major: true, bill: null, file: "f", url: "u" }
  const label = { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent" }
  const tally = { for: 0, against: 0, abstain: 0, not_voting: 0, absent: 0 }
  for (const position of positions) tally[position]++
  return {
    vote,
    table: { order: ["for", "against", "abstain", "not_voting", "absent"], label },
    reading: { roster: new Map(), positions: new Map(positions.map((position, i) => [PA[i] ?? assert.fail(), position])), tally },
  }
}

export function readerOf(values: readonly FeatureValues[], vote: ReadVote | null = null): (source: Source) => Reading | null {
  const loaded = new Map(values.map(v => [v.feature.key, v]))
  return source => readingOf(source, { drawn: DRAWN, values: loaded, vote, seats: SEATS })
}
