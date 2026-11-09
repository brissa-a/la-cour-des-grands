import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { text } from "node:stream/consumers"
import { after, test } from "node:test"
import { DATA_ROOT, VERSION } from "./dataRoot.ts"

const scratch = await mkdtemp(join(tmpdir(), "server-check-data-"))
after(() => rm(scratch, { recursive: true, force: true }))

const UNLOADABLE = "b".repeat(40)

async function checkData(root: string, ...args: string[]): Promise<{ readonly code: number | null; readonly stdout: string; readonly stderr: string }> {
  const child = spawn(process.execPath, [new URL("../src/checkData.ts", import.meta.url).pathname, ...args], { env: { ...process.env, LCDG_DATA_ROOT: root }, stdio: ["ignore", "pipe", "pipe"] })
  const [code, stdout, stderr] = await Promise.all([new Promise<number | null>(resolve => child.on("close", resolve)), text(child.stdout), text(child.stderr)])
  return { code, stdout, stderr }
}

const parsed = (output: string): unknown => JSON.parse(output)

test("the deploy check passes on a data root whose pointer names a version that loads, and names it", async () => {
  const { code, stdout } = await checkData(DATA_ROOT)
  assert.deepEqual([code, parsed(stdout)], [0, { dataRoot: DATA_ROOT, version: VERSION, pointed: VERSION }])
})

test("the deploy check fails on a data root whose pointer names a version that does not load, even though it keeps one that does, and names both", async () => {
  const root = join(scratch, "pointing-elsewhere")
  await cp(DATA_ROOT, root, { recursive: true })
  await writeFile(join(root, "v2", "current.json"), JSON.stringify({ version: UNLOADABLE, publishedAt: "2026-11-07T04:00:00.000Z" }))
  const refused = await checkData(root)
  assert.deepEqual([refused.code, refused.stdout, parsed(refused.stderr.trim().split("\n").at(-1) ?? "")], [1, "", { event: "older-version", dataRoot: root, version: VERSION, pointed: UNLOADABLE, override: "--allow-older-version" }])
  const allowed = await checkData(root, "--allow-older-version")
  assert.deepEqual([allowed.code, parsed(allowed.stdout)], [0, { dataRoot: root, version: VERSION, pointed: UNLOADABLE }])
})

test("the deploy check refuses an option it does not know", async () => {
  const { code, stdout, stderr } = await checkData(DATA_ROOT, "--allow-older")
  assert.deepEqual([code, stdout], [1, ""])
  assert.match(stderr, /Unknown option '--allow-older'/)
})

test("the deploy check fails on an empty data root", async () => {
  const { code, stdout, stderr } = await checkData(await mkdtemp(join(scratch, "empty-")))
  assert.deepEqual([code, stdout], [1, ""])
  assert.match(stderr, /"event":"no-version"/)
})
