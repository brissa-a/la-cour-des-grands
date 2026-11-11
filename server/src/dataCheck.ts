import type { DataVersion } from "../../web/src/data/version.ts"
import type { Releases } from "./releases.ts"

export type DataCheck =
  | { readonly kind: "pointed"; readonly version: DataVersion }
  | { readonly kind: "older"; readonly version: DataVersion; readonly pointed: DataVersion | null }
  | { readonly kind: "none" }

export function dataCheck(state: Releases, pointed: DataVersion | null): DataCheck {
  if (state.kind === "starting") return { kind: "none" }
  const version = state.current.version
  return version === pointed ? { kind: "pointed", version } : { kind: "older", version, pointed }
}
