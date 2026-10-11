import type { ColorableFeature, FeatureKey } from "../data/features.ts"
import { FORMS, layoutsOf, picksOf, type FormName, type LayoutChoice } from "../forms/registry.ts"
import type { Glyph } from "../glyph/glyph.ts"
import { coloringsOf, PAINTS, type ColorChoice } from "../paint/registry.ts"
import { numberFormat } from "../profile/format.ts"
import { MISSING, SEAT, sourceKey, VOTE, type Data, type Numbers, type Part, type Reading, type Shape, type Source, type VoteSource } from "../sources/shapes.ts"
import { partNoun } from "../sources/views.ts"
import { mainOf, type View } from "../view/view.ts"

export type Channel = "color" | "layout"

export const CHANNELS: readonly Channel[] = ["color", "layout"]

export type Greyed = { readonly needs: "scrutin"; readonly reason: string }

const WAITS_FOR_SCRUTIN: Greyed = { needs: "scrutin", reason: "Choisissez d'abord un scrutin" }

type OfferBase = { readonly label: string; readonly glyph: Glyph; readonly greyed: Greyed | null }

export type ColorOffer = OfferBase & { readonly channel: "color"; readonly choice: ColorChoice }

export type LayoutOffer = OfferBase & { readonly channel: "layout"; readonly choice: LayoutChoice }

export type Offer = ColorOffer | LayoutOffer

export type Figure = { readonly value: string; readonly unit: string }

export type ChosenVote = { readonly number: number | null }

type RowBase = { readonly key: string; readonly name: string; readonly color: readonly ColorOffer[]; readonly layout: readonly LayoutOffer[] }

export type FeatureRow = RowBase & { readonly kind: "feature"; readonly figures: readonly Figure[] }

export type VoteRow = RowBase & { readonly kind: "vote"; readonly chosen: ChosenVote | null }

export type Row = FeatureRow | VoteRow

export type RowInputs = {
  readonly features: readonly ColorableFeature[]
  readonly first: FeatureKey
  readonly reading: (source: Source) => Reading | null
  readonly chosen: ChosenVote | null
}

const LISTED_PARTS = 3

const CHANNEL_WORDS: Readonly<Record<Channel, string>> = { color: "couleur", layout: "disposition" }

export function panelRows({ features, first, reading, chosen }: RowInputs): Row[] {
  const sources = [...features.filter(f => f.key === first), ...features.filter(f => f.key !== first), SEAT]
  const featureRows = sources.map(
    (source): FeatureRow => ({
      kind: "feature",
      key: sourceKey(source),
      name: nameOf(source),
      figures: figuresOf(source, reading(source)),
      color: colorOffers(source, null),
      layout: layoutOffers(source, null),
    }),
  )
  const greyed = chosen === null ? WAITS_FOR_SCRUTIN : null
  const voteRow: VoteRow = {
    kind: "vote",
    key: sourceKey(VOTE),
    name: nameOf(VOTE),
    chosen,
    color: colorOffers(VOTE, greyed),
    layout: layoutOffers(VOTE, greyed),
  }
  return [...featureRows, voteRow]
}

export function nameOf(source: Source): string {
  switch (source.kind) {
    case "category":
    case "number":
      return source.title
    case "seat":
      return "Siège"
    case "vote":
      return "Vote sur un scrutin"
  }
}

export function subjectOf(source: Source, chosen: ChosenVote | null): string {
  return source.kind === "vote" && chosen !== null && chosen.number !== null ? `Vote n° ${chosen.number}` : nameOf(source)
}

export function rowSubject(row: Row): string {
  return row.kind === "vote" ? subjectOf(VOTE, row.chosen) : row.name
}

export function layoutPhrase(form: FormName): string {
  return `en ${FORMS[form].label.toLocaleLowerCase("fr-FR")}`
}

export function offerLabel(row: Row, offer: Offer): string {
  switch (offer.channel) {
    case "color":
      return `${rowSubject(row)} en couleur · ${offer.label}`
    case "layout":
      return `${rowSubject(row)} ${layoutPhrase(offer.choice.form)}`
  }
}

