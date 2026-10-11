import { FORMS } from "../forms/registry.ts"
import type { Glyph } from "../glyph/glyph.ts"
import { PAINTS } from "../paint/registry.ts"
import { shortDate } from "../profile/format.ts"
import type { View } from "../view/view.ts"
import { layoutPhrase, subjectOf, type ChosenVote } from "./rows.ts"

export type Sentence = { readonly subject: string; readonly phrase: string; readonly glyph: Glyph }

export function summary(view: View, chosen: ChosenVote | null): readonly [color: Sentence, layout: Sentence] {
  return [
    { subject: subjectOf(view.color.of, chosen), phrase: "en couleur", glyph: PAINTS[view.color.paint].glyph },
    { subject: subjectOf(view.layout.picks.main, chosen), phrase: layoutPhrase(view.layout.form), glyph: FORMS[view.layout.form].glyph },
  ]
}

export function sentenceText({ subject, phrase }: Sentence): string {
  return `${subject} ${phrase}`
}

export function composition(date: string, emptySeats: number): string {
  const on = `Composition au ${shortDate(date)}`
  if (emptySeats === 0) return on
  return `${on} · ${emptySeats} siège${emptySeats > 1 ? "s" : ""} vide${emptySeats > 1 ? "s" : ""}`
}
