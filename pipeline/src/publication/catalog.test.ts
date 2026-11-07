import assert from "node:assert/strict";
import { test } from "node:test";
import { catalogFiles, parseCatalog } from "./catalog.ts";

const table = {
  file: "seats/hemicycle.csv",
  entity: "seat",
  key: "seat",
  rows: 2,
  size: 30,
  gzipSize: 20,
  layout: { background: "seats/hemicycle.svg" },
  features: [
    { title: "Groupe", type: "category", values: "deputies/values/group.csv", column: "group" },
    { title: "x", type: "number", column: "x" },
  ],
};
const generated = {
  file: "deputies/major-votes.csv",
  entity: "deputy",
  key: "deputy_id",
  rows: 654,
  size: 100,
  gzipSize: 50,
  columnsOf: { entity: "vote", count: 259, feature: { title: "Position", type: "category", values: "deputies/values/vote_position.csv" } },
};
const geojson = { file: "communes/contours.geojson", entity: "commune", key: "commune", rows: 3, size: 9, gzipSize: 5, geometry: "MultiPolygon", features: [] };

const catalogOf = (...files: unknown[]) => JSON.stringify({ generated: "2026-11-07", files });

test("the catalog gives each file's shape, and lists every file it references once", () => {
  const catalog = parseCatalog(catalogOf(table, generated, geojson));
  assert.deepEqual([...catalog.values()], [
    {
      file: "seats/hemicycle.csv",
      key: "seat",
      rows: 2,
      size: 30,
      shape: { kind: "table", format: "csv", columns: [{ name: "group", type: "category" }, { name: "x", type: "number" }] },
      references: ["seats/hemicycle.svg", "deputies/values/group.csv"],
    },
    {
      file: "deputies/major-votes.csv",
      key: "deputy_id",
      rows: 654,
      size: 100,
      shape: { kind: "generated-columns", count: 259 },
      references: ["deputies/values/vote_position.csv"],
    },
    { file: "communes/contours.geojson", key: "commune", rows: 3, size: 9, shape: { kind: "table", format: "geojson", columns: [] }, references: [] },
  ]);
  assert.deepEqual([...parseCatalog(catalogOf({ ...table, rows: 0 })).values()].map((e) => e.rows), [0]);
  const twice = { ...table, file: "seats/other.csv" };
  assert.deepEqual(catalogFiles(parseCatalog(catalogOf(table, twice))), [
    "catalog.json",
    "seats/hemicycle.csv",
    "seats/hemicycle.svg",
    "deputies/values/group.csv",
    "seats/other.csv",
  ]);
});

test("a catalog naming a file outside the snapshot, twice, or with an impossible count is refused", () => {
  assert.throws(() => parseCatalog(catalogOf({ ...table, file: "../current.json" })), /Not a path inside a snapshot/);
  assert.throws(() => parseCatalog(catalogOf({ ...table, layout: { background: "/etc/passwd" } })), /Not a path inside a snapshot/);
  assert.throws(() => parseCatalog(catalogOf(table, table)), /twice/);
  assert.throws(() => parseCatalog(catalogOf({ ...table, rows: -1 })), /rows is not a count/);
  assert.throws(() => parseCatalog(catalogOf({ ...table, size: 1.5 })), /size is not a count/);
  assert.throws(() => parseCatalog(catalogOf({ ...table, rows: "2" })), /rows is not a count/);
  assert.throws(() => parseCatalog(catalogOf({ ...generated, columnsOf: { ...generated.columnsOf, count: -1 } })), /count is not a count/);
  assert.throws(() => parseCatalog(JSON.stringify({ files: {} })), /catalog files is not a list/);
});
