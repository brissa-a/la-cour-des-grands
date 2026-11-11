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

export type HoldersRead = { readonly kind: "read"; readonly holders: readonly Holder[] } | { readonly kind: "unreadable"; readonly reason: string }

export function readHolders(rows: Iterable<HolderRow>): HoldersRead {
  const holders: Holder[] = []
  for (const row of rows) {
    const where = `${SOURCE}: ${row.id}`
    const constituency = constituencyCode(row.constituency)
    if (constituency === null) return { kind: "unreadable", reason: `${where} has constituency "${row.constituency}"` }
    const periods = readPeriods(row.mandate_periods)
    if ("unreadable" in periods) return { kind: "unreadable", reason: `${where} has mandate period "${periods.unreadable}"` }
    holders.push({ id: row.id, constituency, periods })
  }
  return { kind: "read", holders }
}

export function parseHolders(rows: Iterable<HolderRow>): readonly Holder[] {
  const read = readHolders(rows)
  if (read.kind === "unreadable") throw new Error(read.reason)
  return read.holders
}

function readPeriods(cell: string): AtLeastOne<MandatePeriod> | { readonly unreadable: string } {
  const [firstText = "", ...restTexts] = cell.split(LIST_SEPARATOR)
  const first = parsePeriod(firstText)
  if (first === null) return { unreadable: firstText }
  const rest: MandatePeriod[] = []
  for (const text of restTexts) {
    const period = parsePeriod(text)
    if (period === null) return { unreadable: text }
    rest.push(period)
  }
  return [first, ...rest]
}

function parsePeriod(text: string): MandatePeriod | null {
  const [startText = "", endText, ...extra] = text.split("/")
  const start = isoDate(startText)
  const end = endText ? isoDate(endText) : null
  if (start === null || endText === undefined || extra.length > 0 || (endText !== "" && (end === null || end < start))) return null
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
