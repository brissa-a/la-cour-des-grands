import { useSyncExternalStore } from "react"
import { createConfigStore, type Config } from "./config.ts"
import { valueAt, type Path, type ValueAt } from "./schema.ts"

export const configStore = createConfigStore(browserStorage())

export function useConfig<P extends Path<Config>>(path: P): ValueAt<Config, P> {
  return useSyncExternalStore(configStore.subscribe, () => valueAt(configStore.get(), path))
}

function browserStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}
