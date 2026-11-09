import assert from "node:assert/strict"
import { chmod, link, mkdir, mkdtemp, rm, symlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { snapshotPath, type SnapshotPath } from "../../web/src/data/snapshotPath.ts"
import { dataVersion } from "../../web/src/data/version.ts"
import { given, NEW as OTHER, openDescriptorsOn, SHA as VERSION } from "./fixture.test.ts"
import { dataAddress, dataFile, keptVersions, modifiedAt, openSnapshotFile, readPointer, readSnapshotFile, snapshotReader } from "./snapshot.ts"

const scratch = await mkdtemp(join(tmpdir(), "server-snapshot-"))
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
  assert.deepEqual(dataAddress(`/data/v2/${VERSION}/catalog.json`), { kind: "file", version: VERSION, file: { path: "catalog.json", type: { type: "application/json", compress: true } } })
  assert.deepEqual(dataAddress(`/data/v2/${VERSION}/deputies/votes/other.csv`), { kind: "file", version: VERSION, file: { path: "deputies/votes/other.csv", type: { type: "text/csv; charset=utf-8", compress: true } } })
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

test("a data file is one of the types a data version holds, each with its own content type, compressed but for the photos; any other name is none", () => {
  assert.deepEqual(
    ["catalog.json", "deputies/init.csv", "communes/constituency-contours.geojson", "seats/hemicycle.svg", "photos/PA720892.webp"].map(name => given(dataFile(name), name).type),
    [
      { type: "application/json", compress: true },
      { type: "text/csv; charset=utf-8", compress: true },
      { type: "application/geo+json", compress: true },
      { type: "image/svg+xml", compress: true },
      { type: "image/webp", compress: false },
    ],
  )
  for (const name of ["index.html", "seats/draw.js", "seats/draw.mjs", "notes.txt", "photos/PA1.jpg", "photos/PA1.png", "README", "catalog.JSON", "photos/PA1.WEBP", "catalog.json.gz", "seats/hemicycle.svgz", "toString", ".csv", "../catalog.json"])
    assert.equal(dataFile(name), null, name)
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

test("the kept versions are the folders of v2/ named by a version, newest first by their date, each with a pointer naming it and published at that date", async () => {
  const root = await dataRoot("kept")
  const v2 = join(root, "v2")
  const NEWEST = given(dataVersion("4".repeat(40)), "newest version")
  for (const version of [ABSENT, NEWEST]) await mkdir(join(v2, version))
  await mkdir(join(v2, "A".repeat(40)))
  await mkdir(join(v2, ".rejected", NEWEST), { recursive: true })
  await writeFile(join(v2, "5".repeat(40)), "")
  const dated = [
    [ABSENT, "2026-11-01T04:00:00.000Z"],
    [VERSION, "2026-11-05T04:00:00.000Z"],
    [NEWEST, "2026-11-07T04:00:00.123Z"],
  ] as const
  for (const [version, at] of dated) await utimes(join(v2, version), new Date(at), new Date(at))
  assert.deepEqual(
    await keptVersions(root),
    dated.toReversed().map(([version, publishedAt]) => ({ version, pointer: `{"version":"${version}","publishedAt":"${publishedAt}"}\n` })),
  )
})

test("a data root without v2/ keeps no version, and one whose v2/ the service may not list is an error", async () => {
  assert.deepEqual(await keptVersions(join(scratch, "nowhere")), [])
  const locked = await dataRoot("unlisted")
  await chmod(join(locked, "v2"), 0o000)
  await assert.rejects(keptVersions(locked), /EACCES/)
  await chmod(join(locked, "v2"), 0o755)
})

test("a version folder the pipeline moves away while the versions are listed reads as absent, and a date the service may not read is an error", async () => {
  const root = await dataRoot("vanishing")
  const folder = join(root, "v2", VERSION)
  await mkdir(folder, { recursive: true })
  await utimes(folder, new Date("2026-11-05T04:00:00.000Z"), new Date("2026-11-05T04:00:00.000Z"))
  assert.deepEqual(await modifiedAt(folder), new Date("2026-11-05T04:00:00.000Z"))
  assert.equal(await modifiedAt(join(root, "v2", ABSENT)), null)
  await chmod(join(root, "v2"), 0o000)
  await assert.rejects(modifiedAt(folder), /EACCES/)
  await chmod(join(root, "v2"), 0o755)
})

test("a version folder the pipeline moves away between the listing and its date is left out of the kept versions", async () => {
  const root = await dataRoot("moved-away")
  const v2 = join(root, "v2")
  await mkdir(join(v2, ABSENT))
  const dated = new Date("2026-11-05T04:00:00.000Z")
  const movedAway = (folder: string) => Promise.resolve(folder === join(v2, ABSENT) ? null : dated)
  assert.deepEqual(await keptVersions(root, movedAway), [{ version: VERSION, pointer: `{"version":"${VERSION}","publishedAt":"${dated.toISOString()}"}\n` }])
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

test("a file of a version is opened with its size, and reading it, or opening a folder, a link or a missing file, leaves nothing open", async () => {
  const opened = given(await openSnapshotFile(ROOT, VERSION, path("votes/votes.csv")), "votes.csv")
  try {
    assert.deepEqual([opened.size, (await opened.handle.readFile()).toString()], [20, "vote_id\nVTANR5L17V1\n"])
  } finally {
    await opened.handle.close()
  }
  for (const name of ["votes", "inside.json", "outside.txt", "missing.csv"]) assert.equal(await openSnapshotFile(ROOT, VERSION, path(name)), null, name)
  assert.equal(await read(ROOT, "photos"), null)
  assert.equal(await read(ROOT, "votes/votes.csv"), "vote_id\nVTANR5L17V1\n")
  assert.deepEqual(await Promise.all([join(ROOT, "v2", VERSION, "votes"), join(ROOT, "v2", VERSION, "photos"), join(ROOT, "v2", VERSION, "votes", "votes.csv")].map(openDescriptorsOn)), [0, 0, 0])
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
