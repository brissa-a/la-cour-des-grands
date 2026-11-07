import { constants } from "node:fs"
import { open, realpath } from "node:fs/promises"
import { join } from "node:path"
import { isRecord } from "../../web/src/data/json.ts"
import { snapshotPath, type SnapshotPath } from "../../web/src/data/snapshotPath.ts"
import { DATA_FORMAT, DATA_PATH, type ReadText } from "../../web/src/data/source.ts"
import { dataVersion, POINTER_FILE, pointedVersion, type DataVersion } from "../../web/src/data/version.ts"
import { reasonOf } from "./reason.ts"

export type DataAddress = { readonly kind: "pointer" } | { readonly kind: "file"; readonly version: DataVersion; readonly path: SnapshotPath }

export type PointerCheck = { readonly kind: "found"; readonly version: DataVersion; readonly pointer: string } | { readonly kind: "failed"; readonly reason: string }

const MISSING: ReadonlySet<unknown> = new Set(["ENOENT", "ENOTDIR", "ELOOP"])

export function dataAddress(pathname: string): DataAddress | null {
  if (!pathname.startsWith(DATA_PATH)) return null
  const inData = pathname.slice(DATA_PATH.length)
  if (inData === POINTER_FILE) return { kind: "pointer" }
  const slash = inData.indexOf("/")
  if (slash === -1) return null
  const version = dataVersion(inData.slice(0, slash))
  const path = snapshotPath(inData.slice(slash + 1))
  return version && path && { kind: "file", version, path }
}

async function readRegularFile(file: string): Promise<Buffer | null> {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    return (await handle.stat()).isFile() ? await handle.readFile() : null
  } finally {
    await handle.close()
  }
}

function missing(error: unknown): boolean {
  return isRecord(error) && MISSING.has(error.code)
}

export async function readPointer(root: string): Promise<PointerCheck> {
  let pointer: string
  try {
    const content = await readRegularFile(join(root, DATA_FORMAT, POINTER_FILE))
    if (content === null) return { kind: "failed", reason: `${POINTER_FILE} is not a file` }
    pointer = content.toString("utf8")
  } catch (error) {
    return { kind: "failed", reason: reasonOf(error) }
  }
  const version = pointedVersion(pointer)
  if (version === null) return { kind: "failed", reason: `${POINTER_FILE} names no version: ${JSON.stringify(pointer.slice(0, 60))}` }
  return { kind: "found", version, pointer }
}

// A snapshot holds regular files and folders only: a link anywhere below the root, even one that stays inside, is not followed.
export async function readSnapshotFile(root: string, version: DataVersion, path: SnapshotPath): Promise<Buffer | null> {
  try {
    const file = join(await realpath(root), DATA_FORMAT, version, path)
    if ((await realpath(file)) !== file) return null
    return await readRegularFile(file)
  } catch (error) {
    if (missing(error)) return null
    throw error
  }
}

export function snapshotReader(root: string, version: DataVersion): ReadText {
  return async path => {
    const checked = snapshotPath(path)
    const content = checked === null ? null : await readSnapshotFile(root, version, checked)
    if (content === null) throw new Error(`${path}: not in the data version ${version}`)
    return content.toString("utf8")
  }
}
