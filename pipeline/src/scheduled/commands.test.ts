import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { test } from "node:test";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { type Host, MEMORY_EVENTS, check, run, scheduled, signalStops, writableDirectory } from "./commands.ts";
import type { Fetch } from "./ntfy.ts";

const TOKEN = "tk_0123456789abcdefghij-_ABCDEFG";

// Stands for src/main.ts: how it ends is chosen by the test, through its environment.
const FAKE_PIPELINE = `
import { writeFileSync } from "node:fs";
const ending = process.env.ENDING;
if (ending === "killed") process.kill(process.pid, "SIGKILL");
if (ending === "waiting") {
  writeFileSync(process.env.LCDG_DATA_ROOT + "/started", "");
  setInterval(() => undefined, 1000);
}
`;

type Sent = { readonly url: string; readonly title: string | null };

type Recorded = { readonly errors: string[]; readonly lines: string[]; readonly sent: Sent[]; readonly priorities: number[]; readonly read: string[] };

type Ending = "exits" | "killed" | "waiting";

async function host(overrides: Partial<Host> = {}, answer: (url: string) => Response = () => Response.json({ username: "lcdg_pipeline" }), ending: Ending = "exits") {
  const dir = await temporaryDir();
  await writeFile(`${dir}/pipeline.mjs`, FAKE_PIPELINE);
  const recorded: Recorded = { errors: [], lines: [], sent: [], priorities: [], read: [] };
  const fetcher: Fetch = (url) => {
    recorded.sent.push({ url, title: new URL(url).searchParams.get("title") });
    return Promise.resolve(answer(url));
  };
  const defaults: Host = {
    env: { ...process.env, NTFY_TOKEN: TOKEN, LCDG_DATA_ROOT: dir, ENDING: ending },
    fetcher,
    sleep: () => Promise.resolve(),
    setPriority: (priority) => recorded.priorities.push(priority),
    readText: (path) => {
      recorded.read.push(path);
      return Promise.reject(new Error("ENOENT"));
    },
    signals: new EventEmitter(),
    hostname: "box",
    uid: 10002,
    pipeline: { node: process.execPath, entry: `${dir}/pipeline.mjs`, cwd: dir },
    echo: () => undefined,
    log: (line) => recorded.lines.push(line),
    error: (line) => recorded.errors.push(line),
    now: () => new Date(),
  };
  return { dir, recorded, host: { ...defaults, ...overrides } };
}

test("the scheduler starts once ntfy accepts the token as lcdg_pipeline's and the data root is a directory it can write", async () => {
  const { dir, recorded, host: ready } = await host();
  assert.equal(await check(ready), 0);
  assert.deepEqual(recorded.lines, [`Ready: data root ${dir}, alerts to ntfy as lcdg_pipeline.`]);
  assert.deepEqual(
    recorded.sent.map((s) => s.url),
    ["https://ntfy.kxv.fr/v1/account"],
  );
});

test("the scheduler does not start when ntfy refuses the token or knows it as another user's", async () => {
  for (const [answer, reason] of [
    [() => new Response("", { status: 401 }), "https://ntfy.kxv.fr/v1/account answered HTTP 401"],
    [() => Response.json({ username: "lcdg" }), 'the token belongs to "lcdg", not to lcdg_pipeline'],
  ] as const) {
    const { recorded, host: refused } = await host({}, answer);
    assert.equal(await check(refused), 78, reason);
    assert.deepEqual([recorded.errors, recorded.lines], [[`ntfy refuses NTFY_TOKEN: ${reason}`], []]);
  }
});

test("only a directory the user can write is a data root: neither a writable file nor a read-only folder", async () => {
  const dir = await temporaryDir();
  await writeFile(`${dir}/file`, "");
  await mkdir(`${dir}/read-only`, { mode: 0o555 });
  assert.deepEqual(await Promise.all([dir, `${dir}/file`, `${dir}/read-only`, `${dir}/missing`].map(writableDirectory)), [true, false, false, false]);
  await chmod(`${dir}/read-only`, 0o755);
  const { recorded, host: onAFile } = await host();
  assert.equal(await check({ ...onAFile, env: { ...onAFile.env, LCDG_DATA_ROOT: `${dir}/file` } }), 78);
  assert.deepEqual(recorded.errors, [`The data root ${dir}/file is not a directory this user (uid 10002) can write.`]);
  assert.deepEqual(recorded.sent, []);
});

test("a run lowers its priority to the lowest before the pipeline starts, and goes on at its own when it may not", async () => {
  const { recorded, host: lowered } = await host();
  assert.equal(await run([], lowered), 0);
  assert.deepEqual(recorded.priorities, [19]);
  const { recorded: kept, host: refused } = await host({
    setPriority: () => {
      throw new Error("EACCES");
    },
  });
  assert.equal(await run([], refused), 0);
  assert.deepEqual(kept.errors.slice(0, 1), ["The run keeps its priority: EACCES"]);
  assert.equal(kept.sent.length, 1);
});

