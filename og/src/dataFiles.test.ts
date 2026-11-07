import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { brotliDecompressSync, gunzipSync } from "node:zlib"
import { snapshotPath, type SnapshotPath } from "../../web/src/data/snapshotPath.ts"
import { createDataFiles } from "./dataFiles.ts"
import { given, SHA as VERSION } from "./fixture.test.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-data-files-"))
after(() => rm(scratch, { recursive: true, force: true }))

const CSV = "deputy_id,group\n" + "PA720892,LFI-NFP\n".repeat(400)
const WEBP = "RIFF....WEBPVP8 "

async function snapshot(name: string): Promise<string> {
  const root = join(scratch, name)
  const version = join(root, "v2", VERSION)
  await mkdir(join(version, "photos"), { recursive: true })
  await mkdir(join(version, "seats"))
  for (const file of ["a.csv", "b.csv", "c.csv"]) await writeFile(join(version, file), CSV)
  await writeFile(join(version, "catalog.json"), JSON.stringify({ files: Array(200).fill({ file: "deputies/init.csv" }) }))
  await writeFile(join(version, "contours.geojson"), JSON.stringify({ type: "FeatureCollection", features: Array(200).fill({ type: "Feature" }) }))
  await writeFile(join(version, "seats", "hemicycle.svg"), `<svg>${"<path/>".repeat(200)}</svg>`)
  await writeFile(join(version, "photos", "PA720892.webp"), WEBP)
  return root
}

const path = (text: string): SnapshotPath => given(snapshotPath(text), text)

test("each data file goes out with its type, text compressed in the encoding the client accepts and decoding to its bytes, photos as they are", async () => {
  const files = createDataFiles(await snapshot("types"), 1_000_000)
  const described = []
  for (const name of ["a.csv", "catalog.json", "contours.geojson", "seats/hemicycle.svg"]) {
    const br = given(await files.get(VERSION, path(name), "br"), name)
    const gzip = given(await files.get(VERSION, path(name), "gzip"), name)
    const plain = given(await files.get(VERSION, path(name), "identity"), name)
    assert.deepEqual(brotliDecompressSync(br.body), plain.body, name)
    assert.deepEqual(gunzipSync(gzip.body), plain.body, name)
    assert.ok(br.body.length < plain.body.length / 4, name)
    described.push([name, br.type, br.encoding, gzip.encoding, plain.encoding, br.varies, gzip.varies, plain.varies])
  }
  assert.deepEqual(described, [
    ["a.csv", "text/csv; charset=utf-8", "br", "gzip", "identity", true, true, true],
    ["catalog.json", "application/json", "br", "gzip", "identity", true, true, true],
    ["contours.geojson", "application/geo+json", "br", "gzip", "identity", true, true, true],
    ["seats/hemicycle.svg", "image/svg+xml", "br", "gzip", "identity", true, true, true],
  ])
  assert.deepEqual(await files.get(VERSION, path("photos/PA720892.webp"), "br"), { type: "image/webp", encoding: "identity", body: Buffer.from(WEBP), varies: false })
})

test("a file the version does not hold is nothing, in every encoding", async () => {
  const files = createDataFiles(await snapshot("missing"), 1_000_000)
  for (const encoding of ["br", "gzip", "identity"] as const) assert.equal(await files.get(VERSION, path("missing.csv"), encoding), null, encoding)
})

test("a compressed body is made once and kept, the least recently used dropped past the memory bound; a plain body is read from the disk each time", async () => {
  const root = await snapshot("kept")
  const version = join(root, "v2", VERSION)
  const one = given(await createDataFiles(root, 1_000_000).get(VERSION, path("a.csv"), "br"), "a.csv").body.length
  const files = createDataFiles(root, one * 2)
  for (const name of ["a.csv", "b.csv"]) await files.get(VERSION, path(name), "br")
  for (const name of ["a.csv", "b.csv", "c.csv"]) await unlink(join(version, name))
  assert.deepEqual(given(await files.get(VERSION, path("a.csv"), "br"), "kept a.csv").encoding, "br")
  assert.equal(await files.get(VERSION, path("a.csv"), "identity"), null)
  assert.equal(await files.get(VERSION, path("a.csv"), "gzip"), null)
  await writeFile(join(version, "c.csv"), CSV)
  await files.get(VERSION, path("c.csv"), "br")
  await unlink(join(version, "c.csv"))
  assert.deepEqual(
    await Promise.all(["a.csv", "b.csv", "c.csv"].map(async name => (await files.get(VERSION, path(name), "br"))?.encoding ?? null)),
    ["br", null, "br"],
  )
})
