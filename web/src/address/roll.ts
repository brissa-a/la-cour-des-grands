import { constituencyList, type CommuneCode, type ConstituencyCode } from "./codes.ts"
import { numberKey, streetKeys, type RollKeys } from "./keys.ts"

export const ROLL_COLUMNS = ["address", "number", "constituencies"] as const

export function rollFile(commune: CommuneCode): string {
  return `communes/addresses/${commune}.csv`
}

type StreetIndex = {
  byNumberAndStreet: ReadonlyMap<string, readonly ConstituencyCode[]>
  byStreet: ReadonlyMap<string, { constituencies: readonly ConstituencyCode[]; hasNumberRows: boolean }>
}

export type Roll = { exact: StreetIndex; loose: StreetIndex }

export type RollMatch =
  | { kind: "address" | "street" | "mixed-street"; constituencies: readonly ConstituencyCode[] }
  | { kind: "none" }

type IndexBuilder = {
  byNumberAndStreet: Map<string, Set<ConstituencyCode>>
  byStreet: Map<string, { constituencies: Set<ConstituencyCode>; hasNumberRows: boolean }>
}

export function parseRoll(rows: readonly { address: string; number: string; constituencies: string }[], file: string): Roll {
  const exact = indexBuilder()
  const loose = indexBuilder()
  for (const { address, number, constituencies } of rows) {
    if (number !== "" && !address.startsWith(`${number} `)) throw new Error(`${file}: "${address}" does not start with its number "${number}"`)
    const codes = constituencyList(constituencies, `${file} ${address}`)
    const street = streetKeys(number === "" ? address : address.slice(number.length + 1))
    const key = number === "" ? null : numberKey(number)
    addRow(exact, street.exact, key, codes)
    addRow(loose, street.loose, key, codes)
  }
  return { exact: freeze(exact), loose: freeze(loose) }
}

function indexBuilder(): IndexBuilder {
  return { byNumberAndStreet: new Map(), byStreet: new Map() }
}

function addRow(index: IndexBuilder, street: string, number: string | null, codes: readonly ConstituencyCode[]) {
  const entry = index.byStreet.get(street) ?? { constituencies: new Set(), hasNumberRows: false }
  index.byStreet.set(street, entry)
  addAll(entry.constituencies, codes)
  if (number === null) return
  entry.hasNumberRows = true
  const key = `${number} ${street}`
  index.byNumberAndStreet.set(key, addAll(index.byNumberAndStreet.get(key) ?? new Set(), codes))
}

function freeze(index: IndexBuilder): StreetIndex {
  return {
    byNumberAndStreet: new Map([...index.byNumberAndStreet].map(([key, codes]) => [key, [...codes]])),
    byStreet: new Map([...index.byStreet].map(([key, entry]) => [key, { ...entry, constituencies: [...entry.constituencies] }])),
  }
}

function addAll<T>(set: Set<T>, values: readonly T[]): Set<T> {
  for (const value of values) set.add(value)
  return set
}

// Brackets name the former commune in merged communes, so a street spelled with them is matched on its own before homonyms are merged.
export function findInRoll(roll: Roll, { number, street }: RollKeys): RollMatch {
  const [index, key] = roll.exact.byStreet.has(street.exact) ? [roll.exact, street.exact] : [roll.loose, street.loose]
  const address = number === null ? undefined : index.byNumberAndStreet.get(`${number} ${key}`)
  if (address) return { kind: "address", constituencies: address }
  const whole = index.byStreet.get(key)
  if (whole && !whole.hasNumberRows && whole.constituencies.length === 1) return { kind: "street", constituencies: whole.constituencies }
  if (whole && number === null) return { kind: "mixed-street", constituencies: whole.constituencies }
  return { kind: "none" }
}
