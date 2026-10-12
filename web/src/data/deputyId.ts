export type DeputyId = string & { readonly __brand: "DeputyId" }

export function deputyId(value: string): DeputyId {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: an id is whatever the deputy_id key column of the data files holds, there is no format to check
  return value as DeputyId
}

export function knownDeputy(people: ReadonlyMap<DeputyId, unknown>, value: string | null): DeputyId | null {
  return Array.from(people.keys()).find(id => id === value) ?? null
}
