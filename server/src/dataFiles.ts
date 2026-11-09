import type { DataVersion } from "../../web/src/data/version.ts"
import { sizedLru } from "./lru.ts"
import { compressedOffLoop, type Encoding } from "./site.ts"
import { openSnapshotFile, readSnapshotFile, type DataFile, type OpenedFile } from "./snapshot.ts"

export type Compression = Exclude<Encoding, "identity">

export type DataBody = { readonly type: string; readonly varies: boolean } & (
  | { readonly encoding: Compression; readonly body: Buffer }
  | { readonly encoding: "identity"; readonly body: OpenedFile }
)

export type ReadDataFile = (version: DataVersion, file: DataFile) => Promise<Buffer | null>

export type DataFiles = {
  readonly get: (version: DataVersion, file: DataFile, accepted: Encoding) => Promise<DataBody | null>
  readonly read: ReadDataFile
}

export type Compress = (plain: Buffer, encoding: Compression) => Promise<Buffer>

export type DataFilesLimits = { readonly keptBytes: number; readonly compressions: number }

function slots(count: number): <T>(task: () => Promise<T>) => Promise<T> {
  let free = count
  const waiting: (() => void)[] = []
  return async task => {
    if (free > 0) free -= 1
    else await new Promise<void>(resolve => waiting.push(resolve))
    try {
      return await task()
    } finally {
      const next = waiting.shift()
      if (next === undefined) free += 1
      else next()
    }
  }
}

// A version's files never change: a compressed body is made once, however many ask for it at the same time, and kept in memory;
// a plain one is sent from the disk as it is read.
export function createDataFiles(root: string, { keptBytes, compressions }: DataFilesLimits, compress: Compress = compressedOffLoop): DataFiles {
  const kept = new Map<string, Buffer>()
  const order = sizedLru<string>()
  const making = new Map<string, Promise<Buffer | null>>()
  const slot = slots(compressions)
  const read: ReadDataFile = (version, { path }) => readSnapshotFile(root, version, path)

  async function make(key: string, version: DataVersion, file: DataFile, encoding: Compression): Promise<Buffer | null> {
    const plain = await read(version, file)
    if (plain === null) return null
    const body = await compress(plain, encoding)
    kept.set(key, body)
    order.set(key, body.length)
    for (const evicted of order.evict(keptBytes, () => false)) kept.delete(evicted)
    return body
  }

  function compressed(version: DataVersion, file: DataFile, encoding: Compression): Promise<Buffer | null> {
    const key = `${version}/${file.path} ${encoding}`
    const hit = kept.get(key)
    if (hit !== undefined) {
      order.touch(key)
      return Promise.resolve(hit)
    }
    const pending = making.get(key) ?? slot(() => make(key, version, file, encoding)).finally(() => making.delete(key))
    making.set(key, pending)
    return pending
  }

  return {
    get: async (version, file, accepted) => {
      const { type, compress: compressible } = file.type
      if (!compressible || accepted === "identity") {
        const body = await openSnapshotFile(root, version, file.path)
        return body && { type, encoding: "identity", body, varies: compressible }
      }
      const body = await compressed(version, file, accepted)
      return body && { type, encoding: accepted, body, varies: true }
    },
    read,
  }
}
