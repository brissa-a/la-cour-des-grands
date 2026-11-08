import assert from "node:assert/strict"
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

const STOP_RUN = new URL("../deploy/stopRun.ts", import.meta.url)
const GONE = 99_999_999

const scratch = await mkdtemp(join(tmpdir(), "og-stop-run-"))
after(() => rm(scratch, { recursive: true, force: true }))

function idle(): ChildProcess {
  return spawn(process.execPath, ["-e", "setInterval(() => undefined, 1000)"], { stdio: "ignore" })
}

function pidOf(child: ChildProcess): number {
  assert.ok(child.pid !== undefined, "the process started")
  return child.pid
}

function alive(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

async function listed(proc: string, pid: number | string, args: readonly string[] | null): Promise<void> {
  await mkdir(join(proc, String(pid)), { recursive: true })
  if (args !== null) await writeFile(join(proc, String(pid), "cmdline"), args.map(arg => `${arg}\0`).join(""))
}

test("the stop deploy.sh sends to the scheduler ends a run's wrapper by SIGTERM, and leaves the other processes and those already gone alone", { timeout: 20_000 }, async () => {
  const [wrapper, check, shell] = [idle(), idle(), idle()]
  try {
    const proc = join(scratch, "proc")
    await listed(proc, pidOf(wrapper), ["node", "src/scheduled/main.ts", "run"])
    await listed(proc, pidOf(check), ["node", "src/scheduled/main.ts", "check"])
    await listed(proc, pidOf(shell), ["sh", "-c", "node src/scheduled/main.ts run"])
    await listed(proc, GONE, ["node", "src/scheduled/main.ts", "run"])
    await listed(proc, 4242, null)
    await listed(proc, "self", ["node", "src/scheduled/main.ts", "run"])
    const ended = once(wrapper, "exit")
    const stop = spawnSync(process.execPath, ["--input-type=module-typescript", "-", proc], { input: await readFile(STOP_RUN), encoding: "utf8" })
    assert.deepEqual([stop.status, stop.stderr, stop.stdout], [0, "", "Stopped the pipeline run in progress (node src/scheduled/main.ts run): an alert follows; run it again once deployed.\n"])
    assert.deepEqual(await ended, [null, "SIGTERM"])
    assert.deepEqual([alive(check), alive(shell)], [true, true])
  } finally {
    for (const child of [wrapper, check, shell]) child.kill("SIGKILL")
  }
})

test("the stop fails when the kernel refuses to signal a run's wrapper: only a process already gone is passed over",{ timeout: 20_000 }, async () => {
  const proc = join(scratch, "proc-refused")
  await listed(proc, GONE, ["node", "src/scheduled/main.ts", "run"])
  const refused = `process.kill = () => { throw Object.assign(new Error("kill EPERM"), { code: "EPERM", errno: -1, syscall: "kill" }) }`
  const stop = spawnSync(process.execPath, ["--import", `data:text/javascript,${encodeURIComponent(refused)}`, "--input-type=module-typescript", "-", proc], { input: await readFile(STOP_RUN), encoding: "utf8" })
  assert.equal(stop.status, 1)
  assert.match(stop.stderr, /EPERM/)
  assert.equal(stop.stdout, "")
})
