export type Param = readonly [name: string, value: string | null]

export function readParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name)
}

export function writeParam(name: string, value: string | null): void {
  writeParams([[name, value]])
}

export function writeParams(params: readonly Param[]): void {
  history.replaceState(history.state, "", withParams(params))
}

export function pushParam(name: string, value: string, state: object): void {
  history.pushState(state, "", withParams([[name, value]]))
}

export function withParams(params: readonly Param[], search = location.search, pathname = location.pathname): string {
  const next = new URLSearchParams(search)
  for (const [name, value] of params) {
    if (value === null) next.delete(name)
    else next.set(name, value)
  }
  const query = next.toString()
  return query ? `?${query}` : pathname
}
