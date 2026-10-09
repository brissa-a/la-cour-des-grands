import { MISSING, type Coloring } from "../coloring/coloring.ts"
import type { Civility, ConstituencyLabel, Deputy, DeputyId } from "../data/assembly.ts"

export const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

export type ViewValue = { label: string; caption: string | null; color: string; missing: boolean }

export function viewValue(coloring: Coloring, id: DeputyId): ViewValue {
  const value = coloring.valueOf(id)
  const color = coloring.colorOf(id)
  const caption = captionFor(coloring, value)
  if (value === MISSING) return { label: "Non renseigné", caption, color, missing: true }
  if (coloring.kind === "category") {
    const item = coloring.items.find(i => i.value === value)
    return { label: item?.label ?? value, caption, color, missing: false }
  }
  const unit = coloring.unit ? ` ${coloring.unit}` : ""
  return { label: `${numberFormat.format(Number(value))}${unit}`, caption, color, missing: false }
}

export function captionFor(coloring: Coloring, value: string): string | null {
  const selfEvident = value !== MISSING && (coloring.kind === "category" || coloring.unit !== "")
  return selfEvident ? null : coloring.title
}

export function constituencyShort(label: ConstituencyLabel): string {
  return `${label.department} (${label.department_number}) · ${ordinal(label.constituency_number)} circ.`
}

export function constituencyLong(label: ConstituencyLabel): string {
  return `${label.department} (${label.department_number}), ${ordinal(label.constituency_number)} circonscription`
}

export function ordinal(number: string): string {
  return number === "1" ? "1ʳᵉ" : `${number}ᵉ`
}

const BORN: Record<Civility, string> = { "M.": "Né", Mme: "Née" }

const longDateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })

export function birth(deputy: Pick<Deputy, "civility" | "birth_date">): string {
  return `${BORN[deputy.civility]} le ${longDate(deputy.birth_date)}`
}

function longDate(isoDate: string): string {
  return longDateFormat
    .formatToParts(new Date(isoDate))
    .map(part => (part.type === "day" && part.value === "1" ? "1ᵉʳ" : part.value))
    .join("")
}

export function initials(deputy: Deputy): string {
  return `${deputy.first_name.charAt(0)}${deputy.last_name.charAt(0)}`
}
