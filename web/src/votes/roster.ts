import { constituencyCode, type AtLeastOne, type ConstituencyCode } from "../address/codes.ts"
import type { DeputyId } from "../data/deputyId.ts"
import { isoDate, type IsoDate } from "../data/isoDate.ts"
import { LIST_SEPARATOR } from "../data/list.ts"

export type MandatePeriod = { readonly start: IsoDate; readonly end: IsoDate | null }

export type Holder = {
  readonly id: DeputyId
  readonly constituency: ConstituencyCode
  readonly periods: AtLeastOne<MandatePeriod>
}

export type HolderRow = { readonly id: DeputyId; readonly constituency: string; readonly mandate_periods: string }

export type Roster = ReadonlyMap<ConstituencyCode, DeputyId>

const SOURCE = "deputies/init.csv"

const STILL_SITTING = "9999-12-31"

export function parseHolders(rows: Iterable<HolderRow>): Holder[] {
  return Array.from(rows, row => {
    const where = `${SOURCE}: ${row.id}`
    const constituency = constituencyCode(row.constituency)
    if (constituency === null) throw new Error(`${where} has constituency "${row.constituency}"`)
    const [first = "", ...rest] = row.mandate_periods.split(LIST_SEPARATOR)
    return { id: row.id, constituency, periods: [parsePeriod(first, where), ...rest.map(text => parsePeriod(text, where))] }
  })
}

function parsePeriod(text: string, where: string): MandatePeriod {
  const [startText = "", endText, ...extra] = text.split("/")
  const start = isoDate(startText)
  const end = endText ? isoDate(endText) : null
  if (start === null || endText === undefined || extra.length > 0 || (endText !== "" && (end === null || end < start)))
    throw new Error(`${where} has mandate period "${text}"`)
  return { start, end }
}

// Until the pipeline dates mandates from taking office, a substitute's start is the election date it shares with the
// deputy it replaces, while ends are right: of the deputies whose periods cover the date, the one whose period ends first sits.
export function rosterOn(holders: readonly Holder[], date: IsoDate): Roster {
  const sitting = new Map<ConstituencyCode, { id: DeputyId; until: string }>()
  for (const holder of holders) {
    const until = sittingUntil(holder.periods, date)
    if (until === null) continue
    const other = sitting.get(holder.constituency)
    if (other === undefined || until < other.until) sitting.set(holder.constituency, { id: holder.id, until })
  }
  return new Map(Array.from(sitting, ([constituency, { id }]) => [constituency, id]))
}

function sittingUntil(periods: readonly MandatePeriod[], date: IsoDate): string | null {
  let until: string | null = null
  for (const { start, end } of periods) {
    if (date < start || (end !== null && date > end)) continue
    const last = end ?? STILL_SITTING
    if (until === null || last < until) until = last
  }
  return until
}
