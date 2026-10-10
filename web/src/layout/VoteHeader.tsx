import { POSITION_COLORS } from "../sources/views.ts"
import type { DeputyId } from "../data/assembly.ts"
import { cardShown, usePreview, type PreviewStore } from "../preview/previewStore.ts"
import { longDate } from "../profile/format.ts"
import type { VotePosition } from "../votes/positions.ts"
import type { VoteView } from "../votes/useVoteView.ts"
import { voteTitle, type VoteKind } from "../votes/votes.ts"

const ALWAYS_SHOWN: Readonly<Record<VoteKind, readonly VotePosition[]>> = {
  ordinary: ["for", "against", "abstain"],
  solemn: ["for", "against", "abstain"],
  censure_motion: ["for"],
}

type Props = {
  view: Exclude<VoteView, { status: "none" }>
  unplaced: number
  legend: boolean
  store: PreviewStore
  selected: DeputyId | null
  onHover: (position: VotePosition | null) => void
}

export function VoteHeader({ view, unplaced, legend, store, selected, onHover }: Props) {
  const { target, card } = usePreview(store)
  const ready = view.status === "loading" ? view.previous : view.status === "ready" ? view : null
  if (ready === null) {
    const message = view.status === "loading" ? "Chargement du scrutin…" : "Scrutin indisponible."
    return (
      <p className="vote-header vote-status panel" data-obstacle="">
        {message}
      </p>
    )
  }

  const { vote, table, reading } = ready.read
  const focused = target ?? (cardShown(card, selected) ? card.id : null)
  const lit = focused === null ? undefined : reading.positions.get(focused)
  const chosen = selected === null ? undefined : reading.positions.get(selected)
  const positions = table.order.filter(p => reading.tally[p] > 0 || ALWAYS_SHOWN[vote.kind].includes(p))

  return (
    <section className={`vote-header panel${view.status === "loading" ? " pending" : ""}`} aria-label="Scrutin" data-obstacle="">
      <p className="vote-meta">
        <span className={`vote-outcome ${vote.result}`}>{ready.labels.result[vote.result]}</span>
        <time dateTime={vote.date}>{longDate(vote.date)}</time>
        <span>{ready.labels.kind[vote.kind]}</span>
        <a href={vote.url} target="_blank" rel="noreferrer">
          n° {vote.number} <span className="fact-label">sur le site de l'Assemblée ↗</span>
        </a>
      </p>
      <h2 className="vote-title" title={voteTitle(vote)}>
        {voteTitle(vote)}
      </h2>
      <ul className="vote-counts" onPointerLeave={() => onHover(null)}>
        {positions.map(position => {
          const classes = [legend && position === lit && "lit", legend && position === chosen && "chosen"].filter(Boolean).join(" ")
          return (
            <li key={position} className={classes || undefined} onPointerEnter={() => onHover(position)}>
              {legend && <span className="legend-dot" style={{ background: POSITION_COLORS[position] }} />}
              <span className="vote-count">{reading.tally[position]}</span> {table.label[position]}
            </li>
          )
        })}
      </ul>
      {unplaced > 0 && (
        <p className="vote-note">
          {unplaced} non dessiné{unplaced > 1 ? "s" : ""} · circonscription vacante aujourd'hui, siège inconnu
        </p>
      )}
    </section>
  )
}
