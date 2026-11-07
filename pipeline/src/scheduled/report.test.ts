import assert from "node:assert/strict";
import { test } from "node:test";
import { deputyId } from "../jobs/deputies.ts";
import { dataVersion } from "../publication/version.ts";
import type { LastRun } from "./lastRun.ts";
import { type Observed, notificationFor, tail } from "./report.ts";

const version = dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
const previous = dataVersion("0123456789abcdef0123456789abcdef01234567");
const counts = { deputies: 654, votes: 9759, newVotes: 3 };
const startedAt = new Date("2026-11-07T03:30:00.000Z");
const LOCK = "/data/v2/.lock";
const EXEC = "docker --context abysshopper exec lcdg-lcdg-pipeline-1";

const published: LastRun = { status: "published", startedAt, version, previousVersion: previous, forced: false, counts, refusals: [], warning: null, cutouts: { failed: [], waiting: 0 } };

function observed(overrides: Partial<Observed>): Observed {
  return { exit: { kind: "code", code: 0 }, record: { kind: "fresh", run: published }, lockPath: LOCK, holder: null, lockReleased: false, outOfMemory: false, stderr: "", ...overrides };
}

const fresh = (run: LastRun) => ({ kind: "fresh", run }) as const;

test("a publication sends a quiet summary: new votes, version, counts and the version it replaces", () => {
  assert.deepEqual(notificationFor(observed({})), {
    topic: "done",
    priority: 2,
    title: "Data published: 3 new votes",
    body: `Version ${version} (654 deputies, 9759 votes).\nPrevious version ${previous}.`,
    tags: ["white_check_mark"],
  });
  const first = notificationFor(observed({ record: fresh({ ...published, previousVersion: null, counts: { ...counts, newVotes: null } }) }));
  assert.deepEqual([first.title, first.body], ["Data published", `Version ${version} (654 deputies, 9759 votes).\nFirst version of the data root.`]);
  const forced = notificationFor(observed({ record: fresh({ ...published, forced: true, refusals: ["1 votes against 2 in the current version"] }) }));
  assert.deepEqual(forced.body.split("\n").slice(2), ["Forced over the guards' refusals:", "- 1 votes against 2 in the current version"]);
});

test("an unchanged run sends a quiet summary naming the version still current", () => {
  assert.deepEqual(notificationFor(observed({ record: fresh({ status: "unchanged", startedAt, version, counts, cutouts: null }) })), {
    topic: "done",
    priority: 2,
    title: "Data unchanged",
    body: `${version} is still the current version (654 deputies, 9759 votes).`,
    tags: ["white_check_mark"],
  });
});

test("a publication whose old versions were not pruned is said louder, with the warning", () => {
  const warned = notificationFor(observed({ exit: { kind: "code", code: 5 }, record: fresh({ ...published, warning: "Old versions could not be pruned: EACCES" }) }));
  assert.deepEqual(
    [warned.topic, warned.priority, warned.title, warned.tags, warned.body.split("\n").at(-1)],
    ["done", 3, "Data published: 3 new votes, old versions not pruned", ["warning"], "Warning: Old versions could not be pruned: EACCES"],
  );
});

const failedCutouts = (count: number) => ({
  failed: Array.from({ length: count }, (_, i) => ({ id: deputyId(`PA${i + 1}`), reason: i === 0 ? "killed by SIGKILL, most likely for lack of memory" : "Input file is missing" })),
  waiting: 4,
});

test("failed cutouts raise the summary of a publication or an unchanged run, naming the first deputies and why", () => {
  const raised = notificationFor(observed({ record: fresh({ ...published, cutouts: failedCutouts(2) }) }));
  assert.deepEqual(raised, {
    topic: "done",
    priority: 3,
    title: "Data published: 3 new votes, cutouts failed: 2",
    body: [
      `Version ${version} (654 deputies, 9759 votes).`,
      `Previous version ${previous}.`,
      "Cutouts: 2 failed, 4 still waiting. Until theirs is done, these deputies keep their previous cutout, or the official photo.",
      "- PA1: killed by SIGKILL, most likely for lack of memory",
      "- PA2: Input file is missing",
    ].join("\n"),
    tags: ["warning"],
  });
  const unchanged = notificationFor(observed({ record: fresh({ status: "unchanged", startedAt, version, counts, cutouts: failedCutouts(7) }) }));
  assert.deepEqual([unchanged.priority, unchanged.title, unchanged.tags], [3, "Data unchanged, cutouts failed: 7", ["warning"]]);
  assert.deepEqual(unchanged.body.split("\n").slice(-3), ["- PA4: Input file is missing", "- PA5: Input file is missing", "- and 2 more, listed in .runs/last.json"]);
  const both = notificationFor(observed({ exit: { kind: "code", code: 5 }, record: fresh({ ...published, warning: "EACCES", cutouts: failedCutouts(1) }) }));
  assert.deepEqual([both.priority, both.title], [3, "Data published: 3 new votes, old versions not pruned, cutouts failed: 1"]);
});

