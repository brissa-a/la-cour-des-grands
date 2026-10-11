import assert from "node:assert/strict"
import { test } from "node:test"
import { columnsValuesTablePath, parseCatalog, rowCount, valuesTablePath } from "./catalog.ts"

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

test("each file reads its features by kind, or the one kind all its columns share", () => {
  const catalog = parseCatalog({
    files: [
      {
        file: "deputies/init.csv",
        entity: "deputy",
        features: [
          { column: "group", title: "Groupe politique", type: "category", values: "deputies/values/group.csv" },
          { column: "deputy", title: "Député", type: "reference", entity: "deputy" },
          { column: "age", title: "Âge", type: "number" },
          { column: "photo", title: "Photo", type: "image" },
        ],
      },
      { file: "votes/positions.csv", entity: "deputy", columnsOf: { entity: "vote", feature: { title: "Position", type: "category", values: "votes/values/position.csv" } } },
    ],
  })
  assert.deepEqual(catalog, {
    files: [
      {
        file: "deputies/init.csv",
        entity: "deputy",
        rows: null,
        features: [
          { column: "group", title: "Groupe politique", type: "category", values: "deputies/values/group.csv" },
          { column: "deputy", title: "Député", type: "reference", entity: "deputy" },
          { column: "age", title: "Âge", type: "number" },
          { column: "photo", title: "Photo", type: "image" },
        ],
        columnsOf: null,
      },
      {
        file: "votes/positions.csv",
        entity: "deputy",
        rows: null,
        features: [],
        columnsOf: { entity: "vote", feature: { title: "Position", type: "category", values: "votes/values/position.csv" } },
      },
    ],
  })
  assert.equal(valuesTablePath(catalog, "deputies/init.csv", "group"), "deputies/values/group.csv")
  assert.equal(columnsValuesTablePath(catalog, "votes/positions.csv"), "votes/values/position.csv")
  assert.throws(() => valuesTablePath(catalog, "deputies/init.csv", "age"), /catalog\.json: no category feature deputies\/init\.csv:age/)
  assert.throws(() => valuesTablePath(catalog, "votes/votes.csv", "group"), /no category feature votes\/votes\.csv:group/)
  assert.throws(() => columnsValuesTablePath(catalog, "deputies/init.csv"), /catalog\.json: deputies\/init\.csv has no category columns/)
  assert.throws(() => columnsValuesTablePath(catalog, "votes/votes.csv"), /catalog\.json: votes\/votes\.csv has no category columns/)
})

test("an entry missing what its kind needs is rejected, naming the file and the column", () => {
  const file = (entry: object) => ({ files: [{ file: "f.csv", entity: "e", ...entry }] })
  const feature = (entry: object) => file({ features: [{ column: "c", title: "T", ...entry }] })
  const rejected: readonly [unknown, RegExp][] = [
    [{}, /catalog\.json: no files list/],
    [{ files: {} }, /no files list/],
    [{ files: [null] }, /file 0 has no name/],
    [{ files: [{ entity: "e", features: [] }] }, /file 0 has no name/],
    [{ files: [{ file: "f.csv", features: [] }] }, /f\.csv has no entity/],
    [file({}), /f\.csv lists neither features nor columnsOf/],
    [file({ features: [{ title: "T", type: "number" }] }), /f\.csv has a feature without column/],
    [file({ features: [null] }), /f\.csv has a feature without column/],
    [feature({ title: 1, type: "number" }), /f\.csv:c has no title/],
    [feature({ type: "category" }), /f\.csv:c has no values table/],
    [feature({ type: "reference" }), /f\.csv:c references no entity/],
    [feature({ type: "colour" }), /f\.csv:c has an unknown type/],
    [file({ columnsOf: { feature: { title: "T", type: "number" } } }), /f\.csv has columnsOf without entity or feature/],
    [file({ columnsOf: { entity: "v" } }), /f\.csv has columnsOf without entity or feature/],
    [file({ columnsOf: { entity: "v", feature: { title: "T", type: "category" } } }), /f\.csv columns has no values table/],
  ]
  for (const [json, message] of rejected) assert.throws(() => parseCatalog(json), message, JSON.stringify(json))
})
