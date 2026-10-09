import type { PreciseAddress } from "./geocoder.ts"

export type StreetKeys = { exact: string; loose: string }

export type RollKeys = { number: string | null; street: StreetKeys }

export function streetKeys(street: string): StreetKeys {
  return { exact: normalise(street), loose: normalise(street.replace(/\([^)]*\)/g, " ")) }
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

export function numberKey(number: string): string {
  return number.toLowerCase().replace(/\s+/g, "")
}

export function keysOf(address: PreciseAddress): RollKeys {
  switch (address.type) {
    case "housenumber":
      return { number: numberKey(address.housenumber), street: streetKeys(address.street) }
    case "street":
      return { number: null, street: streetKeys(address.street) }
    case "locality":
      return { number: null, street: streetKeys(address.locality) }
  }
}
