export function readParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name)
}

export function writeParam(name: string, value: string | null): void {
  history.replaceState(history.state, "", withParam(name, value))
}

export function pushParam(name: string, value: string, state: object): void {
  history.pushState(state, "", withParam(name, value))
}

function withParam(name: string, value: string | null): string {
  const params = new URLSearchParams(location.search)
  if (value === null) params.delete(name)
  else params.set(name, value)
  const search = params.toString()
  return search ? `?${search}` : location.pathname
}
