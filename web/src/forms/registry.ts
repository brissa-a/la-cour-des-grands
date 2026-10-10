import type { Data, KindsFor, Source, SourceOf } from "../sources/shapes.ts"
import { columns } from "./columns.ts"
import type { FormSpec, Scene, Target } from "./form.ts"
import { hemicycle } from "./hemicycle.ts"

export const FORMS = { hemicycle, columns }

export type FormName = keyof typeof FORMS

type ShapesOf<F extends FormName> = (typeof FORMS)[F]["shapes"][number]

const REGISTRY: { readonly [F in FormName]: FormSpec<ShapesOf<F>> } = FORMS

export type LayoutChoice = {
  [F in FormName]: { [K in KindsFor<ShapesOf<F>>]: { readonly form: F; readonly of: SourceOf<K> } }[KindsFor<ShapesOf<F>>]
}[FormName]

export const LAYOUTS: { readonly [F in FormName]: (source: Source) => Extract<LayoutChoice, { readonly form: F }> | null } = {
  hemicycle: source => (source.kind === "seat" ? { form: "hemicycle", of: source } : null),
  columns: source => {
    switch (source.kind) {
      case "category":
        return { form: "columns", of: source }
      case "number":
        return { form: "columns", of: source }
      case "vote":
        return { form: "columns", of: source }
      case "seat":
        return null
    }
  },
}

export function layoutsOf(source: Source): LayoutChoice[] {
  return Object.values(LAYOUTS).flatMap(choose => choose(source) ?? [])
}

export function layOut<F extends FormName>(form: F, data: Partial<Pick<Data, ShapesOf<F>>>, target: Target): Scene | null {
  const spec = REGISTRY[form]
  const input = pick(spec.shapes, data)
  return input === undefined ? null : spec.place(input, target)
}

function pick<S extends keyof Data>(shapes: readonly S[], data: Partial<Pick<Data, S>>): Data[S] | undefined {
  for (const shape of shapes) {
    const input = data[shape]
    if (input !== undefined) return input
  }
  return undefined
}
