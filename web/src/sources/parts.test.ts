import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId, type DeputyId } from "../data/deputyId.ts"
import type { CategoryFeature, NumberFeature } from "../data/features.ts"
import { isoDate } from "../data/isoDate.ts"
import { voteId } from "../votes/voteId.ts"
import { binnedParts, categoryParts, voteParts, voteTurnout } from "./parts.ts"
import { numbersOf } from "./read.ts"
import { MISSING } from "./shapes.ts"
import { NEUTRAL, PALETTE, POSITION_COLORS } from "./views.ts"

const AGE: NumberFeature = { kind: "number", key: "deputies/init.csv:age", file: "deputies/init.csv", column: "age", title: "Âge" }
const GROUP: CategoryFeature = { kind: "category", key: "f:group", file: "f", column: "group", title: "Groupe", values: "v" }

const ids = (count: number) => Array.from({ length: count }, (_, i) => deputyId(`PA${i}`))

function ages(values: Record<string, number>, drawn: readonly DeputyId[], unit = "ans") {
  const numbers = numbersOf({ kind: "number", feature: AGE, valueOf: new Map(Object.entries(values).map(([id, v]) => [deputyId(id), v])) }, drawn)
  return { ...numbers, unit }
}

test("ages are binned by 5 years from the first multiple of 5, empty bins kept, marked in years, with a part for missing values last", () => {
  const parts = binnedParts(ages({ PA0: 27, PA1: 29, PA2: 41 }, ids(4)), 5)
  assert.deepEqual(
    parts.parts.map(p => [p.label, p.members.length]),
    [["25–29 ans", 2], ["30–34 ans", 0], ["35–39 ans", 0], ["40–44 ans", 1], ["Non renseigné", 1]],
  )
  assert.equal(parts.keyOf(deputyId("PA1")), "25")
  assert.equal(parts.keyOf(deputyId("PA3")), MISSING)
})

test("a bin is captioned with the feature title only when no unit tells what its range counts, and so is the missing part", () => {
  const withUnit = binnedParts(ages({ PA0: 27 }, ids(2)), 5).parts
  const bare = binnedParts(ages({ PA0: 27 }, ids(2), ""), 5).parts
  assert.deepEqual(withUnit.map(p => p.caption), [null, "Âge"])
  assert.deepEqual(bare.map(p => p.caption), ["Âge", "Âge"])
})

test("without a set width, bins take a round width near a tenth of the range, start on a multiple of it and label decimal bounds", () => {
  const labels = (values: Record<string, number>, width?: number) => binnedParts(ages(values, ids(2), ""), width).parts.map(p => p.label)
  assert.deepEqual(labels({ PA0: 0.5, PA1: 1.7 }), ["0,4–0,6", "0,6–0,8", "0,8–1", "1–1,2", "1,2–1,4", "1,4–1,6", "1,6–1,8"])
  assert.deepEqual(labels({ PA0: 0, PA1: 0.1 }, 0.125), ["0–0,13"])
  const tenths = binnedParts(ages({ PA0: 0, PA1: 10 }, ids(3), ""), undefined).parts
  assert.deepEqual(tenths.map(p => p.members.length), [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1])
  assert.deepEqual(labels({ PA0: 3, PA1: 3 }), ["3–3"])
  assert.deepEqual(labels({ PA0: 27, PA1: 27.5 }, 5), ["25–30"])
  assert.deepEqual(labels({ PA0: 25, PA1: 28 }, 2.5), ["25–27,5", "27,5–30"])
})

