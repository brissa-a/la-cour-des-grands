import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";
import { exists } from "./files.ts";
import { type Lock, acquireLock } from "./lock.ts";
import { type DataRoot, dataRoot, layout } from "./paths.ts";
import { type Outcome, publish } from "./publish.ts";
import { type RunPlan, runOnce } from "./run.ts";
import { COUNTED, clock, sources, standard, temporaryRoot } from "./snapshots.fixture.ts";
import { type DataVersion, dataVersion } from "./version.ts";

const OWNER = { pid: 4242, host: "box" };
const version = dataVersion("6a64dfbf2449e4c8357bc0319b9fe0b747c577d9");
const counts = { deputies: 654, votes: 9697, newVotes: 3 };

type Recorded = { readonly lines: string[]; readonly errors: unknown[]; readonly mirrored: DataVersion[]; built: number };

function plan(root: DataRoot, build: () => Promise<Outcome>, overrides: Partial<RunPlan> = {}): { plan: RunPlan; recorded: Recorded } {
  const recorded: Recorded = { lines: [], errors: [], mirrored: [], built: 0 };
  return {
    recorded,
    plan: {
      root,
      owner: OWNER,
      build: async () => {
        recorded.built++;
        return { ...(await build()), cutouts: null, unseated: null };
      },
      mirror: (v) => {
        recorded.mirrored.push(v);
        return Promise.resolve();
      },
      now: clock(),
      whileLocked: () => undefined,
      console: { log: (line) => recorded.lines.push(line), error: (message) => recorded.errors.push(message) },
      ...overrides,
    },
  };
}

const lastRun = async (root: DataRoot): Promise<unknown> => JSON.parse(await readFile(`${layout(root).runs}/last.json`, "utf8"));

const fieldsOf = async (root: DataRoot, ...keys: string[]): Promise<Record<string, unknown>> => {
  const run = await lastRun(root);
  if (typeof run !== "object" || run === null) throw new Error("last.json is not an object");
  return Object.fromEntries(Object.entries(run).filter(([key]) => keys.includes(key)));
};

test("a publication exits with 0, records it in last.json, then mirrors the version", async () => {
  const root = await temporaryRoot();
  const files = await sources(standard());
  const { plan: run, recorded } = plan(root, () => publish({ root, sources: files, counted: COUNTED, now: clock() }));
  assert.equal(await runOnce(run), 0);
  const { version: published } = await fieldsOf(root, "version");
  assert.deepEqual(await fieldsOf(root, "status", "exitCode"), { status: "published", exitCode: 0 });
  assert.deepEqual(recorded.mirrored, [published]);
  assert.match(recorded.lines.join("\n"), /^Published [0-9a-f]{40} \(600 deputies, 3 votes, no previous version, so no new votes\)$/);
});

test("an unchanged run is mirrored too, and exits with 0", async () => {
  const root = await temporaryRoot();
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "unchanged", version, counts }));
  assert.equal(await runOnce(run), 0);
  assert.deepEqual(recorded.mirrored, [version]);
  assert.deepEqual(await fieldsOf(root, "status"), { status: "unchanged" });
  assert.deepEqual(recorded.lines, [`Unchanged: ${version} is already the current version`]);
});

test("a run asked for no mirror mirrors nothing and keeps its exit code", async () => {
  const root = await temporaryRoot();
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "unchanged", version, counts }), { mirror: null });
  assert.equal(await runOnce(run), 0);
  assert.deepEqual(recorded.errors, []);
});

test("a refused candidate exits with 3, is recorded with each refusal and any warning, and is not mirrored", async () => {
  const root = await temporaryRoot();
  const refusals = [{ guard: "votes-drop", current: 2, candidate: 1 }] as const;
  const warning = "Old versions could not be pruned: EACCES";
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "rejected", version, previous: null, counts, refusals, warning }));
  assert.equal(await runOnce(run), 3);
  assert.deepEqual(recorded.mirrored, []);
  assert.deepEqual(await fieldsOf(root, "status", "exitCode"), { status: "rejected", exitCode: 3 });
  assert.deepEqual(recorded.lines, [
    `Rejected ${version}, kept for inspection, current version untouched:\n  - 1 votes against 2 in the current version\nWarning: ${warning}`,
  ]);
  const { plan: plain, recorded: plainRecorded } = plan(root, () => Promise.resolve({ status: "rejected", version, previous: null, counts, refusals, warning: null }));
  assert.equal(await runOnce(plain), 3);
  assert.deepEqual(plainRecorded.lines, [`Rejected ${version}, kept for inspection, current version untouched:\n  - 1 votes against 2 in the current version`]);
});

