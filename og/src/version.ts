import { DATA_BRANCH, DATA_REPOSITORY } from "../../web/src/data/source.ts"
import { reasonOf } from "./reason.ts"

export type DataVersion = string & { readonly __brand: "DataVersion" }

const COMMIT_SHA = /^[0-9a-f]{40}$/

export function dataVersion(text: string): DataVersion | null {
  if (!COMMIT_SHA.test(text)) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: COMMIT_SHA proves a full lowercase commit SHA, safe in a file path and a URL
  return text as DataVersion
}

export type VersionCheck =
  | { readonly kind: "found"; readonly version: DataVersion; readonly etag: string | null }
  | { readonly kind: "unchanged" }
  | { readonly kind: "failed"; readonly reason: string }

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>

export const BRANCH_HEAD_URL = `https://api.github.com/repos/${DATA_REPOSITORY}/commits/${DATA_BRANCH}`

const CHECK_TIMEOUT_MS = 10_000

export async function checkVersion(fetcher: Fetcher, etag: string | null): Promise<VersionCheck> {
  const headers: Record<string, string> = { accept: "application/vnd.github.sha", "user-agent": "lcdg-og" }
  if (etag !== null) headers["if-none-match"] = etag
  try {
    const response = await fetcher(BRANCH_HEAD_URL, { headers, signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
    if (response.status === 304) return { kind: "unchanged" }
    if (!response.ok) return { kind: "failed", reason: `HTTP ${response.status}` }
    const text = (await response.text()).trim()
    const version = dataVersion(text)
    if (version === null) return { kind: "failed", reason: `not a commit SHA: ${JSON.stringify(text.slice(0, 60))}` }
    return { kind: "found", version, etag: response.headers.get("etag") }
  } catch (error) {
    return { kind: "failed", reason: reasonOf(error) }
  }
}
