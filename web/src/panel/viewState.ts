import type { LayoutChoice } from "../forms/registry.ts"
import type { ColorChoice } from "../paint/registry.ts"
import { readsVote, viewWithScrutin, VOTE_COLOR, withoutScrutin, type ParsedView, type Plain, type PlainView, type ReadsVote, type View } from "../view/view.ts"
import type { VoteId } from "../votes/voteId.ts"
import { choiceKey, type Channel, type Offer } from "./rows.ts"

export type Intent =
  | { readonly channel: "color"; readonly choice: ReadsVote<ColorChoice> }
  | { readonly channel: "layout"; readonly choice: ReadsVote<LayoutChoice> }

type Fallback = { readonly fallback: Plain<ColorChoice> }

export type NoVote = Fallback & { readonly kind: "none"; readonly view: PlainView; readonly pending: Intent | null }

export type VoteChosen = Fallback & { readonly kind: "chosen"; readonly vote: VoteId; readonly view: View }

export type ViewState = NoVote | VoteChosen

export type Press = { readonly kind: "view" } | { readonly kind: "wait"; readonly waiting: boolean }

export type Pressed = { readonly state: ViewState; readonly press: Press }

const VIEWED: Press = { kind: "view" }

export function initialState({ view, fallback }: ParsedView): ViewState {
  return view.scrutin === null ? { kind: "none", view, fallback, pending: null } : { kind: "chosen", vote: view.scrutin, view, fallback }
}

export function chosenVote(state: ViewState): VoteId | null {
  return state.kind === "chosen" ? state.vote : null
}

export function pendingIntent(state: ViewState): Intent | null {
  return state.kind === "none" ? state.pending : null
}

export function pressed(state: ViewState, offer: Offer): Pressed {
  switch (state.kind) {
    case "chosen":
      return { state: shown(state, applied(offer, state.view, state.vote)), press: VIEWED }
    case "none":
      return pressedWithoutVote(state, offer)
  }
}

export function picked(state: ViewState, vote: VoteId): VoteChosen {
  return shown({ kind: "chosen", vote, view: state.view, fallback: state.fallback }, pickedView(state.view, pendingIntent(state), vote))
}

export function cleared(state: ViewState): NoVote {
  return { kind: "none", view: withoutScrutin(state.view, state.fallback), fallback: state.fallback, pending: null }
}

export function waitsFor(pending: Intent | null, glyph: { readonly choice: ColorChoice | LayoutChoice }): boolean {
  return pending !== null && choiceKey(pending.choice) === choiceKey(glyph.choice)
}

function pressedWithoutVote(state: NoVote, offer: Offer): Pressed {
  const { view, pending } = state
  switch (offer.channel) {
    case "color":
      if (readsVote(offer.choice)) return waited(state, { channel: "color", choice: offer.choice })
      return {
        state: { ...state, view: { scrutin: null, color: offer.choice, layout: view.layout }, fallback: offer.choice, pending: outlived(pending, "color") },
        press: VIEWED,
      }
    case "layout":
      if (readsVote(offer.choice)) return waited(state, { channel: "layout", choice: offer.choice })
      return { state: { ...state, view: { scrutin: null, color: view.color, layout: offer.choice }, pending: outlived(pending, "layout") }, press: VIEWED }
  }
}

function waited(state: NoVote, intent: Intent): Pressed {
  const again = waitsFor(state.pending, intent)
  return { state: { ...state, pending: again ? null : intent }, press: { kind: "wait", waiting: !again } }
}

function outlived(pending: Intent | null, chosenChannel: Channel): Intent | null {
  return pending?.channel === chosenChannel ? null : pending
}

function shown(state: VoteChosen, view: View): VoteChosen {
  return { ...state, view, fallback: readsVote(view.color) ? state.fallback : view.color }
}

function applied(offer: Offer, view: View, vote: VoteId): View {
  switch (offer.channel) {
    case "color":
      return viewWithScrutin(offer.choice, view.layout, vote)
    case "layout":
      return viewWithScrutin(view.color, offer.choice, vote)
  }
}

function pickedView(view: View, pending: Intent | null, vote: VoteId): View {
  if (pending === null) return viewWithScrutin(VOTE_COLOR, view.layout, vote)
  switch (pending.channel) {
    case "color":
      return viewWithScrutin(pending.choice, view.layout, vote)
    case "layout":
      return viewWithScrutin(view.color, pending.choice, vote)
  }
}
