import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
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

test("the deploy check passes on a version whose mandates or seats do not read, and logs that its drawing is unknown", async () => {
  const badMandate = join(scratch, "bad-mandate")
  await cp(DATA_ROOT, badMandate, { recursive: true })
  const init = join(badMandate, "v2", VERSION, "deputies", "init.csv")
  await writeFile(init, (await readFile(init, "utf8")).replace(",2024-07-08/2025-11-12,", ",2025-11-12/2024-07-08,"))
  const noSeats = join(scratch, "no-seats")
  await cp(DATA_ROOT, noSeats, { recursive: true })
  await rm(join(noSeats, "v2", VERSION, "seats", "hemicycle.csv"))
  for (const [root, reason] of [
    [badMandate, 'deputies/init.csv: PA1327 has mandate period "2025-11-12/2024-07-08"'],
    [noSeats, `seats/hemicycle.csv: not in the data version ${VERSION}`],
  ] as const) {
    const { code, stdout, stderr } = await checkData(root)
    assert.deepEqual([code, parsed(stdout), stderr.trim().split("\n").map(parsed)], [0, { dataRoot: root, version: VERSION, pointed: VERSION }, [{ event: "release", version: VERSION }, { event: "drawing-unknown", version: VERSION, reason }]])
  }
})
