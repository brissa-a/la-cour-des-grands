import assert from "node:assert/strict"
import { execFile, spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"
import { after, test } from "node:test"
import { promisify } from "node:util"
import { readConfig } from "../src/config.ts"

const ROOT = new URL("../../", import.meta.url).pathname
const DEPLOY = new URL("../deploy/deploy.sh", import.meta.url).pathname
const COMPOSE_FILE = new URL("../deploy/docker-compose.yml", import.meta.url).pathname
const DOCKERFILE = await readFile(new URL("../deploy/Dockerfile", import.meta.url), "utf8")
const DOCKER_IGNORE = (await readFile(new URL("../deploy/Dockerfile.dockerignore", import.meta.url), "utf8")).split("\n")
const STOP_RUN = await readFile(new URL("../deploy/stopRun.ts", import.meta.url), "utf8")
const TOKEN = "tk_not_a_real_token"
const KEY = "sk-ant-not-a-real-key-0123456789"
const CUTOUTS_STREAM = "the cutouts as tar writes them"
const CHECKOUT_DEPLOY = "server/deploy/deploy.sh"
const BUILT_FRONT = "the front npm run build writes"

// The box as the fake docker answers it: the data volume, and the scheduler's container against what compose would make of it now.
type Box = {
  readonly volume: "absent" | "empty" | "holding a version"
  readonly scheduler: "absent" | "stopped, changed" | "running, unchanged" | "running, changed" | "running, image rebuilt"
}

type Call = { readonly tool: string; readonly args: readonly string[]; readonly token: string | null; readonly key: string | null; readonly stdin: string }

const scratch = await mkdtemp(join(tmpdir(), "server-deploy-"))
after(() => rm(scratch, { recursive: true, force: true }))

const GIT_ENV = {
  PATH: process.env.PATH ?? "",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
}

async function git(repo: string, ...args: readonly string[]): Promise<string> {
  const { stdout } = await promisify(execFile)("git", ["-C", repo, ...args], { env: GIT_ENV })
  return stdout.trim()
}

async function put(repo: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(repo, path)), { recursive: true })
  await writeFile(join(repo, path), content)
}

// A checkout at the head of its origin's main, holding this repository's deploy.sh and stopRun.ts, as a clone leaves it.
async function checkoutOfMain(): Promise<string> {
  const repo = await mkdtemp(join(scratch, "repo-"))
  const checkout = join(repo, "checkout")
  await git(repo, "init", "--quiet", "--bare", "--initial-branch=main", "origin.git")
  await git(repo, "init", "--quiet", "--initial-branch=main", "checkout")
  await put(checkout, CHECKOUT_DEPLOY, await readFile(DEPLOY, "utf8"))
  await chmod(join(checkout, CHECKOUT_DEPLOY), 0o755)
  await put(checkout, "server/deploy/stopRun.ts", STOP_RUN)
  for (const path of ["server/src/main.ts", "web/src/main.tsx", "pipeline/src/run.ts", "docs/notes.md"]) await put(checkout, path, "")
  await put(checkout, "web/.gitignore", "dist\n.env*.local\n")
  await put(checkout, "pipeline/.gitignore", ".env\n")
  await git(checkout, "add", ".")
  await git(checkout, "commit", "--quiet", "-m", "main")
  await git(checkout, "remote", "add", "origin", join(repo, "origin.git"))
  await git(checkout, "push", "--quiet", "origin", "main")
  return checkout
}

const MAIN = await checkoutOfMain()
const TAG = (await git(MAIN, "rev-parse", "HEAD")).slice(0, 12)
const { stdout: REAL_TAR } = await promisify(execFile)("sh", ["-c", "command -v tar"])

