import assert from "node:assert/strict"
import { chmod, link, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { snapshotPath, type SnapshotPath } from "../../web/src/data/snapshotPath.ts"
import { dataVersion } from "../../web/src/data/version.ts"
import { given, NEW as OTHER, SHA as VERSION } from "./fixture.test.ts"
import { dataAddress, readPointer, readSnapshotFile, snapshotReader } from "./snapshot.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-snapshot-"))
after(() => rm(scratch, { recursive: true, force: true }))

const POINTER = `{"version":"${VERSION}","publishedAt":"2026-11-07T04:00:00.000Z"}\n`
const STORED = "0".repeat(64)
const ABSENT = given(dataVersion("3".repeat(40)), "absent version")

async function dataRoot(name: string, pointer: string | null = POINTER): Promise<string> {
  const root = join(scratch, name)
  const v2 = join(root, "v2")
  const version = join(v2, VERSION)
  await mkdir(join(version, "votes"), { recursive: true })
  await mkdir(join(version, "photos"))
  await mkdir(join(v2, ".store"))
  await mkdir(join(v2, ".runs"))
  await mkdir(join(scratch, `${name}-elsewhere`))
  if (pointer !== null) await writeFile(join(v2, "current.json"), pointer)
  await writeFile(join(version, "catalog.json"), '{"files":[]}')
  await writeFile(join(version, "votes", "votes.csv"), "vote_id\nVTANR5L17V1\n")
  await writeFile(join(version, ".hidden"), "hidden")
  await writeFile(join(v2, ".store", STORED), "WEBP")
  await link(join(v2, ".store", STORED), join(version, "photos", "PA1.webp"))
  await writeFile(join(v2, ".runs", "last.json"), "{}")
  await writeFile(join(root, "secret.txt"), "secret")
  await writeFile(join(scratch, `${name}-elsewhere`, "secret.txt"), "secret")
  await symlink(join(version, "catalog.json"), join(version, "inside.json"))
  await symlink(join(root, "secret.txt"), join(version, "outside.txt"))
  await symlink(join(scratch, `${name}-elsewhere`), join(version, "linked"))
  await symlink(join(scratch, `${name}-elsewhere`), join(v2, OTHER))
  await symlink("loop", join(version, "loop"))
  return root
}

const ROOT = await dataRoot("root")

const path = (text: string): SnapshotPath => given(snapshotPath(text), text)

const read = async (root: string, text: string, version = VERSION) => (await readSnapshotFile(root, version, path(text)))?.toString() ?? null

test("an address under /data/v2/ names the pointer, or a file of a version by its path, and nothing else", () => {
  assert.deepEqual(dataAddress("/data/v2/current.json"), { kind: "pointer" })
  assert.deepEqual(dataAddress(`/data/v2/${VERSION}/catalog.json`), { kind: "file", version: VERSION, path: "catalog.json" })
  assert.deepEqual(dataAddress(`/data/v2/${VERSION}/deputies/votes/other.csv`), { kind: "file", version: VERSION, path: "deputies/votes/other.csv" })
  for (const pathname of [
    "/data/v2/",
    "/data/v2/current.json/",
    "/data/v2/current.jsonx",
    "/data/v1/current.json",
    "/data/current.json",
    "/x/data/v2/current.json",
    `/data/v2/${VERSION}`,
    `/data/v2/${VERSION}0`,
    `/data/v2/${VERSION}/`,
    `/data/v2/${VERSION}x/catalog.json`,
    `/data/v2/${VERSION.toUpperCase()}/catalog.json`,
    `/data/v2/${VERSION.slice(1)}/catalog.json`,
    "/data/v2/main/catalog.json",
    `/data/v2/${VERSION}/../${OTHER}/catalog.json`,
    `/data/v2/${VERSION}/%2e%2e/secret.txt`,
    `/data/v2/${VERSION}/..%2fsecret.txt`,
    `/data/v2/${VERSION}//catalog.json`,
    `/data/v2/${VERSION}/votes/`,
    `/data/v2/${VERSION}/.hidden`,
    `/data/v2/${VERSION}/photos/.PA1.webp`,
    `/data/v2/.store/${STORED}`,
    "/data/v2/.runs/last.json",
    "/data/v2/.rejected/x/catalog.json",
    `/data/v2/${VERSION}/catalog.json%00`,
  ])
    assert.equal(dataAddress(pathname), null, pathname)
})

test("the pointer is read from v2/current.json, kept as written, with the version it names", async () => {
  assert.deepEqual(await readPointer(ROOT), { kind: "found", version: VERSION, pointer: POINTER })
})

test("a pointer that is absent, not a file, a link, or that names no valid version is reported with its reason, never as a version", async () => {
  const absent = await readPointer(await dataRoot("absent", null))
  assert.ok(absent.kind === "failed" && absent.reason.startsWith("ENOENT: no such file or directory"), JSON.stringify(absent))
  const folder = await dataRoot("folder", null)
  await mkdir(join(folder, "v2", "current.json"))
  assert.deepEqual(await readPointer(folder), { kind: "failed", reason: "current.json is not a file" })
  const linked = await dataRoot("linked", null)
  await symlink(join(scratch, "root", "v2", "current.json"), join(linked, "v2", "current.json"))
  const link = await readPointer(linked)
  assert.ok(link.kind === "failed" && link.reason.startsWith("ELOOP"), JSON.stringify(link))
  assert.deepEqual(await readPointer(await dataRoot("garbled", '{"version":')), { kind: "failed", reason: 'current.json names no version: "{\\"version\\":"' })
  assert.deepEqual(await readPointer(await dataRoot("long", "x".repeat(80))), { kind: "failed", reason: `current.json names no version: "${"x".repeat(60)}"` })
})

test("a file of a version is read by its path, a photo linked to the store included", async () => {
  assert.equal(await read(ROOT, "catalog.json"), '{"files":[]}')
  assert.equal(await read(ROOT, "votes/votes.csv"), "vote_id\nVTANR5L17V1\n")
  assert.equal(await read(ROOT, "photos/PA1.webp"), "WEBP")
  const throughLink = join(scratch, "root-link")
  await symlink(ROOT, throughLink)
  assert.equal(await read(throughLink, "catalog.json"), '{"files":[]}')
})

test("a missing file or version, a folder, or a symbolic link anywhere below the root, inside the version or out of it, reads as nothing", async () => {
  for (const missing of ["missing.csv", "votes", "votes/missing.csv", "catalog.json/x", "inside.json", "outside.txt", "linked/secret.txt", "loop"]) assert.equal(await read(ROOT, missing), null, missing)
  assert.equal(await read(ROOT, "secret.txt", OTHER), null)
  assert.equal(await read(ROOT, "catalog.json", ABSENT), null)
  assert.equal(await read(join(scratch, "nowhere"), "catalog.json"), null)
})

test("a file the service may not read is an error, not a missing file", async () => {
  const locked = await dataRoot("locked")
  await chmod(join(locked, "v2", VERSION, "catalog.json"), 0o000)
  await assert.rejects(readSnapshotFile(locked, VERSION, path("catalog.json")), /EACCES/)
})

test("the release's data is read from the version's folder, and a path out of it or missing fails with the path", async () => {
  const reader = snapshotReader(ROOT, VERSION)
  assert.equal(await reader("votes/votes.csv"), "vote_id\nVTANR5L17V1\n")
  await assert.rejects(reader("../current.json"), new Error(`../current.json: not in the data version ${VERSION}`))
  await assert.rejects(reader("votes/missing.csv"), new Error(`votes/missing.csv: not in the data version ${VERSION}`))
})
