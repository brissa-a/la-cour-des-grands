import { numberFormat } from "../profile/format.ts"
import type { Vote } from "../votes/votes.ts"

export function votePlaceholder(count: number | null): string {
  return count === null ? "n° ou mots du titre" : `${numberFormat.format(count)} scrutins · n° ou mots du titre`
}

export function majorsTitle(votes: readonly Vote[]): string {
  return `${numberFormat.format(votes.filter(vote => vote.major).length)} votes majeurs · les plus récents d'abord`
}
