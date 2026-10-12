import assert from "node:assert/strict"
import { test } from "node:test"
import { deputyId } from "../data/deputyId.ts"
import { voteId } from "../votes/voteId.ts"
import { loadShareData } from "./data.ts"
import { FILES, readerOf } from "./fixture.test.ts"

test("the link service's data loads under plain Node from the reader it is given: colourable features, every deputy's name, the votes and their labels, the data date", async () => {
  const data = await loadShareData(readerOf(FILES))
  assert.deepEqual(
    data.features.map(feature => [feature.key, feature.kind]),
    [
      ["deputies/init.csv:group", "category"],
      ["deputies/init.csv:age", "number"],
    ],
  )
  assert.deepEqual([...data.people], [
    [deputyId("PA720892"), { first_name: "Mathilde", last_name: "Panot" }],
    [deputyId("PA720614"), { first_name: "Marine", last_name: "Le Pen" }],
  ])
  const censure = voteId("VTANR5L17V1")
  assert.ok(censure)
  assert.deepEqual([data.votes.votes.length, data.votes.byId.get(censure)?.date, data.votes.labels.result.rejected], [2, "2024-10-08", "Rejeté"])
  assert.equal(data.generated, "2026-10-10")
})

test("a data file the reader cannot give fails the load with that file's path", async () => {
  for (const missing of ["catalog.json", "deputies/init.csv", "votes/votes.csv", "votes/values/result.csv"]) {
    const files = Object.fromEntries(Object.entries(FILES).filter(([path]) => path !== missing))
    await assert.rejects(loadShareData(readerOf(files)), new RegExp(`^Error: ${missing}`), missing)
  }
})
