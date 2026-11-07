export type SnapshotPath = string & { readonly __brand: "SnapshotPath" }

export type PhotoUrl = string & { readonly __brand: "PhotoUrl" }

const SEGMENT = /^[\w-][\w.-]*$/

export function snapshotPath(text: string): SnapshotPath | null {
  if (!text.split("/").every(segment => SEGMENT.test(segment))) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: every segment is a plain ASCII name that starts with neither a dot nor a slash, so the path stays inside the snapshot and names no hidden file
  return text as SnapshotPath
}

export function photoUrl(snapshotRoot: string, column: string): PhotoUrl | null {
  const path = snapshotPath(column)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: a path checked by snapshotPath, resolved against the root of the version it was read from
  return path === null ? null : (`${snapshotRoot}${path}` as PhotoUrl)
}
