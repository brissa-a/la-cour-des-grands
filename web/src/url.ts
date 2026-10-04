const SHOW_PHOTOS = "showPic"

export function readShowPhotos(): boolean {
  return new URLSearchParams(location.search).get(SHOW_PHOTOS) === "true"
}

export function writeShowPhotos(show: boolean): void {
  const params = new URLSearchParams(location.search)
  if (show) params.set(SHOW_PHOTOS, "true")
  else params.delete(SHOW_PHOTOS)
  const search = params.toString()
  history.replaceState(null, "", search ? `?${search}` : location.pathname)
}
