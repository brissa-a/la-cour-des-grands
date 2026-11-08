import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"

const DEPLOY = new URL("../deploy/deploy.sh", import.meta.url).pathname
const STOP_RUN = await readFile(new URL("../deploy/stopRun.ts", import.meta.url), "utf8")
const TOKEN = "tk_not_a_real_token"

// The box as the fake docker answers it: the data volume, and the scheduler's container against what compose would make of it now.
type Box = {
  readonly volume: "absent" | "empty" | "holding a version"
  readonly scheduler: "absent" | "stopped, changed" | "running, unchanged" | "running, changed" | "running, image rebuilt"
}

type Call = { readonly tool: string; readonly args: readonly string[]; readonly token: string | null; readonly stdin: string }

const scratch = await mkdtemp(join(tmpdir(), "og-deploy-"))
after(() => rm(scratch, { recursive: true, force: true }))

const FAKE_DOCKER = `#!/usr/bin/env node
const { appendFileSync, readFileSync } = require("node:fs")
const args = process.argv.slice(2)
const stdin = readFileSync(0, "utf8")
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: "docker", args, token: process.env.NTFY_TOKEN ?? null, stdin }) + "\\n")
const line = args.join(" ")
const volume = process.env.FAKE_VOLUME
const scheduler = process.env.FAKE_SCHEDULER
if (line.includes("volume inspect")) process.exit(volume === "absent" ? 1 : 0)
if (line.includes("test -f /data/v2/current.json")) process.exit(volume === "holding a version" ? 0 : 1)
if (line.includes("config --hash lcdg-pipeline")) console.log("lcdg-pipeline hash-next")
if (line.includes("image inspect")) console.log("sha256:image-next")
if (line.includes("inspect --format") && line.endsWith("lcdg-lcdg-pipeline-1")) {
  if (scheduler === "absent") process.exit(1)
  const running = scheduler.startsWith("running") ? "true" : "false"
  const hash = scheduler.endsWith(", changed") ? "hash-before" : "hash-next"
  const image = scheduler.endsWith("rebuilt") ? "sha256:image-before" : "sha256:image-next"
  console.log(running + " " + hash + " " + image)
}
`

const FAKE_TOOL = (tool: string, output: string) => `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: "${tool}", args, token: process.env.NTFY_TOKEN ?? null, stdin: "" }) + "\\n")
if ("${tool}" !== "git" || args.includes("rev-parse")) process.stdout.write(${JSON.stringify(output)})
`

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string")
}

function callOf(line: string): Call {
  const parsed: unknown = JSON.parse(line)
  assert.ok(typeof parsed === "object" && parsed !== null && "tool" in parsed && "args" in parsed && "token" in parsed && "stdin" in parsed, line)
  const { tool, args, token, stdin } = parsed
  assert.ok(typeof tool === "string" && isStrings(args) && (token === null || typeof token === "string") && typeof stdin === "string", line)
  return { tool, args, token, stdin }
}

