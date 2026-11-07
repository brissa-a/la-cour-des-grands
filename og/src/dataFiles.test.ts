import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { brotliDecompressSync, gunzipSync } from "node:zlib"
import { createDataFiles, type Compress, type Compression, type DataBody, type DataFilesLimits } from "./dataFiles.ts"
import { eventually, given, SHA as VERSION } from "./fixture.test.ts"
import { compressedOffLoop } from "./site.ts"
import { dataFile, type DataFile, type OpenedFile } from "./snapshot.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-data-files-"))
after(() => rm(scratch, { recursive: true, force: true }))

const CSV = "deputy_id,group\n" + "PA720892,LFI-NFP\n".repeat(400)
const WEBP = "RIFF....WEBPVP8 "
const LIMITS: DataFilesLimits = { keptBytes: 1_000_000, compressions: 2 }

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

const path = (text: string): DataFile => given(dataFile(text), text)

function compressedOf(found: DataBody | null, what: string): Buffer {
  const data = given(found, what)
  if (data.encoding === "identity") return assert.fail(`${what}: sent plain`)
  return data.body
}

function openedOf(found: DataBody | null, what: string): OpenedFile {
  const data = given(found, what)
  if (data.encoding !== "identity") return assert.fail(`${what}: sent ${data.encoding}`)
  return data.body
}

async function bytesOf({ handle }: OpenedFile): Promise<Buffer> {
  try {
    return await handle.readFile()
  } finally {
    await handle.close()
  }
}

test("each data file goes out with its type, text compressed in the encoding the client accepts and decoding to its bytes, plain as an open file of its size, photos as they are", async () => {
  const files = createDataFiles(await snapshot("types"), LIMITS)
  const described = []
  for (const name of ["a.csv", "catalog.json", "contours.geojson", "seats/hemicycle.svg"]) {
    const br = given(await files.get(VERSION, path(name), "br"), name)
    const gzip = given(await files.get(VERSION, path(name), "gzip"), name)
    const plain = given(await files.get(VERSION, path(name), "identity"), name)
    const opened = openedOf(plain, name)
    const bytes = await bytesOf(opened)
    assert.equal(opened.size, bytes.length, name)
    assert.deepEqual(await files.read(VERSION, path(name)), bytes, name)
    assert.deepEqual(brotliDecompressSync(compressedOf(br, name)), bytes, name)
    assert.deepEqual(gunzipSync(compressedOf(gzip, name)), bytes, name)
    assert.ok(compressedOf(br, name).length < bytes.length / 4, name)
    described.push([name, br.type, br.encoding, gzip.encoding, plain.encoding, br.varies, gzip.varies, plain.varies])
  }
  assert.deepEqual(described, [
    ["a.csv", "text/csv; charset=utf-8", "br", "gzip", "identity", true, true, true],
    ["catalog.json", "application/json", "br", "gzip", "identity", true, true, true],
    ["contours.geojson", "application/geo+json", "br", "gzip", "identity", true, true, true],
    ["seats/hemicycle.svg", "image/svg+xml", "br", "gzip", "identity", true, true, true],
  ])
  const photo = given(await files.get(VERSION, path("photos/PA720892.webp"), "br"), "photo")
  assert.deepEqual([photo.type, photo.encoding, photo.varies, await bytesOf(openedOf(photo, "photo"))], ["image/webp", "identity", false, Buffer.from(WEBP)])
})

test("a file the version does not hold is nothing, in every encoding and read whole", async () => {
  const files = createDataFiles(await snapshot("missing"), LIMITS)
  for (const encoding of ["br", "gzip", "identity"] as const) assert.equal(await files.get(VERSION, path("missing.csv"), encoding), null, encoding)
  assert.equal(await files.read(VERSION, path("missing.csv")), null)
})

test("a compressed body is made once and kept, the least recently used dropped past the memory bound; a plain body is read from the disk each time", async () => {
  const root = await snapshot("kept")
  const version = join(root, "v2", VERSION)
  const one = compressedOf(await createDataFiles(root, LIMITS).get(VERSION, path("a.csv"), "br"), "a.csv").length
  const files = createDataFiles(root, { ...LIMITS, keptBytes: one * 2 })
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

test("a cold file asked by many at the same time is compressed once per encoding, and every request gets that one body", async () => {
  const calls: Compression[] = []
  const compress: Compress = (plain, encoding) => {
    calls.push(encoding)
    return compressedOffLoop(plain, encoding)
  }
  const files = createDataFiles(await snapshot("shared"), LIMITS, compress)
  const encodings = Array.from({ length: 30 }, (_, index): Compression => (index % 3 === 0 ? "gzip" : "br"))
  const bodies = (await Promise.all(encodings.map(encoding => files.get(VERSION, path("a.csv"), encoding)))).map((found, index) => compressedOf(found, `request ${index}`))
  assert.deepEqual(calls.toSorted(), ["br", "gzip"])
  assert.ok(bodies.every((body, index) => body === bodies[encodings[index] === "gzip" ? 0 : 1]))
  await files.get(VERSION, path("a.csv"), "br")
  assert.equal(calls.length, 2)
})

test("no more files are compressed at once than the limit, the others waiting for a slot", { timeout: 10_000 }, async () => {
  const running: (() => void)[] = []
  const compress: Compress = plain => new Promise(resolve => running.push(() => resolve(plain.subarray(0, 10))))
  const files = createDataFiles(await snapshot("slots"), { ...LIMITS, compressions: 2 }, compress)
  const asked = ["a.csv", "b.csv", "c.csv"].map(name => files.get(VERSION, path(name), "br"))
  await eventually(() => running.length === 2, "two compressions started")
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.equal(running.length, 2)
  running[0]?.()
  await eventually(() => running.length === 3, "the third started once a slot was free")
  for (const done of running) done()
  assert.deepEqual(
    (await Promise.all(asked)).map((found, index) => compressedOf(found, `file ${index}`).toString()),
    ["deputy_id,", "deputy_id,", "deputy_id,"],
  )
})

test("a compression that fails fails every request waiting on it, frees its slot, and is tried again by the next request", { timeout: 10_000 }, async () => {
  let calls = 0
  const compress: Compress = (plain, encoding) => {
    calls += 1
    return calls === 1 ? Promise.reject(new Error("zlib failed")) : compressedOffLoop(plain, encoding)
  }
  const files = createDataFiles(await snapshot("failing"), { ...LIMITS, compressions: 1 }, compress)
  const failed = await Promise.allSettled([files.get(VERSION, path("a.csv"), "br"), files.get(VERSION, path("a.csv"), "br")])
  assert.deepEqual(
    failed.map(outcome => (outcome.status === "rejected" ? String(outcome.reason) : "served")),
    ["Error: zlib failed", "Error: zlib failed"],
  )
  assert.equal(brotliDecompressSync(compressedOf(await files.get(VERSION, path("a.csv"), "br"), "a.csv tried again")).toString(), CSV)
  assert.equal(calls, 2)
})
