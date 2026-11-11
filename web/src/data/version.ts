import { isRecord } from "./json.ts"

export type DataVersion = string & { readonly __brand: "DataVersion" }

export const POINTER_FILE = "current.json"

const VERSION = /^[0-9a-f]{40}$/

export function dataVersion(text: string): DataVersion | null {
  if (!VERSION.test(text)) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: VERSION proves 40 lowercase hex digits, safe in a file path and a URL
  return text as DataVersion
}

export function pointedVersion(pointer: string): DataVersion | null {
  try {
    const json: unknown = JSON.parse(pointer)
    return isRecord(json) && typeof json.version === "string" ? dataVersion(json.version) : null
  } catch {
    return null
  }
}