test("photos only waiting for their cutout are said in the summary, which stays quiet", () => {
  const waiting = notificationFor(observed({ record: fresh({ ...published, cutouts: { failed: [], waiting: 3 } }) }));
  assert.deepEqual([waiting.priority, waiting.title, waiting.tags], [2, "Data published: 3 new votes", ["white_check_mark"]]);
  assert.equal(waiting.body.split("\n").at(-1), "Cutouts: 0 failed, 3 still waiting. Until theirs is done, these deputies keep their previous cutout, or the official photo.");
  const none = notificationFor(observed({ record: fresh({ status: "unchanged", startedAt, version, counts, cutouts: null }) }));
  assert.equal(none.body, `${version} is still the current version (654 deputies, 9759 votes).`);
});

test("a refusal by the guards is an alert listing each refusal and the command that publishes the candidate anyway", () => {
  const run: LastRun = {
    status: "rejected",
    startedAt,
    version,
    previousVersion: previous,
    counts,
    refusals: ["1 votes against 2 in the current version", "deputies/init.csv is empty"],
    warning: "EACCES",
    cutouts: null,
  };
  assert.deepEqual(notificationFor(observed({ exit: { kind: "code", code: 3 }, record: fresh(run) })), {
    topic: "rejected",
    priority: 4,
    title: "Data rejected by the guards",
    body: [
      `Candidate ${version} (654 deputies, 9759 votes) was set aside, ${previous} stays current:`,
      "- 1 votes against 2 in the current version",
      "- deputies/init.csv is empty",
      "Warning: EACCES",
      `Once inspected, publish it with: ${EXEC} node src/scheduled/main.ts run --publish-rejected ${version}`,
    ].join("\n"),
    tags: ["no_entry"],
  });
  const firstRefused = notificationFor(observed({ exit: { kind: "code", code: 3 }, record: fresh({ ...run, previousVersion: null, warning: null, cutouts: failedCutouts(1) }) }));
  assert.equal(
    firstRefused.body,
    [
      `Candidate ${version} (654 deputies, 9759 votes) was set aside, no version stays current:`,
      "- 1 votes against 2 in the current version",
      "- deputies/init.csv is empty",
      "Cutouts: 1 failed, 4 still waiting. Until theirs is done, these deputies keep their previous cutout, or the official photo.",
      "- PA1: killed by SIGKILL, most likely for lack of memory",
      `Once inspected, publish it with: ${EXEC} node src/scheduled/main.ts run --publish-rejected ${version}`,
    ].join("\n"),
  );
});

test("a run refused by the lock is an alert naming the holder and how to free it", () => {
  const notification = notificationFor(observed({ exit: { kind: "code", code: 4 }, record: { kind: "fresh", run: published }, holder: "held by pid 7 on 3f2a9c1b7d0e since 2026-11-06T03:30:00.000Z" }));
  assert.deepEqual(notification, {
    topic: "locked",
    priority: 3,
    title: "Run skipped: another run holds the lock",
    body: `${LOCK}: held by pid 7 on 3f2a9c1b7d0e since 2026-11-06T03:30:00.000Z.\nIf no run is in progress: ${EXEC} rm ${LOCK}`,
    tags: ["lock"],
  });
  assert.match(notificationFor(observed({ exit: { kind: "code", code: 4 }, holder: null })).body, /^\/data\/v2\/\.lock: unreadable\./);
});

test("a recorded failure is an alert with its error and the end of the error output", () => {
  const notification = notificationFor(observed({ exit: { kind: "code", code: 1 }, record: fresh({ status: "failed", startedAt, error: "fetch failed" }), stderr: "TypeError: fetch failed\n    at download\n" }));
  assert.deepEqual(notification, {
    topic: "failed",
    priority: 4,
    title: "Run failed (exit 1)",
    body: "The pipeline exited with 1.\nIt recorded: fetch failed\nLast lines of its error output:\nTypeError: fetch failed\n    at download",
    tags: ["rotating_light"],
  });
});

