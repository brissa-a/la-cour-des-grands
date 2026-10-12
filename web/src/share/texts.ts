import type { Person } from "../data/assembly.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { IsoDate } from "../data/isoDate.ts"
import { sentenceText, summary } from "../panel/summary.ts"
import { longDate } from "../profile/format.ts"
import type { View } from "../view/view.ts"
import { voteTitle, type Vote, type VoteIndex, type VoteLabels, type VoteResult } from "../votes/votes.ts"
import type { Shared } from "./query.ts"

export type Named = Pick<Person, "first_name" | "last_name">

export type LabeledVote = { readonly vote: Vote; readonly labels: VoteLabels }

export type Outcome = { readonly result: VoteResult; readonly label: string }

export type Band = { readonly title: string; readonly date: string | null; readonly outcome: Outcome | null; readonly deputy: string | null }

export type TextData = { readonly votes: VoteIndex; readonly people: ReadonlyMap<DeputyId, Named>; readonly generated: IsoDate | null }

export type MetaTexts = { readonly title: string; readonly description: string; readonly imageAlt: string }

const PLAIN_LEAD = "Les députés de l'Assemblée nationale"

export function viewPhrase(view: View, vote: Vote | null): string {
  return summary(view, { number: vote?.number ?? null }).map(sentenceText).join(" · ")
}

export function bandOf(view: View, labeled: LabeledVote | null, generated: IsoDate | null, deputy: Named | null): Band {
  const name = deputy && `${deputy.first_name} ${deputy.last_name}`
  if (labeled === null) return { title: viewPhrase(view, null), date: generated && `Données au ${longDate(generated)}`, outcome: null, deputy: name }
  const { vote, labels } = labeled
  return {
    title: voteTitle(vote),
    date: `${labels.kind[vote.kind]} du ${longDate(vote.date)}`,
    outcome: { result: vote.result, label: labels.result[vote.result] },
    deputy: name,
  }
}

export function metaTexts({ view, deputy }: Shared, { votes, people, generated }: TextData): MetaTexts {
  const vote = view.scrutin === null ? null : (votes.byId.get(view.scrutin) ?? null)
  const person = deputy === null ? null : (people.get(deputy) ?? null)
  const band = bandOf(view, vote && { vote, labels: votes.labels }, generated, person)
  const phrase = viewPhrase(view, vote)
  return {
    title: band.deputy === null ? band.title : `${band.deputy} · ${band.title}`,
    description: joined(band.outcome === null ? [PLAIN_LEAD, band.date] : [band.date, band.outcome.label, phrase]),
    imageAlt: joined([phrase, band.outcome && band.title, band.date, band.outcome?.label ?? null, band.deputy && `Un cercle désigne ${band.deputy}`]),
  }
}

function joined(parts: readonly (string | null)[]): string {
  return parts.filter(part => part !== null).join(" · ")
}