test("a forced publication says so", async () => {
  const root = await temporaryRoot();
  const override = { refusals: [{ guard: "votes-drop", current: 2, candidate: 1 }] } as const;
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "published", version, previous: null, counts, override, warning: null }));
  assert.equal(await runOnce(run), 0);
  assert.deepEqual(recorded.lines, [`Published ${version}, forced over its refusals (654 deputies, 9697 votes, 3 new votes)`]);
});

test("a build that throws is recorded as a failure in last.json, exits with 1 and is not mirrored", async () => {
  const root = await temporaryRoot();
  const failure = new Error("fetch failed");
  const { plan: run, recorded } = plan(root, () => Promise.reject(failure));
  assert.equal(await runOnce(run), 1);
  assert.deepEqual(recorded.mirrored, []);
  assert.deepEqual(recorded.errors, [failure]);
  assert.deepEqual(await fieldsOf(root, "status", "exitCode", "error"), { status: "failed", exitCode: 1, error: "fetch failed" });
  assert.deepEqual(recorded.lines, ["Failed: fetch failed"]);
});

test("a publication whose retention failed exits with 5, and is still mirrored", async () => {
  const root = await temporaryRoot();
  const warning = "Old versions could not be pruned: EACCES";
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "published", version, previous: null, counts, override: null, warning }));
  assert.equal(await runOnce(run), 5);
  assert.deepEqual(recorded.mirrored, [version]);
  assert.deepEqual(await fieldsOf(root, "status", "warning"), { status: "published", warning });
  assert.match(recorded.lines.join("\n"), /\nWarning: Old versions could not be pruned: EACCES$/);
});

test("a mirror that fails exits with 1, after last.json has recorded the publication", async () => {
  const root = await temporaryRoot();
  const refused = new Error("push refused");
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "unchanged", version, counts }), {
    mirror: () => Promise.reject(refused),
  });
  assert.equal(await runOnce(run), 1);
  assert.deepEqual(recorded.errors, [refused, "The mirror failed; the run itself is recorded as unchanged."]);
  assert.deepEqual(await fieldsOf(root, "status", "exitCode"), { status: "unchanged", exitCode: 0 });
});

test("a data root that is not a directory fails with 1 before building, and writes nothing", async () => {
  const missing = dataRoot(`${await temporaryRoot()}/missing`);
  const { plan: run, recorded } = plan(missing, () => Promise.resolve({ status: "unchanged", version, counts }));
  assert.equal(await runOnce(run), 1);
  assert.equal(recorded.built, 0);
  assert.equal(await exists(missing), false);
  assert.match(String(recorded.errors[0]), /is not a directory/);
});

test("a run started while another holds the lock exits with 4 without building, and leaves last.json and the lock alone", async () => {
  const root = await temporaryRoot();
  const other = await acquireLock(root, { pid: 7, host: "cron" }, new Date("2026-11-07T04:00:00.000Z"));
  assert.equal(other.kind, "acquired");
  const { plan: run, recorded } = plan(root, () => Promise.resolve({ status: "unchanged", version, counts }));
  assert.equal(await runOnce(run), 4);
  assert.equal(recorded.built, 0);
  assert.equal(await exists(layout(root).runs), false);
  assert.deepEqual(JSON.parse(await readFile(layout(root).lock, "utf8")), { pid: 7, host: "cron", since: "2026-11-07T04:00:00.000Z" });
  assert.match(String(recorded.errors[0]), /Another run holds .*\.lock \(\{"pid":7,"host":"cron","since":"2026-11-07T04:00:00\.000Z"\}\)/);
});

test("the lock is held while the build runs and released afterwards, even when the build throws, so the next run proceeds", async () => {
  const root = await temporaryRoot();
  const heldDuringBuild: boolean[] = [];
  const { plan: failing } = plan(root, async () => {
    heldDuringBuild.push(await exists(layout(root).lock));
    throw new Error("boom");
  });
  assert.equal(await runOnce(failing), 1);
  assert.deepEqual(heldDuringBuild, [true]);
  assert.equal(await exists(layout(root).lock), false);
  const { plan: next } = plan(root, () => Promise.resolve({ status: "unchanged", version, counts }));
  assert.equal(await runOnce(next), 0);
  assert.equal(await exists(layout(root).lock), false);
  assert.deepEqual((await readdir(layout(root).v2)).filter((name) => name.startsWith(".lock")), []);
});

test("the lock handed out while the run holds it is the one held, and releasing it twice is harmless", async () => {
  const root = await temporaryRoot();
  const handed: Lock[] = [];
  const { plan: run } = plan(
    root,
    async () => {
      const [lock] = handed;
      if (lock === undefined) throw new Error("no lock handed out before the build");
      lock.release();
      assert.equal(await exists(layout(root).lock), false);
      return { status: "unchanged", version, counts };
    },
    { whileLocked: (lock) => handed.push(lock) },
  );
  assert.equal(await runOnce(run), 0);
});
