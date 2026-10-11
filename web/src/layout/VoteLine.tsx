import { shortDate } from "../profile/format.ts"
import type { VoteView } from "../votes/useVoteView.ts"
import { voteTitle } from "../votes/votes.ts"

export function VoteLine({ view }: { view: Exclude<VoteView, { status: "none" }> }) {
  const ready = view.status === "loading" ? view.previous : view.status === "ready" ? view : null
  if (ready === null) return <p className="vote-line vote-status">{view.status === "loading" ? "Chargement du scrutin…" : "Scrutin indisponible."}</p>
  const { vote } = ready.read
  return (
    <p className={`vote-line${view.status === "loading" ? " pending" : ""}`}>
      <time dateTime={vote.date}>{shortDate(vote.date)}</time>
      <span className="vote-line-title" title={voteTitle(vote)}>
        {voteTitle(vote)}
      </span>
      <span className={`vote-outcome ${vote.result}`}>{ready.labels.result[vote.result]}</span>
    </p>
  )
}
