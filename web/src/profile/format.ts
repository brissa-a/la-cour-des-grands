import type { Civility, ConstituencyLabel, Person } from "../data/assembly.ts"

export const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 })

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

export function birth(deputy: Pick<Person, "civility" | "birth_date">): string {
  return `${BORN[deputy.civility]} le ${longDate(deputy.birth_date)}`
}

const shortDateFormat = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

export function shortDate(isoDate: string): string {
  return shortDateFormat.format(new Date(isoDate))
}

export function longDate(isoDate: string): string {
  return longDateFormat
    .formatToParts(new Date(isoDate))
    .map(part => (part.type === "day" && part.value === "1" ? "1ᵉʳ" : part.value))
    .join("")
}

export function initials(deputy: Person): string {
  return `${deputy.first_name.charAt(0)}${deputy.last_name.charAt(0)}`
}
