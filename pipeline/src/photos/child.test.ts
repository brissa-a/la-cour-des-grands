import assert from "node:assert/strict";
import { test } from "node:test";
import { temporaryDir } from "../publication/snapshots.fixture.ts";
import { children } from "./child.ts";

const processes = children();
const node = (script: string, timeoutMs = 30_000) => processes.run({ file: process.execPath, args: ["--input-type=module", "-e", script], timeoutMs });

test("a cutout whose process ends with 0 is done", async () => {
  assert.deepEqual(await node("process.exit(0)"), { kind: "done" });
});

test("a cutout whose process fails gives the last line of its error output, or its exit code when it said nothing", async () => {
  assert.deepEqual(await node(`process.stderr.write("loading the model\\nmodel loaded\\nInput file is missing: x.jpg\\n\\n"); process.exit(1)`), {
    kind: "failed",
    reason: "Input file is missing: x.jpg",
  });
  assert.deepEqual(await node("process.exit(3)"), { kind: "failed", reason: "exited with 3" });
});

test("a cutout whose process prints a lot still ends", async () => {
  assert.deepEqual(await node(`process.stdout.write("x".repeat(1024 * 1024)); process.stderr.write("y".repeat(1024 * 1024))`, 10_000), { kind: "done" });
});

test("a cutout whose process the kernel kills leaves the pipeline running and is said to have lacked memory", async () => {
  assert.deepEqual(await node(`process.kill(process.pid, "SIGKILL")`), { kind: "failed", reason: "killed by SIGKILL, most likely for lack of memory" });
  assert.deepEqual(await node(`process.kill(process.pid, "SIGTERM")`), { kind: "failed", reason: "killed by SIGTERM" });
});

test("a cutout past its time is killed and said so", async () => {
  const started = performance.now();
  assert.deepEqual(await node("setInterval(() => undefined, 1000)", 300), { kind: "failed", reason: "took more than 0.3 s, killed" });
  assert.ok(performance.now() - started < 10_000);
});

test("a cutout whose process cannot start is a failure saying why", async () => {
  const missing = `${await temporaryDir()}/node`;
  assert.deepEqual(await processes.run({ file: missing, args: [], timeoutMs: 30_000 }), { kind: "failed", reason: `could not start: spawn ${missing} ENOENT` });
});

test("cutouts stopped with the pipeline are killed at once, all of them", async () => {
  const stopping = children();
  const forever = { file: process.execPath, args: ["--input-type=module", "-e", "setInterval(() => undefined, 1000)"], timeoutMs: 30_000 };
  const attempts = [stopping.run(forever), stopping.run(forever)];
  await new Promise((resolve) => setTimeout(resolve, 300));
  const started = performance.now();
  stopping.stop();
  assert.deepEqual(await Promise.all(attempts), [
    { kind: "failed", reason: "stopped with the pipeline" },
    { kind: "failed", reason: "stopped with the pipeline" },
  ]);
  assert.ok(performance.now() - started < 5_000);
});