async function deploy(box: Box, env: Readonly<Record<string, string>> = {}): Promise<{ readonly status: number | null; readonly stderr: string; readonly calls: readonly Call[] }> {
  const run = await mkdtemp(join(scratch, "run-"))
  const bin = join(run, "bin")
  await mkdir(bin)
  await mkdir(join(run, "home", ".config", "ntfy"), { recursive: true })
  await writeFile(join(run, "home", ".config", "ntfy", "lcdg_pipeline-token"), TOKEN)
  const tools = { docker: FAKE_DOCKER, npm: FAKE_TOOL("npm", ""), curl: FAKE_TOOL("curl", '{"status":"ok","data":"ready"}'), git: FAKE_TOOL("git", "0123456789ab\n") }
  for (const [name, script] of Object.entries(tools)) {
    await writeFile(join(bin, name), script)
    await chmod(join(bin, name), 0o755)
  }
  const log = join(run, "calls.jsonl")
  await writeFile(log, "")
  const child = spawn(DEPLOY, [], {
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: join(run, "home"), FAKE_LOG: log, FAKE_VOLUME: box.volume, FAKE_SCHEDULER: box.scheduler, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
  const status = await new Promise<number | null>(resolve => child.once("close", resolve))
  const calls = (await readFile(log, "utf8")).split("\n").filter(Boolean).map(callOf)
  return { status, stderr, calls }
}

function lines(calls: readonly Call[]): string[] {
  return calls.filter(call => call.tool === "docker").map(call => call.args.join(" "))
}

function at(calls: readonly Call[], part: string): number {
  const index = lines(calls).findIndex(line => line.includes(part))
  assert.notEqual(index, -1, `a docker call with ${part}`)
  return index
}

const FIRST: Box = { volume: "absent", scheduler: "absent" }
const AGAIN: Box = { volume: "holding a version", scheduler: "running, unchanged" }
const STOP = "exec -i lcdg-lcdg-pipeline-1 node --input-type=module-typescript -"
const SCHEDULER_UP = "up --detach --no-build --wait lcdg-pipeline"

test("a first deploy naming no cutouts stops once the images are built, before it creates the volume or starts anything, unless LCDG_CUTOUTS_ON_BOX=1", { timeout: 60_000 }, async () => {
  for (const env of [{}, { LCDG_CUTOUTS_ON_BOX: "0" }, { LCDG_CUTOUTS_ON_BOX: "true" }, { LCDG_CUTOUTS_ON_BOX: "" }]) {
    const refused = await deploy(FIRST, env)
    assert.equal(refused.status, 1, JSON.stringify(env))
    assert.match(refused.stderr, /holds no data version, and LCDG_PHOTOS_FROM names no cutouts/)
    at(refused.calls, "docker-compose.yml build")
    assert.deepEqual(lines(refused.calls).filter(line => /volume create| up |run --rm --no-TTY| exec /.test(line)), [], JSON.stringify(env))
  }
  const accepted = await deploy(FIRST, { LCDG_CUTOUTS_ON_BOX: "1" })
  assert.equal(accepted.status, 0, accepted.stderr)
  const order = ["volume create lcdg-data", "chown 10002:10002 /data", "node src/scheduled/main.ts check", SCHEDULER_UP, "run --skip-new-cutouts", "checkData.ts", "--wait-timeout 300"].map(part => at(accepted.calls, part))
  assert.deepEqual(order, order.toSorted((a, b) => a - b))
  assert.equal(lines(accepted.calls).filter(line => line.includes(" exec ")).length, 0)
})

test("the ntfy token reaches the compose commands alone, never another docker command, npm or the live test", { timeout: 60_000 }, async () => {
  const { status, calls } = await deploy(FIRST, { LCDG_CUTOUTS_ON_BOX: "1" })
  assert.equal(status, 0)
  for (const call of calls) assert.equal(call.token, call.tool === "docker" && call.args.includes("compose") ? TOKEN : null, `${call.tool} ${call.args.join(" ")}`)
  assert.ok(calls.some(call => call.tool === "npm" && call.args.join(" ") === "run test:live"))
})

test("a redeploy stops the pipeline run in progress before compose replaces its scheduler, and leaves it running when compose keeps the scheduler", { timeout: 60_000 }, async () => {
  for (const scheduler of ["running, changed", "running, image rebuilt"] as const) {
    const replaced = await deploy({ ...AGAIN, scheduler })
    assert.equal(replaced.status, 0, replaced.stderr)
    assert.ok(at(replaced.calls, STOP) < at(replaced.calls, SCHEDULER_UP), scheduler)
    assert.equal(replaced.calls.find(call => call.args.join(" ").includes(STOP))?.stdin, STOP_RUN)
  }
  for (const scheduler of ["running, unchanged", "stopped, changed", "absent"] as const) {
    const kept = await deploy({ ...AGAIN, scheduler })
    assert.equal(kept.status, 0, kept.stderr)
    assert.deepEqual(lines(kept.calls).filter(line => line.includes(" exec ")), [], scheduler)
    at(kept.calls, SCHEDULER_UP)
  }
})

test("a redeploy checks the data the new service would serve strictly, unless LCDG_ALLOW_OLDER_VERSION=1", { timeout: 60_000 }, async () => {
  for (const [env, flag] of [[{}, false], [{ LCDG_ALLOW_OLDER_VERSION: "0" }, false], [{ LCDG_ALLOW_OLDER_VERSION: "1" }, true]] as const) {
    const { status, calls } = await deploy(AGAIN, env)
    assert.equal(status, 0)
    const check = lines(calls)[at(calls, "checkData.ts")] ?? ""
    assert.equal(check.endsWith("checkData.ts --allow-older-version"), flag, check)
    assert.equal(check.endsWith("checkData.ts"), !flag, check)
  }
})
