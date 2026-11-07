import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { text } from "node:stream/consumers";
import { test } from "node:test";
import { type Supervised, supervise } from "./supervise.ts";

const SUPERVISE = new URL("supervise.ts", import.meta.url).href;
const MEGABYTE = 1024 * 1024;
const NO_STOP = { subscribe: () => () => undefined };

const writer = (stream: "stdout" | "stderr", bytes: number) => ["-e", `process.${stream}.write("x".repeat(${bytes - 1}) + "y")`];

test("the pipeline's standard output reaches the run's own, however much it writes, and the pipeline ends", async () => {
  const run = spawn(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { supervise } from ${JSON.stringify(SUPERVISE)};
const { exit } = await supervise({ file: process.execPath, args: ${JSON.stringify(writer("stdout", MEGABYTE))}, cwd: process.cwd(), env: process.env }, { subscribe: () => () => undefined }, () => undefined);
process.stderr.write(JSON.stringify(exit));`,
    ],
    { stdio: ["ignore", "pipe", "pipe"], signal: AbortSignal.timeout(20_000) },
  );
  run.on("error", () => undefined);
  const [stdout, stderr] = await Promise.all([text(run.stdout), text(run.stderr)]);
  assert.equal(stderr, JSON.stringify({ kind: "code", code: 0 }));
  assert.equal(stdout.length, MEGABYTE);
  assert.ok(stdout.endsWith("xy"));
});

test("the error output kept for the alert is its last 16 KiB, while all of it is passed through", async () => {
  const echoed: Buffer[] = [];
  const supervised: Supervised = await supervise({ file: process.execPath, args: writer("stderr", MEGABYTE), cwd: process.cwd(), env: process.env }, NO_STOP, (chunk) =>
    echoed.push(chunk),
  );
  assert.deepEqual(supervised.exit, { kind: "code", code: 0 });
  assert.equal(Buffer.concat(echoed).length, MEGABYTE);
  assert.equal(supervised.stderr, "x".repeat(16 * 1024 - 1) + "y");
});
