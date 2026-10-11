import type { ColorableFeature } from "../data/features.ts"
import { FORMS, isDefaultLayout, layoutsOf, picksOf, type LayoutChoice } from "../forms/registry.ts"
import { coloringsOf, isDefaultColoring, PAINTS, type ColorChoice } from "../paint/registry.ts"
import { SEAT, sourceKey, VOTE, type Source } from "../sources/shapes.ts"

export type Option<C> = { readonly id: string; readonly label: string; readonly group: string | null; readonly choice: C }

type Offered = { readonly source: Source; readonly label: string; readonly group: string }

const SCRUTIN_GROUP = "Scrutin"

export function layoutId(choice: LayoutChoice): string {
  const keys = picksOf(choice).map(sourceKey)
  return (isDefaultLayout(choice) ? keys : [choice.form, ...keys]).join("|")
}

export function colorId(choice: ColorChoice): string {
  return isDefaultColoring(choice) ? sourceKey(choice.of) : `${choice.paint}|${sourceKey(choice.of)}`
}

export function layoutOptions(features: readonly ColorableFeature[], scrutin: string | null): Option<LayoutChoice>[] {
  const room = layoutsOf(SEAT).map(choice => ({ id: layoutId(choice), label: FORMS[choice.form].label, group: null, choice }))
  return [
    ...room,
    ...offered(features, scrutin).flatMap(({ source, label, group }) =>
      layoutsOf(source).map(choice => ({
        id: layoutId(choice),
        label: isDefaultLayout(choice) ? label : `${label} · ${FORMS[choice.form].label}`,
        group,
        choice,
      })),
    ),
  ]
}

export function colorOptions(features: readonly ColorableFeature[], scrutin: string | null): Option<ColorChoice>[] {
  return offered(features, scrutin).flatMap(({ source, label, group }) =>
    coloringsOf(source).map((choice, i) => ({ id: colorId(choice), label, group: i === 0 ? group : PAINTS[choice.paint].label, choice })),
  )
}

function offered(features: readonly ColorableFeature[], scrutin: string | null): Offered[] {
  const fromFeatures = features.map(feature => ({ source: feature, label: feature.title, group: feature.file }))
  return scrutin === null ? fromFeatures : [...fromFeatures, { source: VOTE, label: scrutin, group: SCRUTIN_GROUP }]
}
