import type { LayoutChoice } from "../forms/registry.ts"
import type { ColorChoice } from "../paint/registry.ts"
import { readsVote, viewWithScrutin, VOTE_COLOR, type ReadsVote, type View } from "../view/view.ts"
import type { VoteId } from "../votes/voteId.ts"
import { choiceKey, type Offer } from "./rows.ts"

export type Intent =
  | { readonly channel: "color"; readonly choice: ReadsVote<ColorChoice> }
  | { readonly channel: "layout"; readonly choice: ReadsVote<LayoutChoice> }

export type Pending = { readonly needs: "scrutin"; readonly intent: Intent }

export type Press = { readonly kind: "view"; readonly view: View } | { readonly kind: "wait"; readonly pending: Pending | null }

export function press(offer: Offer, view: View, remembered: VoteId | null, pending: Pending | null): Press {
  if (view.scrutin !== null) return applied(offer, view, view.scrutin)
  if (remembered !== null) return applied(offer, view, remembered)
  switch (offer.channel) {
    case "color":
      if (readsVote(offer.choice)) return wait({ channel: "color", choice: offer.choice }, waitsFor(pending, offer))
      return { kind: "view", view: { scrutin: null, color: offer.choice, layout: view.layout } }
    case "layout":
      if (readsVote(offer.choice)) return wait({ channel: "layout", choice: offer.choice }, waitsFor(pending, offer))
      return { kind: "view", view: { scrutin: null, color: view.color, layout: offer.choice } }
  }
}

export function pick(view: View, pending: Pending | null, scrutin: VoteId): View {
  if (pending === null) return viewWithScrutin(VOTE_COLOR, view.layout, scrutin)
  const { intent } = pending
  switch (intent.channel) {
    case "color":
      return viewWithScrutin(intent.choice, view.layout, scrutin)
    case "layout":
      return viewWithScrutin(view.color, intent.choice, scrutin)
  }
}

export function waitsFor(pending: Pending | null, offer: Offer): boolean {
  return pending !== null && choiceKey(pending.intent.choice) === choiceKey(offer.choice)
}

function applied(offer: Offer, view: View, scrutin: VoteId): Press {
  switch (offer.channel) {
    case "color":
      return { kind: "view", view: viewWithScrutin(offer.choice, view.layout, scrutin) }
    case "layout":
      return { kind: "view", view: viewWithScrutin(view.color, offer.choice, scrutin) }
  }
}

function wait(intent: Intent, again: boolean): Press {
  return { kind: "wait", pending: again ? null : { needs: "scrutin", intent } }
}
