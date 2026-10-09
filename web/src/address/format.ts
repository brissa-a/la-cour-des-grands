import { numberFormat, ordinal } from "../profile/format.ts"
import type { ConstituencyCode } from "./codes.ts"
import type { GeocodedAddress } from "./geocoder.ts"
import type { Basis } from "./lookup.ts"

export const TYPE_MARKERS: Record<Exclude<GeocodedAddress["type"], "housenumber">, string> = {
  street: "voie",
  locality: "lieu-dit",
  municipality: "commune",
}

export function addressLines(address: GeocodedAddress): { name: string; place: string } {
  if (address.type === "municipality") return { name: address.city, place: address.postcode }
  return { name: address.name, place: `${address.postcode} ${address.city}`.trim() }
}

export function addressText(address: GeocodedAddress): string {
  const { name, place } = addressLines(address)
  return place ? `${name}, ${place}` : name
}

export function constituencyOrdinal(code: ConstituencyCode): string {
  return `${ordinal(code.slice(code.lastIndexOf("-") + 1))} circonscription`
}

export function distanceText(meters: number, target: string): string {
  if (meters < 5) return `Sur la limite avec ${target}`
  if (meters >= 1000) return `≈ ${numberFormat.format(Math.round(meters / 100) / 10)} km de ${target}`
  const step = meters < 100 ? 10 : 50
  return `≈ ${Math.round(meters / step) * step} m de ${target}`
}

export const SOURCES: Record<Basis["kind"], string> = {
  commune: "Commune entière",
  contours: "Contours officiels (INSEE, 2022)",
  roll: "Liste électorale (INSEE, 2022)",
  unconfirmed: "Contours officiels (INSEE, 2022)",
}

export const UNCONFIRMED_REASONS: Record<Extract<Basis, { kind: "unconfirmed" }>["reason"], string> = {
  "not-in-roll": "adresse absente de la liste électorale",
  "roll-unavailable": "liste électorale indisponible",
  "several-in-roll": "la liste électorale la rattache à deux circonscriptions",
}

export const ELECTORAL_SITUATION_URL = "https://www.service-public.gouv.fr/particuliers/vosdroits/demarches-et-outils/ISE"
