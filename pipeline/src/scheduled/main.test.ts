import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { text } from "node:stream/consumers";
import { test } from "node:test";
import { temporaryRoot } from "../publication/snapshots.fixture.ts";

const MAIN = new URL("main.ts", import.meta.url).pathname;
const TOKEN = "tk_0123456789abcdefghij-_ABCDEFG";

async function scheduled(args: readonly string[], env: Readonly<Record<string, string>>): Promise<{ readonly code: number | null; readonly stderr: string }> {
  const { NTFY_TOKEN: _, LCDG_DATA_ROOT: __, ...inherited } = process.env;
  const child = spawn(process.execPath, [MAIN, ...args], { env: { ...inherited, ...env }, stdio: ["ignore", "ignore", "pipe"] });
  const [code, stderr] = await Promise.all([new Promise<number | null>((resolve) => child.on("close", resolve)), text(child.stderr)]);
  return { code, stderr };
}

test("without an ntfy token the scheduler refuses to start and a run refuses to begin, saying how to get one", async () => {
  const root = await temporaryRoot();
  for (const NTFY_TOKEN of [undefined, "", "not-a-token"]) {
    const env = { LCDG_DATA_ROOT: root, ...(NTFY_TOKEN === undefined ? {} : { NTFY_TOKEN }) };
    for (const args of [["check"], ["run"], ["run", "--skip-new-cutouts"]]) {
      const { code, stderr } = await scheduled(args, env);
      assert.equal(code, 78, `${args.join(" ")} with ${String(NTFY_TOKEN)}`);
      assert.match(stderr, /NTFY_TOKEN holds no ntfy token: without it no alert would go out\. Run add-publisher\.sh lcdg_pipeline/);
    }
  }
  assert.deepEqual(await readdir(root), []);
});

test("the scheduler refuses to start on a data root it cannot write, before asking ntfy anything", async () => {
  const root = `${await temporaryRoot()}/missing`;
  const { code, stderr } = await scheduled(["check"], { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN });
  assert.equal(code, 78);
  assert.match(stderr, new RegExp(`The data root ${root} is not a directory this user \\(uid \\d+\\) can write\\.`));
});

test("a run with a single job or an unknown option, or an unknown command, is refused before anything runs", async () => {
  const root = await temporaryRoot();
  for (const [args, message] of [
    [["run", "photos"], /photos: a single job publishes nothing/],
    [["run", "--branch", "main"], /Unknown option '--branch'/],
    [["publish"], /^usage: node src\/scheduled\/main\.ts check \| run/],
    [[], /^usage:/],
  ] as const) {
    const { code, stderr } = await scheduled(args, { LCDG_DATA_ROOT: root, NTFY_TOKEN: TOKEN });
    assert.equal(code, 2, args.join(" "));
    assert.match(stderr, message, args.join(" "));
  }
  assert.deepEqual(await readdir(root), []);
});