// On the build, the files of the context compose sends: the folder two levels above the compose file, as the file says.
const FAKE_DOCKER = `#!/usr/bin/env node
const { appendFileSync, readdirSync, readFileSync, writeFileSync } = require("node:fs")
const { dirname, join, resolve } = require("node:path")
const args = process.argv.slice(2)
const stdin = readFileSync(0, "utf8")
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: "docker", args, token: process.env.NTFY_TOKEN ?? null, key: process.env.ANTHROPIC_API_KEY ?? null, stdin }) + "\\n")
const line = args.join(" ")
const volume = process.env.FAKE_VOLUME
const scheduler = process.env.FAKE_SCHEDULER
const files = (folder, prefix) => readdirSync(folder, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? files(join(folder, entry.name), prefix + entry.name + "/") : [[prefix + entry.name, readFileSync(join(folder, entry.name), "utf8")]])
if (args.at(-1) === "build") writeFileSync(process.env.FAKE_BUILT, JSON.stringify(Object.fromEntries(files(resolve(dirname(args[args.indexOf("-f") + 1]), "../.."), ""))))
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
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: "${tool}", args, token: process.env.NTFY_TOKEN ?? null, key: process.env.ANTHROPIC_API_KEY ?? null, stdin: "" }) + "\\n")
process.stdout.write(${JSON.stringify(output)})
`

const FAKE_NPM = `${FAKE_TOOL("npm", "")}
if (args.join(" ") === "run build") {
  require("node:fs").mkdirSync("dist", { recursive: true })
  require("node:fs").writeFileSync("dist/index.html", ${JSON.stringify(BUILT_FRONT)})
}
`

// deploy.sh extracts the commit with tar: that one is the real tar.
const FAKE_TAR = `#!/usr/bin/env node
const { appendFileSync } = require("node:fs")
const args = process.argv.slice(2)
if (args.includes("-x")) process.exit(require("node:child_process").spawnSync(process.env.REAL_TAR, args, { stdio: "inherit" }).status ?? 1)
appendFileSync(process.env.FAKE_LOG, JSON.stringify({ tool: "tar", args, token: process.env.NTFY_TOKEN ?? null, key: process.env.ANTHROPIC_API_KEY ?? null, stdin: "" }) + "\\n")
process.stdout.write(${JSON.stringify(CUTOUTS_STREAM)})
process.exitCode = Number(process.env.FAKE_TAR_STATUS ?? 0)
`

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string")
}

function callOf(line: string): Call {
  const parsed: unknown = JSON.parse(line)
  assert.ok(typeof parsed === "object" && parsed !== null && "tool" in parsed && "args" in parsed && "token" in parsed && "key" in parsed && "stdin" in parsed, line)
  const { tool, args, token, key, stdin } = parsed
  assert.ok(typeof tool === "string" && isStrings(args) && (token === null || typeof token === "string") && (key === null || typeof key === "string") && typeof stdin === "string", line)
  return { tool, args, token, key, stdin }
}

function filesOf(text: string): ReadonlyMap<string, string> {
  const parsed: unknown = JSON.parse(text)
  assert.ok(typeof parsed === "object" && parsed !== null, text)
  const entries = Object.entries(parsed)
  assert.ok(entries.every(([, content]) => typeof content === "string"), text)
  return new Map(entries.map(([path, content]) => [path, String(content)]))
}

