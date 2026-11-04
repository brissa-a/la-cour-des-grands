import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { parseCells, parsePositionTable } from "./positions.ts"
import { voteId } from "./voteId.ts"

const FILE = "deputies/votes/other.csv"
const TABLE = "deputies/values/vote_position.csv"
const V1 = voteId("VTANR5L17V1")
const V2 = voteId("VTANR5L17V2")
assert.ok(V1 && V2)

const rows = [
  { deputy_id: "PA1008", VTANR5L17V1: "for", VTANR5L17V2: "absent" },
  { deputy_id: "PA840737", VTANR5L17V1: "", VTANR5L17V2: "" },
  { deputy_id: "PA227089", VTANR5L17V1: "not_voting", VTANR5L17V2: "not_voting" },
]

const positionRows = [
  { value: "for", label_fr: "Pour" },
  { value: "against", label_fr: "Contre" },
  { value: "abstain", label_fr: "Abstention" },
  { value: "not_voting", label_fr: "Non-votant" },
  { value: "absent", label_fr: "Absent" },
]

test("a vote's column gives each deputy's position and leaves empty cells out", () => {
  assert.deepEqual(
    parseCells(rows, V2, FILE),
    new Map([
      [deputyId("PA1008"), "absent"],
      [deputyId("PA227089"), "not_voting"],
    ]),
  )
})

test("a position outside the values table, or a vote missing from its file, is rejected", () => {
  assert.throws(() => parseCells([{ deputy_id: "PA1008", VTANR5L17V1: "P" }], V1, FILE), /position "P"/)
  assert.throws(() => parseCells([{ deputy_id: "PA1008", VTANR5L17V2: "for" }], V1, FILE), /no column VTANR5L17V1/)
})

test("positions follow the values table's order and labels, which must name every position and no other", () => {
  const table = parsePositionTable([...positionRows.slice(4), ...positionRows.slice(0, 4)], TABLE, "ordinary")
  assert.deepEqual(table.order, ["absent", "for", "against", "abstain", "not_voting"])
  assert.equal(table.label.not_voting, "Non-votant")
  assert.throws(() => parsePositionTable(positionRows.slice(1), TABLE, "ordinary"), /no row for "for"/)
  assert.throws(() => parsePositionTable([...positionRows, { value: "present", label_fr: "Présent" }], TABLE, "ordinary"), /unknown value "present"/)
})

test("only a censure motion labels its absent deputies absent or against; every other label comes from the values table", () => {
  const dataLabels = { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent" }
  assert.deepEqual(parsePositionTable(positionRows, TABLE, "censure_motion").label, { ...dataLabels, absent: "Absent ou contre" })
  assert.deepEqual(parsePositionTable(positionRows, TABLE, "ordinary").label, dataLabels)
  assert.deepEqual(parsePositionTable(positionRows, TABLE, "solemn").label, dataLabels)
})
