import assert from "node:assert/strict"
import { mkdir, mkdtemp, readdir, rm, unlink, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { after, test } from "node:test"
import { imageKey, type ImageKey } from "./canonical.ts"
import { openDiskCache } from "./disk.ts"
import { given, NEW, OLD, viewOf } from "./fixture.test.ts"
import type { DataVersion } from "./version.ts"

const scratch = await mkdtemp(join(tmpdir(), "og-disk-"))
after(() => rm(scratch, { recursive: true, force: true }))

const QUERIES = ["", "vote=VTANR5L17V1", "vote=VTANR5L17V242", "deputy=PA720892", "deputy=PA720614", "showPic=true"].map(search => viewOf(search).query)

function key(version: DataVersion, index: number): ImageKey {
  return imageKey(version, given(QUERIES[index], `query ${index}`))
}

const IMAGE = new Uint8Array(10).fill(0xff)

async function present(cache: { has: (key: ImageKey) => Promise<boolean> }, keys: readonly ImageKey[]): Promise<boolean[]> {
  return Promise.all(keys.map(one => cache.has(one)))
}

test("an image put in the cache comes back byte for byte, under its version, without a temporary file left behind", async () => {
  const root = join(scratch, "roundtrip")
  const cache = await openDiskCache(root, 1_000, () => NEW)
  assert.equal(await cache.get(key(NEW, 0)), null)
  await cache.put(key(NEW, 0), IMAGE)
  assert.deepEqual(new Uint8Array((await cache.get(key(NEW, 0))) ?? []), IMAGE)
  assert.equal(await cache.get(key(OLD, 0)), null)
  assert.deepEqual(await readdir(join(root, NEW)), [`${key(NEW, 0).hash}.jpg`])
  await cache.put(key(NEW, 0), IMAGE)
  assert.equal(cache.bytes(), 10)
})

test("an image deleted behind the cache's back is a miss and leaves the count", async () => {
  const root = join(scratch, "deleted")
  const cache = await openDiskCache(root, 1_000, () => NEW)
  await cache.put(key(NEW, 0), IMAGE)
  await unlink(join(root, NEW, `${key(NEW, 0).hash}.jpg`))
  assert.equal(await cache.get(key(NEW, 0)), null)
  assert.equal(cache.bytes(), 0)
})

test("past its bound the cache drops the images of older versions first, even recently read ones, then the least recently read of the current one", async () => {
  const cache = await openDiskCache(join(scratch, "bound"), 30, () => NEW)
  const [c, d, oldA, e, f] = [key(NEW, 2), key(NEW, 3), key(OLD, 0), key(NEW, 4), key(NEW, 5)]
  for (const one of [c, d, oldA]) await cache.put(one, IMAGE)
  await cache.get(c)
  await cache.put(e, IMAGE)
  assert.deepEqual(await present(cache, [c, d, oldA, e]), [true, true, false, true])
  await cache.put(f, IMAGE)
  assert.deepEqual(await present(cache, [c, d, e, f]), [true, false, true, true])
  assert.equal(cache.bytes(), 30)
})

test("a restarted service counts the images already on disk and drops the oldest written first", async () => {
  const root = join(scratch, "restart")
  const first = await openDiskCache(root, 1_000, () => NEW)
  for (const index of [0, 1, 2]) await first.put(key(NEW, index), IMAGE)
  const at = Date.now() / 1000
  for (const [index, age] of [[0, 10], [1, 30], [2, 20]] as const) await utimes(join(root, NEW, `${key(NEW, index).hash}.jpg`), at - age, at - age)
  await writeFile(join(root, NEW, `${key(NEW, 4).hash}.jpg.0c1d.tmp`), "half written")
  await writeFile(join(root, NEW, `x${key(NEW, 4).hash}.jpg`), "stray")
  await mkdir(join(root, NEW, `${key(NEW, 5).hash}.jpg`))
  await writeFile(join(root, "notes.txt"), "stray")
  const reopened = await openDiskCache(root, 30, () => NEW)
  assert.equal(reopened.bytes(), 30)
  await reopened.put(key(NEW, 3), IMAGE)
  assert.deepEqual(await present(reopened, [key(NEW, 0), key(NEW, 1), key(NEW, 2), key(NEW, 3)]), [true, false, true, true])
})

test("keeping the retained versions deletes every other version's images from disk and from the count", async () => {
  const root = join(scratch, "keep")
  const cache = await openDiskCache(root, 1_000, () => NEW)
  await cache.put(key(OLD, 0), IMAGE)
  await cache.put(key(NEW, 1), IMAGE.subarray(0, 7))
  await writeFile(join(root, "notes.txt"), "stray")
  await cache.keep([NEW])
  assert.deepEqual(await readdir(root), [NEW])
  assert.deepEqual(await present(cache, [key(OLD, 0), key(NEW, 1)]), [false, true])
  assert.equal(cache.bytes(), 7)
})
