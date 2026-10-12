import { randomUUID } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { ImageKey, RenderId } from "./canonical.ts"
import { sizedLru } from "./lru.ts"
import type { DataVersion } from "./version.ts"

export type DiskCache = {
  readonly has: (key: ImageKey) => Promise<boolean>
  readonly get: (key: ImageKey) => Promise<Buffer | null>
  readonly put: (key: ImageKey, jpeg: Uint8Array) => Promise<void>
  readonly keep: (versions: readonly DataVersion[]) => Promise<void>
  readonly bytes: () => number
}

const IMAGE_FILE = /^[0-9a-f]{64}\.jpg$/

const TEMPORARY_FILE = /\.tmp$/

export async function writeAtomically(file: string, content: Uint8Array | string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, content)
    await rename(temporary, file)
  } catch (error) {
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}

export async function removeTemporaries(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true }))
    if (entry.isFile() && TEMPORARY_FILE.test(entry.name)) await unlink(join(directory, entry.name)).catch(() => undefined)
}

// One folder per data version and render: a new front build or capture setting never serves an image drawn by the old one.
export async function openDiskCache(root: string, maxBytes: number, render: RenderId, current: () => DataVersion | null): Promise<DiskCache> {
  const order = sizedLru<string>()
  const folderOf = (version: DataVersion) => `${version}-${render}`
  const nameOf = ({ version, hash }: ImageKey) => `${folderOf(version)}/${hash}.jpg`
  const inFolder = (name: string) => name.slice(0, name.indexOf("/"))
  await mkdir(root, { recursive: true })
  await indexExisting(root, (name, size) => order.set(name, size))

  return {
    has: key =>
      stat(join(root, nameOf(key))).then(
        () => true,
        () => false,
      ),
    get: async key => {
      const name = nameOf(key)
      try {
        const jpeg = await readFile(join(root, name))
        order.touch(name)
        return jpeg
      } catch {
        order.delete(name)
        return null
      }
    },
    put: async (key, jpeg) => {
      const name = nameOf(key)
      await mkdir(join(root, folderOf(key.version)), { recursive: true })
      await writeAtomically(join(root, name), jpeg)
      order.set(name, jpeg.byteLength)
      const now = current()
      const live = now === null ? null : folderOf(now)
      for (const evicted of order.evict(maxBytes, other => inFolder(other) !== live)) await unlink(join(root, evicted)).catch(() => undefined)
    },
    keep: async versions => {
      const kept = new Set(versions.map(folderOf))
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (kept.has(entry.name)) continue
        await rm(join(root, entry.name), { recursive: true })
      }
      order.deleteWhere(name => !kept.has(inFolder(name)))
    },
    bytes: order.bytes,
  }
}

async function indexExisting(root: string, add: (name: string, size: number) => void): Promise<void> {
  const found: { readonly name: string; readonly size: number; readonly at: number }[] = []
  for (const folder of await readdir(root, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue
    await removeTemporaries(join(root, folder.name))
    for (const file of await readdir(join(root, folder.name), { withFileTypes: true })) {
      if (!file.isFile() || !IMAGE_FILE.test(file.name)) continue
      const name = `${folder.name}/${file.name}`
      const { size, mtimeMs } = await stat(join(root, name))
      found.push({ name, size, at: mtimeMs })
    }
  }
  for (const { name, size } of found.toSorted((a, b) => a.at - b.at)) add(name, size)
}
