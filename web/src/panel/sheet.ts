import { readsVote } from "../view/view.ts"
import type { Press } from "./intent.ts"
import type { Offer } from "./rows.ts"

export const COLLAPSE_MS = 400

export type Sheet =
  | { readonly kind: "closed" }
  | { readonly kind: "open" }
  | { readonly kind: "collapsing"; readonly tap: number }
  | { readonly kind: "searching" }

export type SheetEvent =
  | { readonly kind: "open" }
  | { readonly kind: "close" }
  | { readonly kind: "pressed"; readonly offer: Offer; readonly press: Press }
  | { readonly kind: "elapsed"; readonly tap: number }
  | { readonly kind: "search" }
  | { readonly kind: "searched" }

export const CLOSED: Sheet = { kind: "closed" }

const OPEN: Sheet = { kind: "open" }

export function sheetAfter(sheet: Sheet, event: SheetEvent): Sheet {
  switch (event.kind) {
    case "open":
      return sheet.kind === "closed" ? OPEN : sheet
    case "close":
      return CLOSED
    case "pressed":
      return sheet.kind === "open" || sheet.kind === "collapsing" ? afterPress(sheet, event.offer, event.press) : sheet
    case "elapsed":
      return sheet.kind === "collapsing" && sheet.tap === event.tap ? CLOSED : sheet
    case "search":
      return sheet.kind === "closed" ? sheet : { kind: "searching" }
    case "searched":
      return sheet.kind === "searching" ? OPEN : sheet
  }
}

export function hasControls(offer: Offer): boolean {
  return readsVote(offer.choice)
}

export function scheduleCollapse(sheet: Sheet, dispatch: (event: SheetEvent) => void, after: (ms: number, run: () => void) => () => void): (() => void) | undefined {
  if (sheet.kind !== "collapsing") return undefined
  const { tap } = sheet
  return after(COLLAPSE_MS, () => dispatch({ kind: "elapsed", tap }))
}

function afterPress(sheet: Extract<Sheet, { kind: "open" | "collapsing" }>, offer: Offer, press: Press): Sheet {
  switch (press.kind) {
    case "wait":
      return press.pending === null ? OPEN : { kind: "searching" }
    case "view":
      return hasControls(offer) ? OPEN : { kind: "collapsing", tap: sheet.kind === "collapsing" ? sheet.tap + 1 : 1 }
  }
}
