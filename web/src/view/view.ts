import type { ColorableFeature, FeatureKey } from "../data/features.ts"
import { layoutsOf, type LayoutChoice } from "../forms/registry.ts"
import { coloringsOf, type ColorChoice } from "../paint/registry.ts"
import { SEAT, sourceKey, VOTE, type Source, type VoteSource } from "../sources/shapes.ts"
import type { Param } from "../url.ts"
import { voteId, type VoteId } from "../votes/voteId.ts"

type Channel = { readonly of: Source }

export type ReadsVote<C extends Channel> = Extract<C, { readonly of: VoteSource }>

export type Plain<C extends Channel> = Exclude<C, { readonly of: VoteSource }>

export type View =
  | { readonly scrutin: null; readonly color: Plain<ColorChoice>; readonly layout: Plain<LayoutChoice> }
  | { readonly scrutin: VoteId; readonly color: ReadsVote<ColorChoice>; readonly layout: LayoutChoice }
  | { readonly scrutin: VoteId; readonly color: Plain<ColorChoice>; readonly layout: ReadsVote<LayoutChoice> }

export type ParsedView = { readonly view: View; readonly fallback: Plain<ColorChoice> }

export const HEMICYCLE: Plain<LayoutChoice> = { form: "hemicycle", of: SEAT }

export const VOTE_COLOR: ReadsVote<ColorChoice> = { paint: "palette", of: VOTE }

export function readsVote<C extends Channel>(choice: C): choice is ReadsVote<C> {
  return choice.of.kind === "vote"
}

export function viewOf(color: ColorChoice, layout: LayoutChoice, scrutin: VoteId | null): View | null {
  if (scrutin === null) {
    if (readsVote(color) || readsVote(layout)) return null
    return { scrutin, color, layout }
  }
  if (readsVote(color)) return { scrutin, color, layout }
  if (readsVote(layout)) return { scrutin, color, layout }
  return { scrutin: null, color, layout }
}

export function colorFor(feature: ColorableFeature): Plain<ColorChoice> | null {
  const [choice] = coloringsOf(feature)
  return choice && !readsVote(choice) ? choice : null
}

export function parseView(read: (name: string) => string | null, features: readonly ColorableFeature[], defaultColor: FeatureKey): ParsedView | null {
  const feature = (key: string | null) => features.find(f => f.key === key)
  const colorFeature = feature(read("color")) ?? feature(defaultColor)
  const fallback = colorFeature && colorFor(colorFeature)
  if (!fallback) return null
  const scrutin = voteId(read("vote") ?? "")
  const chart = read("chart")
  const source: Source = (scrutin && chart === VOTE.kind ? VOTE : feature(chart)) ?? SEAT
  const layouts = layoutsOf(source)
  const layout = layouts.find(choice => choice.form === read("layout")) ?? layouts[0] ?? HEMICYCLE
  const color = scrutin && (read("color") === VOTE.kind || !readsVote(layout)) ? VOTE_COLOR : fallback
  const view = viewOf(color, layout, scrutin)
  return view && { view, fallback }
}

export function viewParams(view: View, defaultColor: FeatureKey): readonly Param[] {
  const { color, layout } = view
  const defaultPaint = coloringsOf(color.of)[0]?.paint
  return [
    ["vote", view.scrutin],
    ["color", sourceKey(color.of) === defaultColor && color.paint === defaultPaint ? null : sourceKey(color.of)],
    ["chart", layout.of.kind === SEAT.kind ? null : sourceKey(layout.of)],
    ["layout", layoutsOf(layout.of)[0]?.form === layout.form ? null : layout.form],
  ]
}
