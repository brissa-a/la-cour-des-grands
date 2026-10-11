import type { View } from "../view/view.ts"
import { unfoldedRow, type LayoutOffer, type Row } from "./rows.ts"

export type Tabs = { readonly row: Row; readonly offers: readonly [LayoutOffer, LayoutOffer, ...LayoutOffer[]] }

export function tabsOf(rows: readonly Row[], view: View): Tabs | null {
  const row = rows.find(candidate => candidate.key === unfoldedRow(view))
  if (row === undefined) return null
  const [first, second, ...rest] = row.layout
  return first && second ? { row, offers: [first, second, ...rest] } : null
}

export function activeRowScroll(row: { readonly top: number; readonly height: number }, viewHeight: number): number {
  return Math.max(0, Math.min(row.top, row.top + row.height - viewHeight))
}
