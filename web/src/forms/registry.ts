import type { ColorableFeature } from "../data/features.ts"
import type { Data, KindsFor, Reading, Shape, Source, SourceKind, SourceOf } from "../sources/shapes.ts"
import { columns } from "./columns.ts"
import type { Frame, FormSpec, Inputs, Order, Scene, ShapeIn, Shapes } from "./form.ts"
import { halfRings } from "./halfRings.ts"
import { hemicycle } from "./hemicycle.ts"

export const FORMS = { hemicycle, columns, halfRings }

export type FormName = keyof typeof FORMS

type SlotsOf<F extends FormName> = (typeof FORMS)[F]["slots"]

const REGISTRY: { readonly [F in FormName]: FormSpec<SlotsOf<F>> } = FORMS

type MainKinds<F extends FormName> = KindsFor<ShapeIn<SlotsOf<F>["main"]>>

type FeatureFor<S extends Shape> = { [K in KindsFor<S>]: Extract<ColorableFeature, { readonly kind: K }> }[KindsFor<S>]

type ExtraPicks<F extends FormName> = { readonly [X in Exclude<keyof SlotsOf<F>, "main">]: FeatureFor<ShapeIn<SlotsOf<F>[X]>> }

export type LayoutChoice = {
  [F in FormName]: {
    [K in MainKinds<F>]: { readonly form: F; readonly picks: { readonly main: SourceOf<K> } & ExtraPicks<F> }
  }[MainKinds<F>]
}[FormName]

export type ExtraSources = Readonly<Partial<Record<string, ColorableFeature>>>

type Chooser<F extends FormName> = (main: Source, extra: ExtraSources) => Extract<LayoutChoice, { readonly form: F }> | null

export const LAYOUTS: { readonly [F in FormName]: Chooser<F> } = {
  hemicycle: main => (main.kind === "seat" ? { form: "hemicycle", picks: { main } } : null),
  columns: main => {
    switch (main.kind) {
      case "category":
        return { form: "columns", picks: { main } }
      case "number":
        return { form: "columns", picks: { main } }
      case "vote":
        return { form: "columns", picks: { main } }
      case "seat":
        return null
    }
  },
  halfRings: main => (main.kind === "vote" ? { form: "halfRings", picks: { main } } : null),
}

type FormsFor<K extends SourceKind> = { [F in FormName]: K extends MainKinds<F> ? F : never }[FormName]

export const DEFAULT_LAYOUT: { readonly [K in SourceKind]: FormsFor<K> } = { category: "columns", number: "columns", vote: "columns", seat: "hemicycle" }

export const EXTRA_SLOTS: readonly string[] = [
  ...new Set(Object.values(REGISTRY).flatMap(({ slots }) => Object.keys(slots).filter(slot => slot !== "main"))),
]

export function layoutsOf(main: Source, extra: ExtraSources = {}): LayoutChoice[] {
  return Object.values(LAYOUTS).flatMap(choose => choose(main, extra) ?? [])
}

export function defaultLayout(main: Source, extra: ExtraSources = {}): LayoutChoice | null {
  return LAYOUTS[DEFAULT_LAYOUT[main.kind]](main, extra)
}

export function isDefaultLayout(choice: LayoutChoice): boolean {
  return DEFAULT_LAYOUT[choice.picks.main.kind] === choice.form
}

export function picksOf(choice: LayoutChoice): readonly Source[] {
  const picks: Readonly<Record<string, Source>> = choice.picks
  return Object.values(picks)
}

export type Arrangement<F extends FormName = FormName> = {
  readonly [G in F]: { readonly form: G; readonly inputs: Inputs<SlotsOf<G>>; readonly reading: Reading; readonly order: Order }
}[F] & { readonly __brand: "Arrangement" }

export function arrange(choice: LayoutChoice, read: (source: Source) => Reading | null, order: Order): Arrangement | null {
  const reading = read(choice.picks.main)
  if (!reading) return null
  const picks: Readonly<Partial<Record<string, Source>>> = choice.picks
  const slots: Readonly<Record<string, Shapes>> = REGISTRY[choice.form].slots
  const inputs: Record<string, Data[Shape]> = {}
  for (const [slot, shapes] of Object.entries(slots)) {
    const source = picks[slot]
    const data: Partial<Data> | undefined = slot === "main" ? reading.data : source && read(source)?.data
    const input = data && pick(shapes, data)
    if (!input) return null
    inputs[slot] = input
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: every slot of the form holds data read from the choice's own pick, in a shape that slot accepts
  return { form: choice.form, inputs, reading, order } as Arrangement
}

export function layOut<F extends FormName>({ form, inputs, order }: Arrangement<F>, frame: Frame): Scene {
  return REGISTRY[form].place(inputs, { frame, order })
}

function pick<S extends Shape>(shapes: readonly S[], data: Partial<Pick<Data, S>>): Data[S] | undefined {
  for (const shape of shapes) {
    const input = data[shape]
    if (input !== undefined) return input
  }
  return undefined
}
