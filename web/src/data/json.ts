export type JsonRecord = Readonly<Record<string, unknown>>

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value)
}
