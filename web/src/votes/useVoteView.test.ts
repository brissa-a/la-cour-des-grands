import assert from "node:assert/strict"
import { test } from "node:test"
import { isoDate } from "../data/isoDate.ts"
import type { ReadVote } from "./sources.ts"
import { shownVote, type ReadyVote } from "./useVoteView.ts"
import { voteId } from "./voteId.ts"

const id = voteId("VTANR5L17V1")
const date = isoDate("2024-10-08")
assert.ok(id && date)
const read: ReadVote = {
  vote: { id, number: 1, date, title: "t", kind: "ordinary", result: "adopted", major: true, bill: null, file: "f", url: "u" },
  table: { order: ["for"], label: { for: "Pour", against: "Contre", abstain: "Abstention", not_voting: "Non-votant", absent: "Absent" } },
  reading: { roster: new Map(), positions: new Map(), tally: { for: 0, against: 0, abstain: 0, not_voting: 0, absent: 0 } },
}
const ready: ReadyVote = { status: "ready", read, labels: { kind: { ordinary: "", solemn: "", censure_motion: "" }, result: { adopted: "", rejected: "" } } }

test("while a picked vote loads, the previous vote stays shown but is not settled, so nothing is arranged or coloured from it", () => {
  assert.deepEqual(shownVote({ status: "loading", previous: ready }), { read, settled: false })
  assert.deepEqual(shownVote({ status: "loading", previous: null }), { read: null, settled: false })
})

test("a loaded vote is shown and settled, and a view with no vote, a missing or a failed one shows none but is settled", () => {
  assert.deepEqual(shownVote(ready), { read, settled: true })
  for (const status of ["none", "missing", "failed"] as const) assert.deepEqual(shownVote({ status }), { read: null, settled: true })
})
