export function readParam(name: string): string | null {
  return new URLSearchParams(location.search).get(name)
}

export function writeParam(name: string, value: string | null): void {
  const params = new URLSearchParams(location.search)
  if (value === null) params.delete(name)
  else params.set(name, value)
  const search = params.toString()
  history.replaceState(null, "", search ? `?${search}` : location.pathname)
}
