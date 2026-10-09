import { atLeastTwo, type AtLeastTwo, type CommuneCode, type ConstituencyCode } from "./codes.ts"
import type { CommuneTable } from "./communes.ts"
import type { Contours } from "./contours.ts"
import type { GeocodedAddress } from "./geocoder.ts"
import { rank } from "./geometry.ts"
import { keysOf } from "./keys.ts"
import { findInRoll, type Roll, type RollMatch } from "./roll.ts"

export type Basis =
  | { kind: "commune" }
  | { kind: "contours" }
  | { kind: "roll"; match: "address" | "street" }
  | {
      kind: "unconfirmed"
      other: ConstituencyCode
      otherMeters: number
      reason: "not-in-roll" | "roll-unavailable" | "several-in-roll"
    }

export type Located = { kind: "located"; address: GeocodedAddress; constituency: ConstituencyCode; basis: Basis }

export type Imprecise = {
  kind: "imprecise"
  address: GeocodedAddress
  candidates: AtLeastTwo<ConstituencyCode>
  reason: "municipality" | "mixed-street" | "no-data"
}

export type LookupOutcome =
  | Located
  | Imprecise
  | { kind: "unknown-commune"; address: GeocodedAddress }
  | { kind: "unavailable"; address: GeocodedAddress }

export type LookupSources = {
  communes: () => Promise<CommuneTable>
  contours: () => Promise<Contours>
  roll: (commune: CommuneCode) => Promise<Roll | null>
}

export async function lookup(address: GeocodedAddress, sources: LookupSources, boundaryMeters: number): Promise<LookupOutcome> {
  const located = (constituency: ConstituencyCode, basis: Basis): Located => ({ kind: "located", address, constituency, basis })
  const imprecise = (candidates: AtLeastTwo<ConstituencyCode>, reason: Imprecise["reason"]): Imprecise => ({
    kind: "imprecise",
    address,
    candidates,
    reason,
  })

  let table: CommuneTable
  try {
    table = await sources.communes()
  } catch {
    return { kind: "unavailable", address }
  }
  const unit = address.oldcitycode !== null && table.has(address.oldcitycode) ? address.oldcitycode : address.citycode
  const entry = table.get(unit)
  if (entry === undefined) return { kind: "unknown-commune", address }
  if (entry.kind === "single") return located(entry.constituency, { kind: "commune" })

  const candidates = entry.constituencies
  if (address.type === "municipality") return imprecise(candidates, "municipality")

  const ranking = await sources.contours().then(
    contours => {
      const unitShapes = contours.get(unit)
      return unitShapes === undefined ? null : rank(address.point, unitShapes, candidates)
    },
    () => null,
  )
  const near =
    address.type !== "housenumber" || ranking === null || ranking[0].meters > 0 || ranking[1].meters <= boundaryMeters
  if (!near) return located(ranking[0].constituency, { kind: "contours" })

  const roll = await sources.roll(unit).catch(() => "failed" as const)
  const match: RollMatch = roll === null || roll === "failed" ? { kind: "none" } : findInRoll(roll, keysOf(address))
  const inCommune = match.kind === "none" ? [] : candidates.filter(c => match.constituencies.includes(c))
  const several = atLeastTwo(inCommune)

  if ((match.kind === "address" || match.kind === "street") && inCommune.length === 1) {
    return located(inCommune[0]!, { kind: "roll", match: match.kind })
  }
  if (match.kind === "mixed-street") return imprecise(several ?? candidates, "mixed-street")
  if (ranking === null) return imprecise(several ?? candidates, "no-data")

  const reason = several ? "several-in-roll" : roll === "failed" ? "roll-unavailable" : "not-in-roll"
  const [first, other] = (several && atLeastTwo(ranking.filter(r => several.includes(r.constituency)))) ?? ranking
  return located(first.constituency, { kind: "unconfirmed", other: other.constituency, otherMeters: other.meters, reason })
}
