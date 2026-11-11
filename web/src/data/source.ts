import { POINTER_FILE, pointedVersion } from "./version.ts"

export type ReadText = (path: string) => Promise<string>

export type Snapshot = { readonly root: string; readonly read: ReadText }

export const DATA_FORMAT = "v2"

export const DATA_PATH = `/data/${DATA_FORMAT}/`

export function fetchUnder(root: string, fetcher: (url: string) => Promise<Response> = fetch): ReadText {
  return async path => {
    const response = await fetcher(root + path)
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`)
    return response.text()
  }
}

export async function openSnapshot(fetcher: (url: string) => Promise<Response> = fetch): Promise<Snapshot> {
  const version = pointedVersion(await fetchUnder(DATA_PATH, fetcher)(POINTER_FILE))
  if (version === null) throw new Error(`${POINTER_FILE}: no data version`)
  const root = `${DATA_PATH}${version}/`
  return { root, read: fetchUnder(root, fetcher) }
}
