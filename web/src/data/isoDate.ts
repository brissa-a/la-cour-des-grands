export type IsoDate = string & { readonly __brand: "IsoDate" }

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export function isoDate(value: string): IsoDate | null {
  if (!ISO_DATE.test(value)) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the ISO_DATE test above proves the format, so dates compare as strings
  return value as IsoDate
}