test("an exit that does not match the recorded outcome, or comes with no fresh summary, is a failure saying so", () => {
  const mirrorFailed = notificationFor(observed({ exit: { kind: "code", code: 1 }, record: fresh(published) }));
  assert.deepEqual([mirrorFailed.topic, mirrorFailed.priority, mirrorFailed.body], ["failed", 4, `The pipeline exited with 1.\nIt recorded the run as published (${version}).`]);
  for (const [exit, record] of [
    [0, { kind: "none", reason: "/data/v2/.runs/last.json is from an earlier run, started 2026-11-06T03:30:00.000Z" }],
    [3, { kind: "none", reason: "no /data/v2/.runs/last.json" }],
    [5, { kind: "none", reason: "no /data/v2/.runs/last.json" }],
    [0, fresh({ status: "failed", startedAt, error: "boom" })],
    [3, fresh(published)],
    [5, fresh({ status: "rejected", startedAt, version, previousVersion: null, counts, refusals: [], warning: null, cutouts: null })],
    [7, fresh(published)],
  ] as const) {
    const notification = notificationFor(observed({ exit: { kind: "code", code: exit }, record }));
    assert.deepEqual([notification.topic, notification.priority, notification.title], ["failed", 4, `Run failed (exit ${exit})`], `${exit} ${JSON.stringify(record)}`);
  }
  assert.equal(
    notificationFor(observed({ exit: { kind: "code", code: 0 }, record: { kind: "none", reason: "no /data/v2/.runs/last.json" } })).body,
    "The pipeline exited with 0.\nIt recorded no run: no /data/v2/.runs/last.json.",
  );
});

test("a pipeline killed by the kernel for memory, or by a signal, is an alert that says which, and whether its lock was freed", () => {
  const oom = notificationFor(observed({ exit: { kind: "signal", signal: "SIGKILL" }, record: { kind: "none", reason: "no /data/v2/.runs/last.json" }, outOfMemory: true, lockReleased: true, stderr: "  12/40\n" }));
  assert.deepEqual(oom, {
    topic: "failed",
    priority: 4,
    title: "Run killed: out of memory",
    body: [
      "The kernel killed the pipeline (SIGKILL): the container reached its memory limit.",
      "It recorded no run: no /data/v2/.runs/last.json.",
      `Its lock ${LOCK}, held by no process any more, was released: the next run will start.`,
      "Last lines of its error output:",
      "  12/40",
    ].join("\n"),
    tags: ["rotating_light"],
  });
  const killed = notificationFor(observed({ exit: { kind: "signal", signal: "SIGKILL" }, record: fresh(published), outOfMemory: false }));
  assert.deepEqual([killed.topic, killed.priority, killed.title, killed.body.split("\n")[0]], ["failed", 4, "Run killed by SIGKILL", "The pipeline was killed by SIGKILL."]);
  const unstarted = notificationFor(observed({ exit: { kind: "unstarted", reason: "spawn node ENOENT" }, record: fresh(published) }));
  assert.deepEqual([unstarted.topic, unstarted.priority, unstarted.title, unstarted.body.split("\n")[0]], ["failed", 4, "Run not started", "The pipeline could not start: spawn node ENOENT"]);
});

test("the end of the error output keeps its last lines within the size an alert allows", () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i}`);
  assert.equal(tail(lines.join("\n") + "\n\n"), lines.slice(-12).join("\n"));
  assert.equal(tail(lines.join("\n"), 3, 1000), "line 27\nline 28\nline 29");
  assert.equal(tail(lines.join("\n"), 12, 16), "line 28\nline 29");
  assert.equal(tail("é".repeat(40), 12, 9), "éééé");
  assert.equal(tail("😀".repeat(10), 12, 10), "😀😀");
  assert.equal(tail("aaaa\nbbbb\ncccc", 12, 9), "bbbb\ncccc");
  assert.equal(tail("aaaa\nbbbb\ncccc", 12, 8), "cccc");
  assert.equal(tail("ab\uFFFDcd", 12, 6), "b\uFFFDcd");
  assert.equal(tail(""), "");
});
