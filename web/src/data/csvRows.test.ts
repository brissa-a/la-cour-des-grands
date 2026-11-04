import assert from "node:assert/strict"
import { test } from "node:test"
import { parseCsv } from "./csvRows.ts"

test("an optional column the header lacks reads as an empty cell on every row, while one it holds keeps its cells and an undeclared one adds none", () => {
  assert.deepEqual(parseCsv("t.csv", "id,note\na,x\nb,\n", ["id"], ["note", "extra"]), [
    { id: "a", note: "x", extra: "" },
    { id: "b", note: "", extra: "" },
  ])
  assert.deepEqual(parseCsv("t.csv", "id,note\na,x\n", ["id"]), [{ id: "a", note: "x" }])
})

test("a header without some required columns is refused naming the file and each missing column, optional ones aside", () => {
  assert.throws(() => parseCsv("t.csv", "id,note\na,x\n", ["id", "seat", "deputy"], ["extra"]), { message: "t.csv: missing columns seat, deputy" })
})

test("a row with fewer cells than the header is refused naming the file, so no row read lacks a column", () => {
  assert.throws(() => parseCsv("t.csv", "id,note,more\na,x,1\nb,y\n", ["id"], ["more"]), { message: "t.csv: Too few fields: expected 3 fields but parsed 2" })
})
