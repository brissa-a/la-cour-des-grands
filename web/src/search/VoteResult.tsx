import { shortDate } from "../profile/format.ts"
import type { VoteMatch } from "../votes/voteSearch.ts"
import { voteTitle, type Vote, type VoteLabels } from "../votes/votes.ts"
import { Highlight } from "./Highlight.tsx"

type Props = { result: VoteMatch; labels: VoteLabels; onSelect: (vote: Vote) => void }

export function VoteResult({ result, labels, onSelect }: Props) {
  const vote = result.ref
  return (
    <button className="result vote-result" onClick={() => onSelect(vote)}>
      <span className="vote-result-meta">
        <span className="vote-result-number">n° {vote.number}</span> · {shortDate(vote.date)} · {labels.result[vote.result]}
        {vote.kind !== "ordinary" && ` · ${labels.kind[vote.kind]}`}
        {vote.major && " · vote majeur"}
      </span>
      <span className="vote-result-title">
        <Highlight value={voteTitle(vote)} matches={result.matches} />
      </span>
    </button>
  )
}
