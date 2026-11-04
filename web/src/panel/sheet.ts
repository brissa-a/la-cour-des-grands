import { readsVote } from "../view/view.ts"
import type { Offer } from "./rows.ts"
import type { Press } from "./viewState.ts"

const COLLAPSE_MS = 400

export type Sheet = { readonly kind: "closed" | "open" | "collapsing" | "searching"; readonly collapses: number }

export type SheetEvent =
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  | { readonly kind: "pressed"; readonly offer: Offer; readonly press: Press }
  | { readonly kind: "elapsed"; readonly collapse: number }
  | { readonly kind: "search" }
  | { readonly kind: "searched" }

export const CLOSED: Sheet = { kind: "closed", collapses: 0 }

export function sheetAfter(sheet: Sheet, event: SheetEvent): Sheet {
  switch (event.kind) {
    case "open":
      return sheet.kind === "closed" ? { ...sheet, kind: "open" } : sheet
    case "close":
      return sheet.kind === "closed" ? sheet : { ...sheet, kind: "closed" }
    case "pressed":
      return sheet.kind === "open" || sheet.kind === "collapsing" ? afterPress(sheet, event.offer, event.press) : sheet
    case "elapsed":
      return sheet.kind === "collapsing" && sheet.collapses === event.collapse ? { ...sheet, kind: "closed" } : sheet
    case "search":
      return sheet.kind === "closed" ? sheet : { ...sheet, kind: "searching" }
    case "searched":
      return sheet.kind === "searching" ? { ...sheet, kind: "open" } : sheet
  }
}

export function scheduleCollapse(sheet: Sheet, dispatch: (event: SheetEvent) => void, after: (ms: number, run: () => void) => () => void): (() => void) | undefined {
  if (sheet.kind !== "collapsing") return undefined
  const collapse = sheet.collapses
  return after(COLLAPSE_MS, () => dispatch({ kind: "elapsed", collapse }))
}

function afterPress(sheet: Sheet, offer: Offer, press: Press): Sheet {
  switch (press.kind) {
    case "wait":
      return { ...sheet, kind: press.waiting ? "searching" : "open" }
    case "view":
      return readsVote(offer.choice) ? { ...sheet, kind: "open" } : { kind: "collapsing", collapses: sheet.collapses + 1 }
  }
}
