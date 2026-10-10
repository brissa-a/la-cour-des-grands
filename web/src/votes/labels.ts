export const LABEL_COLUMNS = ["value", "label_fr"] as const

export type LabelRow = Readonly<Record<(typeof LABEL_COLUMNS)[number], string>>

export function labelReader<V extends string>(rows: readonly LabelRow[], known: readonly V[], table: string): (value: V) => string {
  const labels = new Map<string, string>()
  for (const { value, label_fr } of rows) {
    if (!known.some(k => k === value)) throw new Error(`${table}: unknown value "${value}"`)
    labels.set(value, label_fr)
  }
  return value => {
    const label = labels.get(value)
    if (label === undefined) throw new Error(`${table}: no row for "${value}"`)
    return label
  }
}