// The copy of deploy.sh a checkout holds, run there against git itself and fake docker, npm, curl and tar.
async function deploy(box: Box, env: Readonly<Record<string, string>> = {}, checkout = MAIN, withKey = true): Promise<{ readonly status: number | null; readonly stderr: string; readonly calls: readonly Call[]; readonly built: ReadonlyMap<string, string> | null }> {
  const run = await mkdtemp(join(scratch, "run-"))
  const bin = join(run, "bin")
  await mkdir(bin)
  await mkdir(join(run, "home", ".config", "ntfy"), { recursive: true })
  await writeFile(join(run, "home", ".config", "ntfy", "lcdg_pipeline-token"), TOKEN)
  if (withKey) {
    await mkdir(join(run, "home", ".config", "anthropic"), { recursive: true })
    await writeFile(join(run, "home", ".config", "anthropic", "lcdg_pipeline-key"), `${KEY}\n`, { mode: 0o600 })
  }
  const tools = { docker: FAKE_DOCKER, npm: FAKE_NPM, curl: FAKE_TOOL("curl", '{"status":"ok","data":"ready"}'), tar: FAKE_TAR }
  for (const [name, script] of Object.entries(tools)) {
    await writeFile(join(bin, name), script)
    await chmod(join(bin, name), 0o755)
  }
  const log = join(run, "calls.jsonl")
  const built = join(run, "built.json")
  await writeFile(log, "")
  const child = spawn(join(checkout, CHECKOUT_DEPLOY), [], {
    env: { PATH: `${bin}:${process.env.PATH ?? ""}`, HOME: join(run, "home"), FAKE_LOG: log, FAKE_BUILT: built, REAL_TAR: REAL_TAR.trim(), FAKE_VOLUME: box.volume, FAKE_SCHEDULER: box.scheduler, ...env },
    stdio: ["ignore", "ignore", "pipe"],
  })
  let stderr = ""
  child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
  const status = await new Promise<number | null>(resolve => child.once("close", resolve))
  const calls = (await readFile(log, "utf8")).split("\n").filter(Boolean).map(callOf)
  return { status, stderr, calls, built: existsSync(built) ? filesOf(await readFile(built, "utf8")) : null }
}

function lines(calls: readonly Call[]): string[] {
  return calls.filter(call => call.tool === "docker").map(call => call.args.join(" "))
}

function at(calls: readonly Call[], part: string): number {
  const index = lines(calls).findIndex(line => line.includes(part))
  assert.notEqual(index, -1, `a docker call with ${part}`)
  return index
}

// DOCKER_HOST leads nowhere: compose resolves the file alone, whichever Docker context is current.
const { stdout: resolvedCompose } = await promisify(execFile)("docker", ["compose", "-f", COMPOSE_FILE, "config", "--format", "json"], {
  env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", DOCKER_HOST: "unix:///nonexistent.sock", NTFY_TOKEN: TOKEN, ANTHROPIC_API_KEY: KEY, LCDG_TAG: TAG },
})
const composed: unknown = JSON.parse(resolvedCompose)

function field(value: unknown, ...path: readonly string[]): unknown {
  return path.reduce<unknown>((inner, key) => {
    assert.ok(typeof inner === "object" && inner !== null && key in inner, `no ${key} in ${JSON.stringify(inner)}`)
    return new Map<string, unknown>(Object.entries(inner)).get(key)
  }, value)
}

function items(value: unknown): readonly unknown[] {
  assert.ok(Array.isArray(value), JSON.stringify(value))
  return value
}

function dockerfileLine(pattern: RegExp): string {
  return pattern.exec(DOCKERFILE)?.[1] ?? assert.fail(`no ${String(pattern)} in the Dockerfile`)
}

const START = dockerfileLine(/^CMD \["node", "([^"]+)"\]$/m)
const COPIED = Array.from(DOCKERFILE.matchAll(/^COPY (.+) \S+$/gm), ([, sources = ""]) => sources.split(" ")).flat()
const copiedIntoImage = (path: string) => existsSync(join(ROOT, path)) && COPIED.some(source => path === source || path.startsWith(`${source}/`))
const SERVER_IMAGE = field(composed, "services", "lcdg-server", "image")

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

test("the ntfy token and the Anthropic key reach the compose commands alone, never another docker command, npm or the live test, nor the deploy's output", { timeout: 60_000 }, async () => {
  const { status, calls, stderr } = await deploy(FIRST, { LCDG_CUTOUTS_ON_BOX: "1" })
  assert.equal(status, 0)
  for (const call of calls) {
    const composed = call.tool === "docker" && call.args.includes("compose")
    assert.deepEqual([call.token, call.key], composed ? [TOKEN, KEY] : [null, null], `${call.tool} ${call.args.join(" ")}`)
  }
  assert.ok(calls.some(call => call.tool === "npm" && call.args.join(" ") === "run test:live"))
  assert.ok(!stderr.includes(KEY))
  assert.doesNotMatch(stderr, /anthropic/)
})

