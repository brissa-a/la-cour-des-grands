import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import { test } from "node:test";
import { filesUnder } from "./files.ts";
import { type Candidate, type Refusal, type Snapshot, countsOf, describeRefusal, readSnapshotCatalog, refusalsOf } from "./guards.ts";
import { snapshotPath } from "./paths.ts";
import { COUNTED, type CatalogJson, type Contents, standard, temporaryDir, writeSnapshot } from "./snapshots.fixture.ts";

async function candidate(contents: Contents, edit?: (catalog: CatalogJson) => void): Promise<Candidate> {
  const dir = await temporaryDir();
  await writeSnapshot(dir, contents, edit);
  const sizes = new Map(await Promise.all((await filesUnder(dir)).map(async (f) => [snapshotPath(f), (await stat(`${dir}/${f}`)).size] as const)));
  return { dir, sizes, catalog: await readSnapshotCatalog(dir) };
}

const current = async (contents: Contents, edit?: (catalog: CatalogJson) => void): Promise<Snapshot> => candidate(contents, edit);

const guards = (refusals: readonly Refusal[]) => refusals.map((r) => r.guard);

const entry = (catalog: CatalogJson, file: string): Record<string, unknown> => {
  const found = catalog.files.find((f) => f.file === file);
  if (found === undefined) throw new Error(`no ${file} in the fixture`);
  return found;
};

test("a coherent candidate is accepted, with or without a current version", async () => {
  assert.deepEqual(await refusalsOf(await candidate(standard()), null, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(standard({ votes: ["V1", "V2", "V3", "V4"] })), await current(standard()), COUNTED), []);
});

test("fewer than 550 deputies is refused even without a current version", async () => {
  assert.deepEqual(await refusalsOf(await candidate(standard({ deputies: 550 })), null, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(standard({ deputies: 549 })), null, COUNTED), [{ guard: "deputies-below-floor", candidate: 549 }]);
});

test("losing more than 2 % of the current deputies is refused", async () => {
  const published = await current(standard({ deputies: 1000 }));
  assert.deepEqual(await refusalsOf(await candidate(standard({ deputies: 980 })), published, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(standard({ deputies: 979 })), published, COUNTED), [{ guard: "deputies-drop", current: 1000, candidate: 979 }]);
});

test("losing a vote is refused", async () => {
  const published = await current(standard({ votes: ["V1", "V2", "V3"] }));
  assert.deepEqual(await refusalsOf(await candidate(standard({ votes: ["V1", "V2", "V4"] })), published, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(standard({ votes: ["V1", "V2"] })), published, COUNTED), [{ guard: "votes-drop", current: 3, candidate: 2 }]);
});

test("an entry or a column of the current catalog missing from the candidate's is refused", async () => {
  const contents = standard();
  const withLinks: Contents = {
    ...contents,
    tables: [...contents.tables, { file: "deputies/links.csv", key: "deputy_id", columns: [{ name: "url", type: "link" }], rows: [["PA1", "u"]] }],
  };
  const published = await current(withLinks);
  assert.deepEqual(guards(await refusalsOf(await candidate(contents), published, COUNTED)), ["entry-missing"]);
  const [deputies, votes] = contents.tables;
  if (deputies === undefined || votes === undefined) throw new Error("standard fixture changed");
  const lostCivility: Contents = {
    ...withLinks,
    tables: [{ ...deputies, columns: deputies.columns.slice(0, 1), rows: deputies.rows.map((r) => r.slice(0, 2)) }, ...withLinks.tables.slice(1)],
  };
  assert.deepEqual(await refusalsOf(await candidate(lostCivility), published, COUNTED), [
    { guard: "column-missing", file: "deputies/init.csv", column: "civility" },
  ]);
});

test("an empty file is refused", async () => {
  const contents = standard();
  const refusals = await refusalsOf(await candidate({ ...contents, files: { ...contents.files, "deputies/values/civility.csv": "" } }), null, COUNTED);
  assert.deepEqual(refusals, [{ guard: "file-empty", file: "deputies/values/civility.csv" }]);
});

