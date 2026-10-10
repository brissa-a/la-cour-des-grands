import { useEffect, useState } from "react"
import type { ReadVote, VoteSource } from "./sources.ts"
import type { VoteId } from "./voteId.ts"
import type { VoteLabels } from "./votes.ts"

export type ReadyVote = { status: "ready"; read: ReadVote; labels: VoteLabels }

export type VoteView =
  | { status: "none" }
  | { status: "loading"; previous: ReadyVote | null }
  | { status: "missing" | "failed" }
  | ReadyVote

type Settled = { id: VoteId; view: Exclude<VoteView, { status: "none" | "loading" }> }

export function useVoteView(source: VoteSource, id: VoteId | null): VoteView {
  const [settled, setSettled] = useState<Settled | null>(null)

  useEffect(() => {
    if (id === null) return
    let current = true
    const settle = (view: Settled["view"]) => {
      if (current) setSettled({ id, view })
    }
    source
      .index()
      .then(async index => {
        const vote = index.byId.get(id)
        settle(vote ? { status: "ready", read: await source.read(vote), labels: index.labels } : { status: "missing" })
      })
      .catch((error: unknown) => {
        console.error(error)
        settle({ status: "failed" })
      })
    return () => {
      current = false
    }
  }, [source, id])

  if (id === null) return { status: "none" }
  if (settled?.id === id) return settled.view
  return { status: "loading", previous: settled?.view.status === "ready" ? settled.view : null }
}
