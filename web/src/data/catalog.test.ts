import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCatalog, rowCount } from "./catalog.ts"

const votes = (rows: unknown) => ({ files: [{ file: "votes/votes.csv", entity: "vote", rows, features: [] }] })

test("a file's row count is read when the catalog gives it and is unknown when it does not", () => {
  assert.equal(rowCount(parseCatalog(votes(8672)), "votes/votes.csv"), 8672)
  assert.equal(rowCount(parseCatalog(votes(0)), "votes/votes.csv"), 0)
  assert.equal(rowCount(parseCatalog(votes(undefined)), "votes/votes.csv"), null)
  assert.equal(rowCount(parseCatalog(votes(8672)), "deputies/init.csv"), null)
})

test("a row count that is not a whole number of rows is rejected", () => {
  for (const rows of [-1, 12.5, "8672", null, Number.MAX_SAFE_INTEGER + 2]) assert.throws(() => parseCatalog(votes(rows)), /votes\/votes\.csv has a row count/, String(rows))
})
