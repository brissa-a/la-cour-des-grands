import { useSyncExternalStore } from "react"
import { createConfigStore, type Config } from "./config.ts"

export const configStore = createConfigStore(browserStorage())

export function useConfig<T>(select: (config: Config) => T): T {
  return useSyncExternalStore(configStore.subscribe, () => select(configStore.get()))
}

function browserStorage(): Storage | null {
  try {
    return localStorage
  } catch {
    return null
  }
}
