import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { layout, snapshotPath } from "./paths.ts";
import { type RunResult, exitCode, recordRun } from "./runs.ts";
import { temporaryRoot } from "./snapshots.fixture.ts";
import { dataVersion } from "./version.ts";

const version = dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
const previous = dataVersion("0123456789abcdef0123456789abcdef01234567");
const counts = { deputies: 654, votes: 9697, newVotes: 3 };
const startedAt = new Date("2026-11-07T04:00:00.000Z");
const finishedAt = new Date("2026-11-07T04:20:00.000Z");

test("published and unchanged runs exit with 0, published ones whose retention failed with 5, refused ones with 3, failed ones with 1", () => {
  assert.equal(exitCode({ status: "published", version, previous, counts, override: null, warning: null }), 0);
  assert.equal(exitCode({ status: "published", version, previous, counts, override: null, warning: "EACCES" }), 5);
  assert.equal(exitCode({ status: "unchanged", version, counts }), 0);
  const refusals = [{ guard: "votes-drop", current: 2, candidate: 1 }] as const;
  assert.equal(exitCode({ status: "rejected", version, previous, counts, refusals, warning: null }), 3);
  assert.equal(exitCode({ status: "rejected", version, previous, counts, refusals, warning: "EACCES" }), 3);
  assert.equal(exitCode({ status: "failed", error: "boom" }), 1);
});

async function recorded(result: RunResult): Promise<unknown> {
  const root = await temporaryRoot();
  await recordRun(root, result, startedAt, finishedAt);
  assert.deepEqual(await readdir(layout(root).runs), ["last.json"]);
  return JSON.parse(await readFile(`${layout(root).runs}/last.json`, "utf8"));
}

test("last.json records a refused run with its counts and the reason of each refusal", async () => {
  const refusals = [
    { guard: "votes-drop", current: 2, candidate: 1 },
    { guard: "file-empty", file: snapshotPath("deputies/values/civility.csv") },
  ] as const;
  assert.deepEqual(await recorded({ status: "rejected", version, previous, counts, refusals, warning: "Old versions could not be pruned: EACCES" }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "rejected",
    exitCode: 3,
    version,
    previousVersion: previous,
    forced: false,
    counts,
    refusals: ["1 votes against 2 in the current version", "deputies/values/civility.csv is empty"],
    warning: "Old versions could not be pruned: EACCES",
    error: null,
  });
});

test("last.json records a forced publication with the refusals it overrode", async () => {
  const override = { refusals: [{ guard: "votes-drop", current: 2, candidate: 1 }] } as const;
  assert.deepEqual(await recorded({ status: "published", version, previous, counts, override, warning: null }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "published",
    exitCode: 0,
    version,
    previousVersion: previous,
    forced: true,
    counts,
    refusals: ["1 votes against 2 in the current version"],
    warning: null,
    error: null,
  });
});

test("last.json records a publication whose retention failed as published, with its version, counts and warning", async () => {
  assert.deepEqual(await recorded({ status: "published", version, previous: null, counts, override: null, warning: "Old versions could not be pruned: EACCES" }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "published",
    exitCode: 5,
    version,
    previousVersion: null,
    forced: false,
    counts,
    refusals: [],
    warning: "Old versions could not be pruned: EACCES",
    error: null,
  });
});

test("last.json records a plain publication, an unchanged run and a failure", async () => {
  assert.deepEqual(await recorded({ status: "published", version, previous: null, counts, override: null, warning: null }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "published",
    exitCode: 0,
    version,
    previousVersion: null,
    forced: false,
    counts,
    refusals: [],
    warning: null,
    error: null,
  });
  assert.deepEqual(await recorded({ status: "unchanged", version, counts }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "unchanged",
    exitCode: 0,
    version,
    previousVersion: version,
    forced: false,
    counts,
    refusals: [],
    warning: null,
    error: null,
  });
  assert.deepEqual(await recorded({ status: "failed", error: "fetch failed" }), {
    startedAt: "2026-11-07T04:00:00.000Z",
    finishedAt: "2026-11-07T04:20:00.000Z",
    status: "failed",
    exitCode: 1,
    version: null,
    previousVersion: null,
    forced: false,
    counts: null,
    refusals: [],
    warning: null,
    error: "fetch failed",
  });
});
