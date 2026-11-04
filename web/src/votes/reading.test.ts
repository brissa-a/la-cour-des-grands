import assert from "node:assert/strict"
import { test } from "node:test"
import { constituencyCode } from "../address/codes.ts"
import { deputyId } from "../data/deputyId.ts"
import { isoDate } from "../data/isoDate.ts"
import { parseCells } from "./positions.ts"
import { readVote } from "./reading.ts"
import { parseHolders, rosterOn } from "./roster.ts"
import { voteId } from "./voteId.ts"

const V1 = voteId("VTANR5L17V1")
const V1_DATE = isoDate("2024-10-08")
assert.ok(V1 && V1_DATE)

const holders = parseHolders([
  { id: deputyId("PA1008"), constituency: "33-4", mandate_periods: "2024-07-07/" },
  { id: deputyId("PA840737"), constituency: "08-1", mandate_periods: "2024-07-07/2024-10-04" },
  { id: deputyId("PA227089"), constituency: "59-21", mandate_periods: "2024-07-07/|2024-07-07/2024-10-21" },
  { id: deputyId("PA794554"), constituency: "59-21", mandate_periods: "2024-07-07/2025-11-05" },
  { id: deputyId("PA1327"), constituency: "36-2", mandate_periods: "2024-07-07/2025-11-12" },
])

const cells = parseCells(
  [
    { deputy_id: "PA1008", VTANR5L17V1: "for" },
    { deputy_id: "PA840737", VTANR5L17V1: "" },
    { deputy_id: "PA227089", VTANR5L17V1: "not_voting" },
    { deputy_id: "PA794554", VTANR5L17V1: "absent" },
    { deputy_id: "PA1327", VTANR5L17V1: "absent" },
  ],
  V1,
  "deputies/votes/other.csv",
)

test("absent counts the roster members without a cast position, not the absent cells of deputies outside the roster", () => {
  const reading = readVote(rosterOn(holders, V1_DATE), cells)
  assert.deepEqual(reading.tally, { for: 1, against: 0, abstain: 0, not_voting: 1, absent: 1 })
  assert.equal(reading.positions.get(deputyId("PA794554")), undefined)
})

test("a roster member without a cell counts as absent", () => {
  const code = constituencyCode("08-1")
  assert.ok(code)
  const reading = readVote(new Map([[code, deputyId("PA840737")]]), cells)
  assert.equal(reading.positions.get(deputyId("PA840737")), "absent")
  assert.equal(reading.tally.absent, 1)
})