test("an out-of-memory kill is read from cgroup v2's memory.events, and an unreadable one says nothing of memory", async () => {
  const counts = ["oom_kill 0\n", "oom_kill 1\n"];
  const { recorded, host: limited } = await host(
    {
      readText: (path) => {
        recorded.read.push(path);
        return Promise.resolve(counts.shift() ?? "");
      },
    },
    undefined,
    "killed",
  );
  assert.equal(await run([], limited), 137);
  assert.deepEqual(recorded.read, [MEMORY_EVENTS, MEMORY_EVENTS]);
  assert.equal(MEMORY_EVENTS, "/sys/fs/cgroup/memory.events");
  assert.deepEqual(
    recorded.sent.map((s) => s.title),
    ["Run killed: out of memory"],
  );
  const { recorded: unknown, host: unlimited } = await host({}, undefined, "killed");
  assert.equal(await run([], unlimited), 137);
  assert.deepEqual(
    unknown.sent.map((s) => s.title),
    ["Run killed by SIGKILL"],
  );
});

const present = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

test("SIGINT and SIGTERM sent to the run are passed to the pipeline, and no longer listened to once it ended", async () => {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const signals = new EventEmitter();
    const { dir, recorded, host: stoppable } = await host({ signals }, undefined, "waiting");
    const stopping = (async () => {
      const deadline = performance.now() + 20_000;
    while (!(await present(`${dir}/started`)) && performance.now() < deadline) await sleep(20);
      signals.emit(signal, signal);
    })();
    const code = await run([], stoppable);
    await stopping;
    assert.equal(code, signal === "SIGINT" ? 130 : 143);
    assert.deepEqual(
      recorded.sent.map((s) => s.title),
      [`Run killed by ${signal}`],
    );
    assert.deepEqual([signals.listenerCount("SIGINT"), signals.listenerCount("SIGTERM")], [0, 0]);
  }
  const signals = new EventEmitter();
  const stops = signalStops(signals);
  const heard: string[] = [];
  const unsubscribe = stops.subscribe((signal) => heard.push(signal));
  signals.emit("SIGHUP", "SIGHUP");
  signals.emit("SIGTERM", "SIGTERM");
  unsubscribe();
  signals.emit("SIGTERM", "SIGTERM");
  assert.deepEqual(heard, ["SIGTERM"]);
});

test("check and run are the only commands", async () => {
  const { recorded, host: any } = await host();
  assert.equal(await scheduled(["publish"], any), 2);
  assert.equal(await scheduled([], any), 2);
  assert.equal(await scheduled(["check"], any), 0);
  assert.equal(await scheduled(["run", "--skip-new-cutouts"], any), 0);
  assert.match(recorded.errors.join("\n"), /^usage: node src\/scheduled\/main\.ts check \| run \[pipeline options\]\n {2}check {2}exits 0 once/);
});

test("without an ntfy token neither check nor run goes further, and both say how to get one", async () => {
  for (const NTFY_TOKEN of [undefined, "", "tk_short"]) {
    const { recorded, host: tokenless } = await host();
    const env = { ...tokenless.env, NTFY_TOKEN };
    assert.equal(await check({ ...tokenless, env }), 78);
    assert.equal(await run([], { ...tokenless, env }), 78);
    assert.deepEqual(recorded.errors, [
      "NTFY_TOKEN holds no ntfy token: without it no alert would go out. Run add-publisher.sh lcdg_pipeline on the Mac, then deploy with og/deploy/deploy.sh.",
      "NTFY_TOKEN holds no ntfy token: without it no alert would go out. Run add-publisher.sh lcdg_pipeline on the Mac, then deploy with og/deploy/deploy.sh.",
    ]);
    assert.deepEqual([recorded.sent, recorded.priorities], [[], []]);
  }
});

test("a run of a single job or with an unknown option is refused with the usage, before the priority or the pipeline", async () => {
  const { recorded, host: any } = await host();
  assert.equal(await run(["photos"], any), 2);
  assert.equal(await run(["--branch", "main"], any), 2);
  assert.equal(recorded.errors.length, 2);
  assert.match(recorded.errors[0] ?? "", /^photos: a single job publishes nothing; run it with npm run pipeline\nusage: node src\/scheduled\/main\.ts/);
  assert.match(recorded.errors[1] ?? "", /^Unknown option '--branch'.*\nusage: node src\/scheduled\/main\.ts/s);
  assert.deepEqual([recorded.sent, recorded.priorities], [[], []]);
});

test("a data root the scheduler cannot write names the user's uid, or a question mark where there is none", async () => {
  const { dir, recorded, host: uidless } = await host({ uid: null });
  assert.equal(await check({ ...uidless, env: { ...uidless.env, LCDG_DATA_ROOT: `${dir}/missing` } }), 78);
  assert.deepEqual(recorded.errors, [`The data root ${dir}/missing is not a directory this user (uid ?) can write.`]);
});
