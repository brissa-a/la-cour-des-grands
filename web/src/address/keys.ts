import type { PreciseAddress } from "./geocoder.ts"

export type StreetKey = string & { readonly __brand: "StreetKey" }

export type NumberKey = string & { readonly __brand: "NumberKey" }

export type StreetKeys = { exact: StreetKey; loose: StreetKey }

export type RollKeys = { number: NumberKey | null; street: StreetKeys }

export function streetKeys(street: string): StreetKeys {
  return { exact: normalise(street), loose: normalise(street.replace(/\([^)]*\)/g, " ")) }
}

function normalise(text: string): StreetKey {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim() as StreetKey
}

export function numberKey(number: string): NumberKey {
  return number.toLowerCase().replace(/\s+/g, "") as NumberKey
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
