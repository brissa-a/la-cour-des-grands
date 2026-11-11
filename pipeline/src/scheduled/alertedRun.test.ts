import assert from "node:assert/strict";
import { access, chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { layout } from "../publication/paths.ts";
import { temporaryDir, temporaryRoot } from "../publication/snapshots.fixture.ts";
import { EventEmitter } from "node:events";
import { alertedRun } from "./alertedRun.ts";
import { type Fetch, ntfyToken } from "./ntfy.ts";
import type { Stops } from "./supervise.ts";

const TOKEN = "tk_0123456789abcdefghij-_ABCDEFG";
const VERSION = "6a64dfbf2449e4c8357bc0319b9fe0b747c577d9";

// Stands for src/main.ts: what it writes and how it ends are those of the pipeline, chosen by the scenario.
const FAKE_PIPELINE = `
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
const [scenario] = process.argv.slice(2);
const v2 = process.env.LCDG_DATA_ROOT + "/v2";
const summary = (fields) => writeFileSync(v2 + "/.runs/last.json", JSON.stringify({ startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), ...fields }));
const lock = (pid, host = hostname()) => writeFileSync(v2 + "/.lock", JSON.stringify({ pid, host, since: "2026-11-07T03:30:00.000Z" }) + "\\n");
mkdirSync(v2 + "/.runs", { recursive: true });
process.stderr.write("token seen by the pipeline: " + process.env.NTFY_TOKEN + "\\n");
switch (scenario) {
  case "published":
    summary({ status: "published", exitCode: 0, version: "${VERSION}", previousVersion: null, forced: false, counts: { deputies: 654, votes: 9759, newVotes: null }, refusals: [], warning: null, cutouts: { failed: [], waiting: 0 }, unseated: [], error: null });
    process.stdout.write("Published ${VERSION}\\n");
    process.exit(0);
  case "oom":
    lock(process.pid);
    process.stderr.write("  25/40\\n");
    process.kill(process.pid, "SIGKILL");
    break;
  case "killed-under-another-lock":
    lock(process.pid + 1);
    process.kill(process.pid, "SIGKILL");
    break;
  case "killed-under-a-lock-of-another-host":
    lock(process.pid, "elsewhere");
    process.kill(process.pid, "SIGKILL");
    break;
  case "killed-in-a-read-only-root":
    lock(process.pid);
    chmodSync(v2, 0o555);
    process.kill(process.pid, "SIGKILL");
    break;
  case "killed-without-a-lock":
    process.kill(process.pid, "SIGKILL");
    break;
  case "crashed-holding-its-lock":
    lock(process.pid);
    process.exit(7);
  case "locked":
    process.exit(4);
  case "silent-failure":
    process.exit(1);
  case "interrupted":
    process.on("SIGTERM", () => {
      process.stderr.write("interrupted\\n");
      process.exit(143);
    });
    writeFileSync(v2 + "/ready", "");
    setInterval(() => undefined, 1000);
}
`;

const fakeFile = (async () => {
  const dir = await temporaryDir();
  await writeFile(`${dir}/pipeline.mjs`, FAKE_PIPELINE);
  return `${dir}/pipeline.mjs`;
})();

type Sent = { readonly url: string; readonly body: string };

function token() {
  const parsed = ntfyToken(TOKEN);
  assert.ok(parsed !== null);
  return parsed;
}

async function scenario(name: string, memoryEvents: readonly (string | null)[] = ["oom_kill 0\n"], before: (v2: string) => Promise<void> = () => Promise.resolve()) {
  const root = await temporaryRoot();
  const { v2 } = layout(root);
  await mkdir(`${v2}/.runs`, { recursive: true });
  await before(v2);
  const sent: Sent[] = [];
  const fetcher: Fetch = (url, init) => {
    sent.push({ url, body: typeof init.body === "string" ? init.body : "" });
    return Promise.resolve(new Response("{}"));
  };
  const echoed: Buffer[] = [];
  let read = 0;
  const code = await alertedRun({
    pipeline: { file: process.execPath, args: [await fakeFile, name], cwd: v2, env: { ...process.env, LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN } },
    root,
    token: token(),
    ntfy: { fetcher, sleep: () => Promise.resolve(), log: () => undefined },
    memoryEvents: () => Promise.resolve(memoryEvents[Math.min(read++, memoryEvents.length - 1)] ?? null),
    host: hostname(),
    stops: NO_STOP,
    echo: (chunk) => echoed.push(chunk),
    now: () => new Date(),
  });
  const [notification, ...more] = sent;
  assert.ok(notification !== undefined && more.length === 0, `one notification, got ${sent.length}`);
  const url = new URL(notification.url);
  return { code, v2, topic: url.pathname, title: url.searchParams.get("title"), priority: url.searchParams.get("priority"), body: notification.body, stderr: Buffer.concat(echoed).toString() };
}

const NO_STOP: Stops = { subscribe: () => () => undefined };

function stopsOf(emitter: EventEmitter): Stops {
  return {
    subscribe: (stop) => {
      emitter.on("stop", stop);
      return () => emitter.off("stop", stop);
    },
  };
}

const present = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test("a run that publishes sends its quiet summary and exits as the pipeline did, the pipeline's error output passed through but never holding the token", async () => {
  const run = await scenario("published");
  assert.deepEqual([run.code, run.topic, run.priority, run.title], [0, "/lcdg_pipeline-done", "2", "Data published"]);
  assert.equal(run.body, `Version ${VERSION} (654 deputies, 9759 votes).\nFirst version of the data root.`);
  assert.equal(run.stderr, "token seen by the pipeline: undefined\n");
});

test("a pipeline the kernel kills for memory is reported as such, with the end of its error output, and the lock it left is freed", async () => {
  const run = await scenario("oom", ["oom_kill 2\n", "oom_kill 3\n"]);
  assert.deepEqual([run.code, run.topic, run.priority, run.title], [137, "/lcdg_pipeline-failed", "4", "Run killed: out of memory"]);
  assert.match(run.body, /It recorded no run: no \/.+\/v2\/\.runs\/last\.json\.\nIts lock .+\/v2\/\.lock, held by no process any more, was released/);
  assert.match(run.body, /Last lines of its error output:\ntoken seen by the pipeline: undefined\n {2}25\/40$/);
  assert.equal(await present(`${run.v2}/.lock`), false);
});

test("a killed pipeline whose oom_kill count did not move, or cannot be read, is reported killed by its signal", async () => {
  const steady = await scenario("oom", ["oom_kill 3\n"]);
  assert.deepEqual([steady.code, steady.title], [137, "Run killed by SIGKILL"]);
  const unknown = await scenario("oom", []);
  assert.deepEqual([unknown.code, unknown.title], [137, "Run killed by SIGKILL"]);
});

test("a lock that names another process, or this one on another host, stays, even after a kill", async () => {
  for (const name of ["killed-under-another-lock", "killed-under-a-lock-of-another-host"]) {
    const run = await scenario(name);
    assert.equal(run.code, 137, name);
    assert.doesNotMatch(run.body, /released/, name);
    assert.equal(await present(`${run.v2}/.lock`), true, name);
  }
});

test("a lock the pipeline left behind, however it ended, is freed and said so only once it is gone", async () => {
  const crashed = await scenario("crashed-holding-its-lock");
  assert.deepEqual([crashed.code, crashed.title], [7, "Run failed (exit 7)"]);
  assert.match(crashed.body, /was released: the next run will start/);
  assert.equal(await present(`${crashed.v2}/.lock`), false);
  const stuck = await scenario("killed-in-a-read-only-root");
  await chmod(stuck.v2, 0o755);
  assert.doesNotMatch(stuck.body, /released/);
  assert.equal(await present(`${stuck.v2}/.lock`), true);
  const lockless = await scenario("killed-without-a-lock");
  assert.deepEqual([lockless.code, lockless.title], [137, "Run killed by SIGKILL"]);
  assert.doesNotMatch(lockless.body, /released/);
});

test("an oom_kill count unknown before the run says nothing of memory, whatever it reads after", async () => {
  const run = await scenario("oom", [null, "oom_kill 1\n"]);
  assert.equal(run.title, "Run killed by SIGKILL");
});

test("a run refused by the lock names its holder and leaves the lock alone", async () => {
  const holder = JSON.stringify({ pid: 7, host: "3f2a9c1b7d0e", since: "2026-11-06T03:30:00.000Z" });
  const run = await scenario("locked", undefined, (v2) => writeFile(`${v2}/.lock`, holder));
  assert.deepEqual([run.code, run.topic, run.priority], [4, "/lcdg_pipeline-locked", "3"]);
  assert.match(run.body, /\/v2\/\.lock: held by pid 7 on 3f2a9c1b7d0e since 2026-11-06T03:30:00\.000Z\./);
  assert.equal(await readFile(`${run.v2}/.lock`, "utf8"), holder);
  const garbled = await scenario("locked", undefined, (v2) => writeFile(`${v2}/.lock`, "  pid 7\n"));
  assert.match(garbled.body, /\/v2\/\.lock: pid 7\.\n/);
});

test("a failure that leaves only an older, unreadable or malformed run summary is not taken for a run", async () => {
  const older = JSON.stringify({ startedAt: "2026-11-06T03:30:00.000Z", status: "unchanged", version: VERSION, counts: { deputies: 654, votes: 9759, newVotes: 0 }, cutouts: null, unseated: null });
  const run = await scenario("silent-failure", undefined, (v2) => writeFile(`${v2}/.runs/last.json`, older));
  assert.deepEqual([run.code, run.topic, run.title], [1, "/lcdg_pipeline-failed", "Run failed (exit 1)"]);
  assert.match(run.body, /It recorded no run: .+\/last\.json is from an earlier run, started 2026-11-06T03:30:00\.000Z\./);
  const folder = await scenario("silent-failure", undefined, (v2) => mkdir(`${v2}/.runs/last.json`));
  assert.match(folder.body, /It recorded no run: .+\/last\.json is unreadable: EISDIR/);
  const malformed = await scenario("silent-failure", undefined, (v2) => writeFile(`${v2}/.runs/last.json`, "{}"));
  assert.match(malformed.body, /It recorded no run: .+\/last\.json is not a run summary: startedAt is not a string\./);
});

test("a stop asked of the run is passed to the pipeline, whose interrupted end is reported", async () => {
  const root = await temporaryRoot();
  const stops = new EventEmitter();
  const stopping = (async () => {
    while (!(await present(`${root}/v2/ready`))) await sleep(20);
    stops.emit("stop", "SIGTERM");
  })();
  const sent: string[] = [];
  const code = await alertedRun({
    pipeline: { file: process.execPath, args: [await fakeFile, "interrupted"], cwd: root, env: { ...process.env, LCDG_DATA_ROOT: root } },
    root,
    token: token(),
    ntfy: { fetcher: (url) => (sent.push(new URL(url).searchParams.get("title") ?? ""), Promise.resolve(new Response("{}"))), sleep: () => Promise.resolve(), log: () => undefined },
    memoryEvents: () => Promise.resolve(null),
    host: hostname(),
    stops: stopsOf(stops),
    echo: () => undefined,
    now: () => new Date(),
  });
  await stopping;
  assert.deepEqual([code, sent], [143, ["Run failed (exit 143)"]]);
  assert.equal(stops.listenerCount("stop"), 0);
});

test("a pipeline that cannot start is reported, and the run exits with 1", async () => {
  const root = await temporaryRoot();
  const sent: string[] = [];
  const code = await alertedRun({
    pipeline: { file: `${await temporaryDir()}/missing-node`, args: [], cwd: root, env: {} },
    root,
    token: token(),
    ntfy: { fetcher: (url) => (sent.push(new URL(url).searchParams.get("title") ?? ""), Promise.resolve(new Response("{}"))), sleep: () => Promise.resolve(), log: () => undefined },
    memoryEvents: () => Promise.resolve(null),
    host: hostname(),
    stops: NO_STOP,
    echo: () => undefined,
    now: () => new Date(),
  });
  assert.deepEqual([code, sent], [1, ["Run not started"]]);
});
