export type ConstituencyCode = string & { readonly __brand: "ConstituencyCode" }

export type CommuneCode = string & { readonly __brand: "CommuneCode" }

export type AtLeastOne<T> = readonly [T, ...T[]]

export type AtLeastTwo<T> = readonly [T, T, ...T[]]

const CONSTITUENCY = /^(0[1-9]|1\d|2[1-9AB]|[3-8]\d|9[0-5]|97[1-7]|98[678]|099)-[1-9]\d?$/

const COMMUNE = /^(\d{5}|2[AB]\d{3})$/

export function constituencyCode(value: string): ConstituencyCode | null {
  return CONSTITUENCY.test(value) ? (value as ConstituencyCode) : null
}

export function communeCode(value: string): CommuneCode | null {
  return COMMUNE.test(value) ? (value as CommuneCode) : null
}

export function atLeastTwo<T>(values: readonly T[]): AtLeastTwo<T> | null {
  return values.length >= 2 ? (values as AtLeastTwo<T>) : null
}

export function constituencyList(cell: string, where: string): AtLeastOne<ConstituencyCode> {
  const parse = (value: string) => {
    const code = constituencyCode(value)
    if (code === null) throw new Error(`${where}: invalid constituency "${value}"`)
    return code
  }
  const [first = "", ...rest] = cell.split("|")
  const codes: AtLeastOne<ConstituencyCode> = [parse(first), ...rest.map(parse)]
  if (new Set(codes).size !== codes.length) throw new Error(`${where}: duplicate constituency in "${cell}"`)
  return codes
}