export function choiceKey(choice: ColorChoice | LayoutChoice): string {
  return "of" in choice ? JSON.stringify([choice.paint, sourceKey(choice.of)]) : JSON.stringify([choice.form, ...picksOf(choice).map(sourceKey)])
}

export function pressed(view: View, offer: Offer): boolean {
  return choiceKey(offer.choice) === choiceKey(view[offer.channel])
}

export function holds(view: View, row: Row): Channel[] {
  return CHANNELS.filter(channel => sourceKey(mainOf(view[channel])) === row.key)
}

export function unfoldedRow(view: View): string {
  return sourceKey(view.layout.picks.main)
}

export function replaces(view: View, offer: Offer, chosen: ChosenVote | null): string | null {
  const holder = mainOf(view[offer.channel])
  if (sourceKey(holder) === sourceKey(mainOf(offer.choice))) return null
  return `Remplace ${subjectOf(holder, chosen)} en ${CHANNEL_WORDS[offer.channel]}`
}

export function layoutHint(choice: LayoutChoice, reading: Reading | null): string | null {
  if (reading === null) return null
  const data: Partial<Data> = reading.data
  const shapes: readonly Shape[] = FORMS[choice.form].slots.main
  for (const shape of shapes) {
    const hint = hintOf(shape, data)
    if (hint !== undefined) return hint
  }
  return null
}

const HINTS: { readonly [S in Shape]: (input: Data[S]) => string | null } = {
  nominal: ({ parts }) => fromTo(parts),
  ordinal: ({ parts }) => fromTo(parts),
  turnout: ({ present }) => fromTo(present),
  numbers: () => null,
  seats: () => "Chaque député à sa place",
}

function hintOf<S extends Shape>(shape: S, data: Partial<Pick<Data, S>>): string | null | undefined {
  const input = data[shape]
  return input === undefined ? undefined : HINTS[shape](input)
}

function fromTo(parts: readonly Part[]): string | null {
  const [first, ...rest] = parts.filter(part => part.key !== MISSING)
  if (first === undefined) return null
  const last = rest.at(-1)
  return last === undefined ? first.label : `de ${first.label} à ${last.label}`
}

function colorOffers(source: Source, greyed: Greyed | null): ColorOffer[] {
  return coloringsOf(source).map(choice => ({ channel: "color", choice, label: PAINTS[choice.paint].label, glyph: PAINTS[choice.paint].glyph, greyed }))
}

function layoutOffers(source: Source, greyed: Greyed | null): LayoutOffer[] {
  return layoutsOf(source).map(choice => ({ channel: "layout", choice, label: FORMS[choice.form].label, glyph: FORMS[choice.form].glyph, greyed }))
}

function figuresOf(source: Exclude<Source, VoteSource>, reading: Reading | null): Figure[] {
  const data: Partial<Data> = reading?.data ?? {}
  switch (source.kind) {
    case "category":
      return data.nominal ? partFigures(data.nominal.parts, partNoun(source.key)) : []
    case "number":
      return data.numbers ? rangeFigures(data.numbers) : []
    case "seat":
      return data.seats ? [measure(data.seats.seatOf.size + data.seats.empty.length, "sièges")] : []
  }
}

function partFigures(parts: readonly Part[], noun: string): Figure[] {
  const given = parts.filter(part => part.key !== MISSING)
  if (given.length <= LISTED_PARTS) return given.map(part => measure(part.members.length, part.label))
  return [measure(given.length, noun)]
}

function rangeFigures({ drawn, valueOf, unit }: Numbers): Figure[] {
  const values = drawn.flatMap(id => valueOf(id) ?? [])
  if (values.length === 0) return []
  const min = numberFormat.format(Math.min(...values))
  const max = numberFormat.format(Math.max(...values))
  return [{ value: min === max ? min : `${min}–${max}`, unit }]
}

function measure(count: number, unit: string): Figure {
  return { value: numberFormat.format(count), unit }
}
