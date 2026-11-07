import assert from "node:assert/strict";
import { test } from "node:test";
import { type RunResult, summary } from "../publication/runs.ts";
import { snapshotPath } from "../publication/paths.ts";
import { dataVersion } from "../publication/version.ts";
import { lastRun } from "./lastRun.ts";

const version = dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
const previous = dataVersion("0123456789abcdef0123456789abcdef01234567");
const counts = { deputies: 654, votes: 9697, newVotes: 3 };
const startedAt = new Date("2026-11-07T03:30:00.000Z");
const finishedAt = new Date("2026-11-07T03:31:00.000Z");

const readBack = (result: RunResult) => lastRun(JSON.stringify(summary(result, startedAt, finishedAt), null, 1) + "\n");

test("every run summary the pipeline writes reads back with its status, versions, counts, refusals, warning and error", () => {
  assert.deepEqual(readBack({ status: "published", version, previous, counts, override: null, warning: null }), {
    status: "published",
    startedAt,
    version,
    previousVersion: previous,
    forced: false,
    counts,
    refusals: [],
    warning: null,
  });
  assert.deepEqual(
    readBack({ status: "published", version, previous: null, counts: { ...counts, newVotes: null }, override: { refusals: [{ guard: "votes-drop", current: 2, candidate: 1 }] }, warning: "EACCES" }),
    {
      status: "published",
      startedAt,
      version,
      previousVersion: null,
      forced: true,
      counts: { ...counts, newVotes: null },
      refusals: ["1 votes against 2 in the current version"],
      warning: "EACCES",
    },
  );
  assert.deepEqual(readBack({ status: "unchanged", version, counts }), { status: "unchanged", startedAt, version, counts });
  assert.deepEqual(readBack({ status: "rejected", version, previous, counts, refusals: [{ guard: "file-empty", file: snapshotPath("deputies/init.csv") }], warning: null }), {
    status: "rejected",
    startedAt,
    version,
    previousVersion: previous,
    counts,
    refusals: ["deputies/init.csv is empty"],
    warning: null,
  });
  assert.deepEqual(readBack({ status: "failed", error: "fetch failed" }), { status: "failed", startedAt, error: "fetch failed" });
});

test("a run summary that is not one is refused with what is wrong, never read as some outcome", () => {
  const valid = summary({ status: "unchanged", version, counts }, startedAt, finishedAt);
  for (const [content, error] of [
    ["", /JSON/],
    ["[]", /last\.json is not an object/],
    [JSON.stringify({ ...valid, startedAt: "yesterday" }), /startedAt is not a date/],
    [JSON.stringify({ ...valid, startedAt: undefined }), /startedAt is not a string/],
    [JSON.stringify({ ...valid, status: "done" }), /status is "done"/],
    [JSON.stringify({ ...valid, status: undefined }), /status is null/],
    [JSON.stringify({ ...valid, version: "main" }), /Not a data version/],
    [JSON.stringify({ ...valid, version: null }), /version is not a string/],
    [JSON.stringify({ ...valid, counts: null }), /counts is not an object/],
    [JSON.stringify({ ...valid, counts: { ...counts, deputies: -1 } }), /counts\.deputies is not a count/],
    [JSON.stringify({ ...valid, counts: { ...counts, votes: 1.5 } }), /counts\.votes is not a count/],
    [JSON.stringify({ ...valid, counts: { ...counts, votes: "9697" } }), /counts\.votes is not a count/],
    [JSON.stringify({ ...valid, counts: { ...counts, newVotes: "3" } }), /counts\.newVotes is not a count/],
    [JSON.stringify({ ...valid, status: "rejected", previousVersion: "x", refusals: [], warning: null }), /Not a data version \(40 lowercase hex digits\): x/],
    [JSON.stringify({ ...valid, status: "rejected", previousVersion: null, refusals: [1], warning: null }), /refusals\[0\] is not a string/],
    [JSON.stringify({ ...valid, status: "rejected", previousVersion: null, refusals: "none", warning: null }), /refusals is not a list/],
    [JSON.stringify({ ...valid, status: "published", previousVersion: null, refusals: [], warning: 5 }), /warning is not a string/],
    [JSON.stringify({ ...valid, status: "failed", error: null }), /error is not a string/],
    [JSON.stringify({ ...valid, status: "published", version: null }), /^Error: version is not a string$/],
    [JSON.stringify({ ...valid, status: "rejected", version: null }), /^Error: version is not a string$/],
    [JSON.stringify({ ...valid, status: "published", previousVersion: 5 }), /^Error: previousVersion is not a string$/],
    [JSON.stringify({ ...valid, status: "rejected", previousVersion: 5 }), /^Error: previousVersion is not a string$/],
    [JSON.stringify({ ...valid, status: "rejected", previousVersion: null, refusals: [], warning: 5 }), /^Error: warning is not a string$/],
  ] as const)
    assert.throws(() => lastRun(content), error, content);
});

test("a published run counts as forced only when the summary says true", () => {
  const written = summary({ status: "published", version, previous, counts, override: null, warning: null }, startedAt, finishedAt);
  for (const forced of [false, "true", 1, null]) {
    const run = lastRun(JSON.stringify({ ...written, forced }));
    assert.ok(run.status === "published" && !run.forced, String(forced));
  }
});
