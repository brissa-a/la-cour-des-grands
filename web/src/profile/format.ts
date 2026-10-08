import { MISSING, type Coloring } from "../coloring/coloring.ts"
import type { Deputy, DeputyId } from "../data/assembly.ts"

export const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

export type ViewValue = { label: string; color: string; missing: boolean }

export function viewValue(coloring: Coloring, id: DeputyId): ViewValue {
  const value = coloring.valueOf(id)
  const color = coloring.colorOf(id)
  if (value === MISSING) return { label: "Non renseigné", color, missing: true }
  if (coloring.kind === "category") {
    const item = coloring.items.find(i => i.value === value)
    return { label: item?.label ?? value, color, missing: false }
  }
  const unit = coloring.unit ? ` ${coloring.unit}` : ""
  return { label: `${numberFormat.format(Number(value))}${unit}`, color, missing: false }
}

export function constituencyShort(deputy: Deputy): string {
  return `${deputy.department} (${deputy.department_number}) · ${ordinal(deputy.constituency_number)} circ.`
}

export function constituencyLong(deputy: Deputy): string {
  return `${deputy.department} (${deputy.department_number}), ${ordinal(deputy.constituency_number)} circonscription`
}

function ordinal(number: string): string {
  return number === "1" ? "1ʳᵉ" : `${number}ᵉ`
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-")
  return `${day}/${month}/${year}`
}

export function initials(deputy: Deputy): string {
  return `${deputy.first_name.charAt(0)}${deputy.last_name.charAt(0)}`
}