test("a catalog whose size, row count or header disagrees with the file is refused", async () => {
  const size = await refusalsOf(
    await candidate(standard(), (c) => {
      entry(c, "votes/votes.csv").size = 1;
    }),
    null,
    COUNTED,
  );
  assert.deepEqual(size, [{ guard: "catalog-mismatch", file: "votes/votes.csv", field: "size", catalog: "1", actual: "47" }]);

  const rows = await refusalsOf(
    await candidate(standard(), (c) => {
      entry(c, "votes/votes.csv").rows = 4;
    }),
    null,
    COUNTED,
  );
  assert.deepEqual(rows, [{ guard: "catalog-mismatch", file: "votes/votes.csv", field: "rows", catalog: "4", actual: "3" }]);

  const header = await refusalsOf(
    await candidate(standard(), (c) => {
      entry(c, "votes/votes.csv").features = [{ title: "t", type: "text", column: "name" }];
    }),
    null,
    COUNTED,
  );
  assert.deepEqual(header, [{ guard: "catalog-mismatch", file: "votes/votes.csv", field: "header", catalog: "vote_id,name", actual: "vote_id,title" }]);
});

test("a generated-columns file must have its key and as many columns as the catalog counts", async () => {
  const contents = standard();
  const generated = (count: number) => (c: CatalogJson) => {
    const votes = entry(c, "votes/votes.csv");
    delete votes.features;
    votes.columnsOf = { entity: "vote", count, feature: { title: "Position", type: "category", values: "deputies/values/civility.csv" } };
  };
  assert.deepEqual(await refusalsOf(await candidate(contents, generated(1)), null, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(contents, generated(2)), null, COUNTED), [
    { guard: "catalog-mismatch", file: "votes/votes.csv", field: "header", catalog: "vote_id and 2 columns", actual: "vote_id and 1 columns" },
  ]);
});

test("a GeoJSON file must hold as many features as the catalog counts rows", async () => {
  const contents = standard();
  const geojson = '{"type":"FeatureCollection","features":[\n{"type":"Feature"},\n{"type":"Feature"}\n]}\n';
  const withContours = (rows: number) => (c: CatalogJson) => {
    c.files.push({ file: "communes/contours.geojson", key: "commune", rows, size: Buffer.byteLength(geojson), geometry: "MultiPolygon", features: [] });
  };
  const files = { ...contents.files, "communes/contours.geojson": geojson };
  assert.deepEqual(await refusalsOf(await candidate({ ...contents, files }, withContours(2)), null, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate({ ...contents, files }, withContours(3)), null, COUNTED), [
    { guard: "catalog-mismatch", file: "communes/contours.geojson", field: "rows", catalog: "3", actual: "2" },
  ]);
});

test("a file the catalog references but the snapshot lacks is refused", async () => {
  const contents = standard();
  const withoutValues = { ...contents, files: Object.fromEntries(Object.entries(contents.files).filter(([f]) => !f.startsWith("deputies/values/"))) };
  assert.deepEqual(await refusalsOf(await candidate(withoutValues), null, COUNTED), [{ guard: "file-missing", file: "deputies/values/civility.csv" }]);
});

test("a photo value that is missing from the snapshot or is not a path inside it is refused", async () => {
  const contents = standard({ photos: 3 });
  const [deputies, ...others] = contents.tables;
  if (deputies === undefined) throw new Error("standard fixture changed");
  const absolute = "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2/PA1.webp";
  const rows = deputies.rows.map((r, i) => (i === 0 ? [r[0] ?? "", absolute, "M."] : i === 1 ? [r[0] ?? "", "photos/PA999.webp", "M."] : r));
  const refusals = await refusalsOf(await candidate({ ...contents, tables: [{ ...deputies, rows }, ...others] }), null, COUNTED);
  assert.deepEqual(refusals, [{ guard: "photos-missing", file: "deputies/init.csv", column: "photo", photos: [absolute, "photos/PA999.webp"] }]);
});

