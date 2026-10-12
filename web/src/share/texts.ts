import type { Person } from "../data/person.ts"
import type { DeputyId } from "../data/deputyId.ts"
import type { IsoDate } from "../data/isoDate.ts"
import { sentenceText, summary } from "../panel/summary.ts"
import { longDate } from "../profile/format.ts"
import type { View } from "../view/view.ts"
import { voteTitle, type Vote, type VoteIndex } from "../votes/votes.ts"
import type { Shared } from "./query.ts"

export type Named = Pick<Person, "first_name" | "last_name">

export type TextData = { readonly votes: VoteIndex; readonly people: ReadonlyMap<DeputyId, Named>; readonly generated: IsoDate | null }

export type MetaTexts = { readonly title: string; readonly description: string; readonly imageAlt: string }

const PLAIN_LEAD = "Les députés de l'Assemblée nationale"

export function viewPhrase(view: View, vote: Vote | null): string {
  return summary(view, { number: vote?.number ?? null }).map(sentenceText).join(" · ")
}

export function metaTexts({ view, deputy }: Shared, { votes, people, generated }: TextData): MetaTexts {
  const vote = view.scrutin === null ? null : (votes.byId.get(view.scrutin) ?? null)
  const person = deputy === null ? null : (people.get(deputy) ?? null)
  const name = person && `${person.first_name} ${person.last_name}`
  const ring = name && `Un cercle désigne ${name}`
  const phrase = viewPhrase(view, vote)
  if (vote === null) {
    const date = generated && `Données au ${longDate(generated)}`
    return { title: joined([name, phrase]), description: joined([PLAIN_LEAD, date]), imageAlt: joined([phrase, date, ring]) }
  }
  const title = voteTitle(vote)
  const date = `${votes.labels.kind[vote.kind]} du ${longDate(vote.date)}`
  const outcome = votes.labels.result[vote.result]
  return { title: joined([name, title]), description: joined([date, outcome, phrase]), imageAlt: joined([phrase, title, date, outcome, ring]) }
}

function joined(parts: readonly (string | null)[]): string {
  return parts.filter(part => part !== null).join(" · ")
}