test("without the Anthropic key the deploy goes on, says the news will be written automatically, and compose passes an empty key", { timeout: 60_000 }, async () => {
  const { status, calls, stderr } = await deploy(AGAIN, {}, MAIN, false)
  assert.equal(status, 0, stderr)
  assert.match(stderr, /Warning: no \S+\/\.config\/anthropic\/lcdg_pipeline-key: the news will be written automatically, not by Claude/)
  assert.deepEqual(stderr.split("\n").filter(line => line.includes("anthropic")).length, 1, stderr)
  const composing = calls.filter(call => call.tool === "docker" && call.args.includes("compose"))
  assert.ok(composing.length > 0)
  assert.deepEqual(new Set(composing.map(call => call.key)), new Set([""]))
  at(calls, SCHEDULER_UP)
})

test("only the pipeline's container gets the Anthropic key, and an empty one when compose is given none", async () => {
  const keyOf = (config: unknown): unknown => {
    const environment = typeof config === "object" && config !== null && "environment" in config ? config.environment : null
    return typeof environment === "object" && environment !== null && "ANTHROPIC_API_KEY" in environment ? environment.ANTHROPIC_API_KEY : null
  }
  const environments = (resolved: unknown) => ["lcdg-server", "lcdg-chromium", "lcdg-pipeline"].map(service => keyOf(field(resolved, "services", service)))
  assert.deepEqual(environments(composed), [null, null, KEY])
  const { stdout } = await promisify(execFile)("docker", ["compose", "-f", COMPOSE_FILE, "config", "--format", "json"], {
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", DOCKER_HOST: "unix:///nonexistent.sock", NTFY_TOKEN: TOKEN, LCDG_TAG: TAG },
  })
  assert.deepEqual(environments(JSON.parse(stdout)), [null, null, ""])
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

test("a redeploy checks the data with the image compose then starts and a script copied into it, strictly unless LCDG_ALLOW_OLDER_VERSION=1", { timeout: 60_000 }, async () => {
  for (const [env, flag] of [[{}, false], [{ LCDG_ALLOW_OLDER_VERSION: "0" }, false], [{ LCDG_ALLOW_OLDER_VERSION: "1" }, true]] as const) {
    const { status, calls } = await deploy(AGAIN, env)
    assert.equal(status, 0)
    const check = lines(calls)[at(calls, "checkData.ts")] ?? ""
    assert.equal(check.endsWith("checkData.ts --allow-older-version"), flag, check)
    assert.equal(check.endsWith("checkData.ts"), !flag, check)
    const [, image, script = ""] = /\/data:ro (\S+) node (\S+)/.exec(check) ?? []
    assert.equal(image, SERVER_IMAGE, check)
    assert.ok(copiedIntoImage(script), check)
  }
})

test("only the switch, once the data is checked, removes the containers of services the compose file no longer names", { timeout: 60_000 }, async () => {
  const { status, calls } = await deploy(AGAIN)
  assert.equal(status, 0)
  const removing = lines(calls).flatMap((line, index) => (line.split(" ").includes("--remove-orphans") ? [index] : []))
  assert.deepEqual(removing, [at(calls, "--wait-timeout 300")])
  assert.ok(at(calls, "checkData.ts") < at(calls, "--wait-timeout 300"))
})

test("a deploy removes no image, those of earlier deploys being what a rollback starts", { timeout: 60_000 }, async () => {
  for (const [box, env] of [[AGAIN, {}], [FIRST, { LCDG_CUTOUTS_ON_BOX: "1" }]] as const) {
    const { status, calls } = await deploy(box, env)
    assert.equal(status, 0)
    assert.deepEqual(lines(calls).filter(line => /\bprune\b|\brmi\b|--rmi\b|\bimage (?!inspect\b)/.test(line)), [])
  }
})

test("a deploy refuses a HEAD other than the head of main as the origin holds it now, whatever local ref is named origin/main, before it builds or sends anything", { timeout: 60_000 }, async () => {
  const ahead = async () => {
    const checkout = await checkoutOfMain()
    await put(checkout, "server/src/main.ts", "committed, never pushed")
    await git(checkout, "commit", "--quiet", "-am", "local")
    return checkout
  }
  const behind = async () => {
    const checkout = await checkoutOfMain()
    await put(checkout, "server/src/main.ts", "pushed from another checkout")
    await git(checkout, "commit", "--quiet", "-am", "elsewhere")
    await git(checkout, "push", "--quiet", "origin", "main")
    await git(checkout, "reset", "--quiet", "--hard", "HEAD~1")
    await git(checkout, "update-ref", "refs/remotes/origin/main", "HEAD")
    return checkout
  }
  const checkouts: readonly (readonly [string, () => Promise<string>])[] = [
    ["ahead", ahead],
    ["behind", behind],
    ["ahead, a local branch origin/main on it", async () => {
      const checkout = await ahead()
      await git(checkout, "branch", "origin/main")
      return checkout
    }],
    ["ahead, a tag origin/main on it", async () => {
      const checkout = await ahead()
      await git(checkout, "tag", "origin/main")
      return checkout
    }],
    ["behind, the origin's refspec skipping main", async () => {
      const checkout = await behind()
      await git(checkout, "config", "remote.origin.fetch", "+refs/heads/other:refs/remotes/origin/other")
      return checkout
    }],
  ]
  for (const [name, make] of checkouts) {
    const { status, stderr, calls } = await deploy(AGAIN, {}, await make())
    assert.equal(status, 1, name)
    assert.match(stderr, /production is the head of main, deploy nothing else/, name)
    assert.deepEqual(calls, [], name)
  }
})

test("a deploy stops before it builds or sends anything when it cannot fetch main from the origin", { timeout: 60_000 }, async () => {
  const checkout = await checkoutOfMain()
  await git(checkout, "remote", "set-url", "origin", join(checkout, "..", "nowhere.git"))
  const { status, stderr, calls } = await deploy(AGAIN, {}, checkout)
  assert.equal(status, 1)
  assert.match(stderr, /Could not fetch main from origin/)
  assert.deepEqual(calls, [])
})

test("a deploy refuses a change in server/, web/ or pipeline/, unstaged, staged or untracked even where status hides untracked files, before it builds or sends anything", { timeout: 60_000 }, async () => {
  const changes: readonly (readonly [string, (checkout: string) => Promise<unknown>])[] = [
    ["server/src/main.ts", checkout => put(checkout, "server/src/main.ts", "changed")],
    ["web/src/added.ts", async checkout => {
      await put(checkout, "web/src/added.ts", "")
      await git(checkout, "add", "web/src/added.ts")
    }],
    ["pipeline/src/added.ts", async checkout => {
      await git(checkout, "config", "status.showUntrackedFiles", "no")
      await put(checkout, "pipeline/src/added.ts", "")
    }],
  ]
  for (const [path, change] of changes) {
    const checkout = await checkoutOfMain()
    await change(checkout)
    const { status, stderr, calls } = await deploy(AGAIN, {}, checkout)
    assert.equal(status, 1, path)
    assert.ok(stderr.includes("differ from origin/main") && stderr.includes(path), stderr)
    assert.deepEqual(calls, [], path)
  }
})

test("a deploy from the head of origin/main builds the front and the images from that commit's files alone, and tags them with it, whatever the checkout holds outside server/, web/ and pipeline/ or ignored there", { timeout: 60_000 }, async () => {
  const checkout = await checkoutOfMain()
  const commit = await git(checkout, "rev-parse", "HEAD")
  const committed = new Map<string, string>([["web/dist/index.html", BUILT_FRONT]])
  for (const path of (await git(checkout, "ls-tree", "-r", "--name-only", "HEAD")).split("\n")) committed.set(path, await readFile(join(checkout, path), "utf8"))
  await put(checkout, "docs/notes.md", "changed")
  await put(checkout, "docs/added.md", "")
  await put(checkout, "web/dist/index.html", "left by an earlier build")
  await put(checkout, "web/.env.production.local", "VITE_FROM=the checkout alone")
  await put(checkout, "pipeline/src/.env", "SECRET=the checkout alone")
  const { status, stderr, calls, built } = await deploy(AGAIN, {}, checkout)
  assert.equal(status, 0, stderr)
  assert.deepEqual(built, committed)
  assert.ok(lines(calls).some(line => line.includes(` lcdg-server:${commit.slice(0, 12)} node `)), lines(calls).join("\n"))
})

test("the render cache stays in the volume the running service fills, mounted where the image's service writes, on a folder its user owns", () => {
  const workdir = dockerfileLine(/^WORKDIR (\S+)$/m)
  const { cacheDir } = readConfig({}, dirname(dirname(join(workdir, START))))
  assert.equal(field(composed, "volumes", "cache", "name"), "lcdg_cache")
  const mounts = items(field(composed, "services", "lcdg-server", "volumes")).map(mount => [field(mount, "source"), field(mount, "target")])
  assert.deepEqual(mounts.filter(([source]) => source === "cache"), [["cache", cacheDir]])
  assert.ok(DOCKERFILE.includes(`install -d -o lcdg -g lcdg ${relative(workdir, cacheDir)}`))
})

test("the capture browser starts from the service's image the Playwright that image installs", () => {
  assert.equal(field(composed, "services", "lcdg-chromium", "image"), SERVER_IMAGE)
  const cli = String(items(field(composed, "services", "lcdg-chromium", "command"))[1])
  assert.ok(existsSync(join(ROOT, cli)), cli)
  assert.ok(DOCKERFILE.includes(`npm ci --prefix ${cli.split("/")[0] ?? ""} `), cli)
})

test("everything the image is built from exists in the repository, gets past the build's ignore file, and holds the program it starts", () => {
  assert.deepEqual(COPIED.filter(source => !existsSync(join(ROOT, source)) || !DOCKER_IGNORE.includes(`!${source}`)), [])
  assert.ok(copiedIntoImage(START))
})

test("every container that only reads the data volume runs without network, read-only, the volume mounted read-only", { timeout: 60_000 }, async () => {
  const { status, calls } = await deploy(AGAIN)
  assert.equal(status, 0)
  const readers = calls.filter(call => call.tool === "docker" && /checkData\.ts|test -f \/data\/v2\/current\.json/.test(call.args.join(" ")))
  assert.equal(readers.length, 2)
  const pairs = (args: readonly string[]) => args.slice(0, -1).map((arg, index) => `${arg} ${args[index + 1] ?? ""}`)
  for (const { args } of readers) {
    assert.ok(pairs(args).includes("--network none") && args.includes("--read-only") && pairs(args).includes("--volume lcdg-data:/data:ro"), args.join(" "))
  }
})

test("a first deploy pours the cutouts LCDG_PHOTOS_FROM names into the pipeline's output before its first run, and stops there when tar fails on the Mac", { timeout: 60_000 }, async () => {
  const photos = await mkdtemp(join(scratch, "photos-"))
  await writeFile(join(photos, "registry.json"), "{}")
  const POUR = "run --rm --no-TTY lcdg-pipeline tar -C output/photos -xf -"
  const copied = await deploy(FIRST, { LCDG_PHOTOS_FROM: photos })
  assert.equal(copied.status, 0, copied.stderr)
  assert.deepEqual(copied.calls.filter(call => call.tool === "tar").map(call => call.args), [["--no-xattrs", "-C", photos, "-cf", "-", "."]])
  assert.equal(copied.calls.find(call => call.args.join(" ").includes(POUR))?.stdin, CUTOUTS_STREAM)
  assert.ok(at(copied.calls, POUR) < at(copied.calls, "run --skip-new-cutouts"))
  const failed = await deploy(FIRST, { LCDG_PHOTOS_FROM: photos, FAKE_TAR_STATUS: "2" })
  assert.equal(failed.status, 2)
  at(failed.calls, POUR)
  assert.deepEqual(lines(failed.calls).filter(line => /--skip-new-cutouts|checkData\.ts|--wait-timeout/.test(line)), [])
})
