export type DeputyId = string & { readonly __brand: "DeputyId" }

export function deputyId(value: string): DeputyId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: an id is whatever the deputy_id key column of the data files holds, there is no format to check
  return value as DeputyId
}