test("category parts follow the table, skip values nobody drawn holds, keep unknown values apart and put missing values last", () => {
  const drawn = ids(5)
  const valueOf = new Map([
    [deputyId("PA0"), "b"],
    [deputyId("PA1"), "a"],
    [deputyId("PA2"), "b"],
    [deputyId("PA3"), "z"],
    [deputyId("PA9"), "c"],
  ])
  const table = [
    { value: "a", label: "Alpha", short: "A", color: "#111" },
    { value: "b", label: "Bravo", short: undefined, color: undefined },
    { value: "c", label: "Charlie", short: undefined, color: undefined },
  ]
  const parts = categoryParts({ kind: "category", feature: GROUP, valueOf, table }, drawn)
  assert.deepEqual(
    parts.parts.map(p => [p.key, p.label, p.title, p.color, p.members]),
    [
      ["a", "A", "Alpha", "#111", [deputyId("PA1")]],
      ["b", "Bravo", "Bravo", PALETTE[1], [deputyId("PA0"), deputyId("PA2")]],
      ["z", "z", "z", NEUTRAL, [deputyId("PA3")]],
      [MISSING, "Non renseigné", "Non renseigné", NEUTRAL, [deputyId("PA4")]],
    ],
  )
  assert.equal(parts.parts.at(-1)?.caption, "Groupe")
  assert.equal(parts.colorOf(deputyId("PA9")), PALETTE[2])
  const everyoneKnown = categoryParts({ kind: "category", feature: GROUP, valueOf, table }, [deputyId("PA0"), deputyId("PA1")])
  assert.deepEqual(everyoneKnown.parts.map(p => p.key), ["a", "b"])
})

test("vote parts follow the position table, keep only positions a drawn deputy took, and colour by position even outside the drawn deputies", () => {
  const [a, b, c, d, away] = ids(5)
  assert.ok(a && b && c && d && away)
  const id = voteId("VTANR5L17V1")
  const date = isoDate("2024-10-08")
  assert.ok(id && date)
  const vote = { id, number: 1, date, title: "t", kind: "ordinary" as const, result: "adopted" as const, major: true, bill: null, file: "f", url: "u" }
  const label = { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent" }
  const positions = new Map([[a, "against" as const], [b, "for" as const], [c, "against" as const], [away, "abstain" as const]])
  const tally = { for: 1, against: 2, abstain: 1, not_voting: 0, absent: 0 }
  const read = { vote, table: { order: ["for", "against", "abstain"] as const, label }, reading: { roster: new Map(), positions, tally } }
  const parts = voteParts(read, [a, b, c, d])
  assert.deepEqual(
    parts.parts.map(p => [p.key, p.label, p.color, p.members]),
    [
      ["for", "Pour", POSITION_COLORS.for, [b]],
      ["against", "Contre", POSITION_COLORS.against, [a, c]],
      [MISSING, "Non renseigné", NEUTRAL, [d]],
    ],
  )
  assert.equal(parts.title, "Scrutin n° 1")
  assert.deepEqual(voteParts(read, [a, b]).parts.map(p => p.key), ["for", "against"])
  assert.deepEqual([parts.colorOf(away), parts.keyOf(away), parts.colorOf(d)], [POSITION_COLORS.abstain, "abstain", NEUTRAL])
})

test("a vote's turnout sets apart the deputies absent from it, whatever the table order, and keeps every other part in order", () => {
  const [a, b, c, d] = ids(4)
  assert.ok(a && b && c && d)
  const id = voteId("VTANR5L17V1")
  const date = isoDate("2024-10-08")
  assert.ok(id && date)
  const vote = { id, number: 1, date, title: "t", kind: "censure_motion" as const, result: "rejected" as const, major: true, bill: null, file: "f", url: "u" }
  const label = { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent ou contre" }
  const positions = new Map([[a, "for" as const], [b, "absent" as const], [c, "against" as const]])
  const tally = { for: 1, against: 1, abstain: 0, not_voting: 0, absent: 1 }
  const read = { vote, table: { order: ["for", "absent", "against"] as const, label }, reading: { roster: new Map(), positions, tally } }
  const turnout = voteTurnout(voteParts(read, [a, b, c, d]))
  assert.deepEqual(turnout.present.map(p => [p.key, p.members]), [["for", [a]], ["against", [c]], [MISSING, [d]]])
  assert.deepEqual(turnout.absent && [turnout.absent.label, turnout.absent.members], ["Absent ou contre", [b]])
  assert.equal(voteTurnout(voteParts(read, [a, c])).absent, null)
})
