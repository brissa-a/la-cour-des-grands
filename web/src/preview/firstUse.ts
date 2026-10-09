const KEY = "lcdg:panel-opened"

let openedInSession = false

export function hasOpenedPanel(): boolean {
  if (openedInSession) return true
  try {
    return localStorage.getItem(KEY) === "1"
  } catch {
    return false
  }
}

export function rememberPanelOpened(): void {
  openedInSession = true
  try {
    localStorage.setItem(KEY, "1")
  } catch {
    // Private browsing or blocked storage: the hint comes back next visit.
  }
}
