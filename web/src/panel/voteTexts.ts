import { numberFormat } from "../profile/format.ts"
import { UNDRAWN_REASONS, type UndrawnReason, type Unplaced } from "../votes/sitting.ts"
import type { Vote } from "../votes/votes.ts"

export function votePlaceholder(count: number | null): string {
  return count === null ? "n° ou mots du titre" : `${numberFormat.format(count)} scrutins · n° ou mots du titre`
}

export function majorsTitle(votes: readonly Vote[]): string {
  return `${numberFormat.format(votes.filter(vote => vote.major).length)} votes majeurs · les plus récents d'abord`
}

const UNDRAWN_TEXTS: Readonly<Record<UndrawnReason, string>> = {
  vacant: "circonscription vacante aujourd'hui, siège inconnu",
  unseated: "siège pas encore attribué",
  unseatedSuccessor: "siège du successeur pas encore attribué",
}

export function undrawnNotes(unplaced: Unplaced): readonly string[] {
  return UNDRAWN_REASONS.flatMap(reason => {
    const count = unplaced[reason]
    return count > 0 ? [`${count} non dessiné${count > 1 ? "s" : ""} · ${UNDRAWN_TEXTS[reason]}`] : []
  })
}
