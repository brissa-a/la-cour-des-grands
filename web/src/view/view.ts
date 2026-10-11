import type { ColorableFeature, FeatureKey } from "../data/features.ts"
import { defaultLayout, EXTRA_SLOTS, isDefaultLayout, layoutsOf, type ExtraSources, type LayoutChoice } from "../forms/registry.ts"
import { COLORINGS, DEFAULT_PAINT, isDefaultColoring, type ColorChoice } from "../paint/registry.ts"
import { SEAT, sourceKey, VOTE, type Source, type VoteSource } from "../sources/shapes.ts"
import type { Param } from "../url.ts"
import { voteId, type VoteId } from "../votes/voteId.ts"

type Choice = ColorChoice | LayoutChoice

export type ReadsVote<C extends Choice> = C extends { readonly of: VoteSource } | { readonly picks: { readonly main: VoteSource } } ? C : never

export type Plain<C extends Choice> = Exclude<C, ReadsVote<C>>

export type View =
  | { readonly scrutin: null; readonly color: Plain<ColorChoice>; readonly layout: Plain<LayoutChoice> }
  | { readonly scrutin: VoteId; readonly color: ReadsVote<ColorChoice>; readonly layout: LayoutChoice }
  | { readonly scrutin: VoteId; readonly color: Plain<ColorChoice>; readonly layout: ReadsVote<LayoutChoice> }

export type ParsedView = { readonly view: View; readonly fallback: Plain<ColorChoice> }

export const HEMICYCLE: Plain<LayoutChoice> = { form: "hemicycle", picks: { main: SEAT } }

export const VOTE_COLOR: ReadsVote<ColorChoice> = { paint: "palette", of: VOTE }

export function mainOf(choice: Choice): Source {
  return "of" in choice ? choice.of : choice.picks.main
}

export function readsVote<C extends Choice>(choice: C): choice is ReadsVote<C> {
  return mainOf(choice).kind === "vote"
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
  const choice = COLORINGS[DEFAULT_PAINT[feature.kind]](feature)
  return choice && !readsVote(choice) ? choice : null
}

export function parseView(read: (name: string) => string | null, features: readonly ColorableFeature[], defaultColor: FeatureKey): ParsedView | null {
  const feature = (key: string | null) => features.find(f => f.key === key)
  const colorFeature = feature(read("color")) ?? feature(defaultColor)
  const fallback = colorFeature && colorFor(colorFeature)
  if (!fallback) return null
  const scrutin = voteId(read("vote") ?? "")
  const chart = read("chart")
  const main: Source = (scrutin && chart === VOTE.kind ? VOTE : feature(chart)) ?? SEAT
  const extra: ExtraSources = Object.fromEntries(
    EXTRA_SLOTS.flatMap((slot): [string, ColorableFeature][] => {
      const picked = feature(read(slot))
      return picked ? [[slot, picked]] : []
    }),
  )
  const layout = layoutsOf(main, extra).find(choice => choice.form === read("layout")) ?? defaultLayout(main, extra) ?? HEMICYCLE
  const color = scrutin && (read("color") === VOTE.kind || !readsVote(layout)) ? VOTE_COLOR : fallback
  const view = viewOf(color, layout, scrutin)
  return view && { view, fallback }
}

export function viewParams(view: View, defaultColor: FeatureKey): readonly Param[] {
  const { color, layout } = view
  const picks: Readonly<Partial<Record<string, Source>>> = layout.picks
  return [
    ["vote", view.scrutin],
    ["color", sourceKey(color.of) === defaultColor && isDefaultColoring(color) ? null : sourceKey(color.of)],
    ["chart", layout.picks.main.kind === SEAT.kind ? null : sourceKey(layout.picks.main)],
    ...EXTRA_SLOTS.map((slot): Param => {
      const picked = picks[slot]
      return [slot, picked ? sourceKey(picked) : null]
    }),
    ["layout", isDefaultLayout(layout) ? null : layout.form],
  ]
}
