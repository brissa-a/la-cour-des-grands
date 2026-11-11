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
    [deputyId("PA796042"), { first_name: "Frédéric", last_name: "Boccaletti" }],
    [deputyId("PA796046"), { first_name: "Isabelle", last_name: "Delyon" }],
    [deputyId("PA1327"), { first_name: "Nicolas", last_name: "Forissier" }],
    [deputyId("PA841151"), { first_name: "Alix", last_name: "Fruchon" }],
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

test("a catalogue without the default colour feature fails the load, so the service keeps the version it has", async () => {
  const catalog: unknown = JSON.parse(FILES["catalog.json"] ?? "")
  const withoutGroup = JSON.stringify(catalog).replace('"column":"group"', '"column":"party"')
  await assert.rejects(loadShareData(readerOf({ ...FILES, "catalog.json": withoutGroup })), /^Error: catalog\.json: no feature deputies\/init\.csv:group$/)
})

test("a version whose seats or mandates do not read still loads, every deputy named, with a drawing it cannot tell and the reason why", async () => {
  const init = FILES["deputies/init.csv"] ?? ""
  const withoutSeats = Object.fromEntries(Object.entries(FILES).filter(([path]) => path !== "seats/hemicycle.csv"))
  const versions: readonly (readonly [Readonly<Record<string, string>>, string])[] = [
    [withoutSeats, "seats/hemicycle.csv: HTTP 404"],
    [{ ...FILES, "seats/hemicycle.csv": "seat,x,y\n12,0.5625,0\n" }, "seats/hemicycle.csv: missing columns deputy"],
    [{ ...FILES, "deputies/init.csv": init.replace("2024-07-08/2026-11-09", "2026-11-09/2024-07-01") }, 'deputies/init.csv: PA796042 has mandate period "2026-11-09/2024-07-01"'],
    [{ ...FILES, "deputies/init.csv": init.replace(",yes,62-11,", ",yes,,") }, 'deputies/init.csv: PA720614 has constituency ""'],
    [{ ...FILES, "deputies/init.csv": init.replaceAll(/,[^,\n]*$/gm, "") }, "deputies/init.csv: missing columns mandate_periods"],
  ]
  for (const [files, reason] of versions) {
    const data = await loadShareData(readerOf(files))
    assert.deepEqual([data.people.size, data.drawing], [6, { kind: "unknown", reason }], reason)
  }
})