test("the counts give the candidate's deputies and votes, and the votes absent from the current version", async () => {
  const published = await current(standard({ deputies: 600, votes: ["V1", "V2"] }));
  const next = await candidate(standard({ deputies: 601, votes: ["V1", "V2", "V3", "V4"] }));
  assert.deepEqual(await countsOf(next, published, COUNTED), { deputies: 601, votes: 4, newVotes: 2 });
  assert.deepEqual(await countsOf(next, null, COUNTED), { deputies: 601, votes: 4, newVotes: null });
});

test("each refusal is described with the file and the figures that locate the fault", () => {
  const file = snapshotPath("deputies/init.csv");
  const described: [Refusal, readonly string[]][] = [
    [{ guard: "deputies-below-floor", candidate: 549 }, ["549", "550"]],
    [{ guard: "deputies-drop", current: 1000, candidate: 979 }, ["979", "1000", "2 %"]],
    [{ guard: "votes-drop", current: 3, candidate: 2 }, ["2 votes", "3"]],
    [{ guard: "entry-missing", file }, [file, "current catalog"]],
    [{ guard: "column-missing", file, column: "civility" }, [file, "civility"]],
    [{ guard: "file-missing", file }, [file, "missing"]],
    [{ guard: "file-empty", file }, [file, "empty"]],
    [{ guard: "catalog-mismatch", file, field: "rows", catalog: "4", actual: "3" }, [file, "rows 4", "has 3"]],
    [{ guard: "photos-missing", file, column: "photo", photos: ["p1", "p2", "p3", "p4", "p5", "p6"] }, [file, "6 photo values", "(p1, p2, p3, p4, p5)"]],
  ];
  for (const [refusal, figures] of described) for (const figure of figures) assert.ok(describeRefusal(refusal).includes(figure), `${refusal.guard}: ${figure}`);
});

test("a candidate without the deputies file counts no deputy and is refused", async () => {
  const contents = standard();
  const withoutDeputies = { ...contents, tables: contents.tables.filter((t) => t.file !== "deputies/init.csv") };
  assert.deepEqual(await refusalsOf(await candidate(withoutDeputies), null, COUNTED), [{ guard: "deputies-below-floor", candidate: 0 }]);
});

test("every vote is new when the current version has no votes file", async () => {
  const contents = standard();
  const published = await current({ ...contents, tables: contents.tables.filter((t) => t.file !== "votes/votes.csv") });
  assert.deepEqual(await countsOf(await candidate(standard()), published, COUNTED), { deputies: 600, votes: 3, newVotes: 3 });
});

test("a generated-columns entry is kept by any generated-columns entry, a table loses its columns to one", async () => {
  const generated = (file: string) => (c: CatalogJson) => {
    const votes = entry(c, file);
    delete votes.features;
    votes.columnsOf = { entity: "vote", count: 1, feature: { title: "Position", type: "category", values: "deputies/values/civility.csv" } };
  };
  const published = await current(standard(), generated("votes/votes.csv"));
  assert.deepEqual(await refusalsOf(await candidate(standard(), generated("votes/votes.csv")), published, COUNTED), []);
  assert.deepEqual(await refusalsOf(await candidate(standard(), generated("votes/votes.csv")), await current(standard()), COUNTED), [
    { guard: "column-missing", file: "votes/votes.csv", column: "title" },
  ]);
});

test("a catalog entry whose file is not in the snapshot is refused", async () => {
  const refusals = await refusalsOf(
    await candidate(standard(), (c) => {
      c.files.push({ ...entry(c, "votes/votes.csv"), file: "votes/lost.csv" });
    }),
    null,
    COUNTED,
  );
  assert.deepEqual(refusals, [{ guard: "file-missing", file: "votes/lost.csv" }]);
});
