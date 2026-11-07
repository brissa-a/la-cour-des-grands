import type { DataVersion } from "../../web/src/data/version.ts"
import { sizedLru } from "./lru.ts"
import { compressedOffLoop, type Encoding } from "./site.ts"
import { readSnapshotFile, type DataFile } from "./snapshot.ts"

export type DataBody = { readonly type: string; readonly encoding: Encoding; readonly body: Buffer; readonly varies: boolean }

export type DataFiles = { readonly get: (version: DataVersion, file: DataFile, accepted: Encoding) => Promise<DataBody | null> }

// A version's files never change: their compressed bodies are kept in memory, the plain ones are left to the system's page cache.
export function createDataFiles(root: string, maxBytes: number): DataFiles {
  const kept = new Map<string, Buffer>()
  const order = sizedLru<string>()

  async function compressed(version: DataVersion, { path }: DataFile, encoding: "br" | "gzip"): Promise<Buffer | null> {
    const key = `${version}/${path} ${encoding}`
    const hit = kept.get(key)
    if (hit !== undefined) {
      order.touch(key)
      return hit
    }
    const plain = await readSnapshotFile(root, version, path)
    if (plain === null) return null
    const body = await compressedOffLoop(plain, encoding)
    kept.set(key, body)
    order.set(key, body.length)
    for (const evicted of order.evict(maxBytes, () => false)) kept.delete(evicted)
    return body
  }

  return {
    get: async (version, file, accepted) => {
      const { type, compress } = file.type
      if (!compress || accepted === "identity") {
        const body = await readSnapshotFile(root, version, file.path)
        return body && { type, encoding: "identity", body, varies: compress }
      }
      const body = await compressed(version, file, accepted)
      return body && { type, encoding: accepted, body, varies: true }
    },
  }
}
