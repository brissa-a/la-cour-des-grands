import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { brotliCompressSync, brotliDecompressSync, gunzipSync } from "node:zlib"
import { bodyFor, encoded, loadSite, preferredEncoding, siteFile } from "./site.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-site-"))
after(() => rm(scratch, { recursive: true, force: true }))

const SCRIPT = "export const answer = 42\n".repeat(50)

const KINDS = [
  [".css", "text/css; charset=utf-8", true],
  [".html", "text/html; charset=utf-8", true],
  [".ico", "image/x-icon", true],
  [".jpg", "image/jpeg", false],
  [".js", "text/javascript; charset=utf-8", true],
  [".json", "application/json", true],
  [".png", "image/png", false],
  [".svg", "image/svg+xml", true],
  [".txt", "text/plain; charset=utf-8", true],
  [".webp", "image/webp", false],
  [".woff2", "font/woff2", false],
  [".PNG", "image/png", false],
  [".bin", "application/octet-stream", false],
] as const

async function builtFront(): Promise<string> {
  const dist = join(scratch, "dist")
  const outside = join(scratch, "outside")
  await mkdir(join(dist, "assets"), { recursive: true })
  await mkdir(outside)
  await writeFile(join(outside, "secret.txt"), "secret")
  await writeFile(join(dist, "index.html"), '<!doctype html><head><meta charset="utf-8" /></head>')
  await writeFile(join(dist, "assets", "index-Dha1ylb_.js"), SCRIPT)
  await writeFile(join(dist, "assets", "roboto-ccAYIvAh.woff2"), "wOF2")
  await writeFile(join(dist, "logo-gris.png"), "PNG")
  await writeFile(join(dist, "notes.unknown"), "?")
  await mkdir(join(dist, "kinds"))
  for (const [index, [extension]] of KINDS.entries()) await writeFile(join(dist, "kinds", `${index}${extension}`), "x".repeat(200))
  await writeFile(join(dist, ".DS_Store"), "x")
  await symlink(join(outside, "secret.txt"), join(dist, "secret.txt"))
  await symlink(outside, join(dist, "linked"))
  return dist
}

const SITE = await loadSite(await builtFront())

test("the build is served as the files it holds, never through a link that leaves it, nor its hidden files, nor index.html as a file", () => {
  assert.deepEqual(
    [...SITE.assets.keys()].filter(path => !path.startsWith("/kinds/")).toSorted((a, b) => a.localeCompare(b)),
    ["/assets/index-Dha1ylb_.js", "/assets/roboto-ccAYIvAh.woff2", "/logo-gris.png", "/notes.unknown"],
  )
  assert.equal(SITE.index, '<!doctype html><head><meta charset="utf-8" /></head>')
})

test("each file goes out with its type, and only the hashed assets are cached for good", () => {
  const described = [...SITE.assets]
    .filter(([path]) => !path.startsWith("/kinds/"))
    .map(([path, { type, cacheControl }]) => [path, type, cacheControl])
    .toSorted(([a = ""], [b = ""]) => a.localeCompare(b))
  assert.deepEqual(described, [
    ["/assets/index-Dha1ylb_.js", "text/javascript; charset=utf-8", "public, max-age=31536000, immutable"],
    ["/assets/roboto-ccAYIvAh.woff2", "font/woff2", "public, max-age=31536000, immutable"],
    ["/logo-gris.png", "image/png", "public, max-age=3600"],
    ["/notes.unknown", "application/octet-stream", "public, max-age=3600"],
  ])
})

test("each kind of file the front may hold gets its media type, and only text-like kinds are compressed", () => {
  for (const [index, [extension, type, compressed]] of KINDS.entries()) {
    const asset = SITE.assets.get(`/kinds/${index}${extension}`)
    assert.deepEqual([asset?.type, asset?.bodies.compressed !== null], [type, compressed], extension)
  }
})

test("text files are sent compressed in the encoding the client prefers, and decode to the same bytes; images are sent as they are", () => {
  const script = SITE.assets.get("/assets/index-Dha1ylb_.js")
  assert.ok(script)
  const br = bodyFor(script.bodies, "br")
  const gzip = bodyFor(script.bodies, "gzip")
  assert.equal(br.encoding, "br")
  assert.equal(brotliDecompressSync(br.body).toString(), SCRIPT)
  assert.equal(gunzipSync(gzip.body).toString(), SCRIPT)
  assert.ok(br.body.length < SCRIPT.length / 10)
  assert.deepEqual(bodyFor(script.bodies, "identity"), { encoding: "identity", body: Buffer.from(SCRIPT) })
  const logo = SITE.assets.get("/logo-gris.png")
  assert.ok(logo)
  assert.deepEqual(bodyFor(logo.bodies, "br"), { encoding: "identity", body: Buffer.from("PNG") })
})

test("the client's Accept-Encoding picks brotli, then gzip, then nothing, honouring q=0 and the wildcard", () => {
  const cases: readonly (readonly [string | undefined, string])[] = [
    ["gzip, deflate, br, zstd", "br"],
    ["gzip", "gzip"],
    ["br;q=0, gzip;q=0.5", "gzip"],
    ["BR", "br"],
    ["*", "br"],
    ["*;q=0, gzip", "gzip"],
    ["gzip;q=0", "identity"],
    ["gzip;level=1", "gzip"],
    ["identity", "identity"],
    ["", "identity"],
    [undefined, "identity"],
  ]
  for (const [header, encoding] of cases) assert.equal(preferredEncoding(header), encoding, header)
})

test("the capture browser gets index.html at the root and the build's files by their path", () => {
  assert.deepEqual(siteFile(SITE, "/"), { type: "text/html; charset=utf-8", body: Buffer.from(SITE.index) })
  assert.deepEqual(siteFile(SITE, "/logo-gris.png"), { type: "image/png", body: Buffer.from("PNG") })
  assert.equal(siteFile(SITE, "/index.html"), null)
  assert.equal(siteFile(SITE, "/linked/secret.txt"), null)
})

test("a build without index.html stops the service at start", async () => {
  const empty = join(scratch, "empty")
  await mkdir(empty)
  await assert.rejects(loadSite(empty), /no index\.html; build the front first/)
})

test("a page, compressed on the event loop as it is sent, costs a small fraction of brotli's default quality and decodes to itself", () => {
  const page = Buffer.from(readFileSync(new URL("../../web/index.html", import.meta.url), "utf8").repeat(2))
  const timed = (compress: () => Buffer) => {
    const started = performance.now()
    for (let round = 0; round < 40; round++) compress()
    return performance.now() - started
  }
  const sent = timed(() => encoded(page, "br"))
  const strongest = timed(() => brotliCompressSync(page))
  assert.ok(sent * 5 < strongest, `${sent.toFixed(1)} ms against ${strongest.toFixed(1)} ms at quality 11`)
  assert.deepEqual(brotliDecompressSync(encoded(page, "br")), page)
  assert.deepEqual(gunzipSync(encoded(page, "gzip")), page)
  assert.equal(encoded(page, "identity"), page)
})
