import type { Segment } from "./jsonKeys.ts"
import { defaults, integer, isLeaf, nodeAt, parseConfig, type ConfigOf, type Schema } from "./schema.ts"

const SCHEMA = {
  preview: {
    openSpeedPxPerS: integer(
      0,
      2000,
      100,
      "Vitesse du pointeur, en pixels par seconde, sous laquelle la carte s'ouvre. Une fois ouverte, elle suit les sièges jusqu'au double de cette vitesse.",
    ),
    speedWindowMs: integer(
      0,
      2000,
      100,
      "Durée, en millisecondes, sur laquelle la vitesse du pointeur est mesurée. Plus elle est longue, plus la carte attend après un mouvement rapide.",
    ),
    holdMs: integer(
      0,
      2000,
      200,
      "Temps pendant lequel la carte reste affichée après avoir quitté un siège, en millisecondes. Revenir sur un siège pendant ce temps la garde ouverte.",
    ),
  },
} satisfies Schema

export type Config = ConfigOf<typeof SCHEMA>

export type KeyHelp = { kind: "option"; description: string; expected: string; fallback: unknown } | { kind: "group" } | { kind: "unknown" }

export function keyHelp(path: readonly Segment[]): KeyHelp {
  if (!path.every(segment => typeof segment === "string")) return { kind: "unknown" }
  const node = nodeAt(SCHEMA, path)
  if (node === undefined) return { kind: "unknown" }
  if (!isLeaf(node)) return { kind: "group" }
  return { kind: "option", description: node.description, expected: node.expected, fallback: node.fallback }
}

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">

const STORAGE_KEY = "lcdg:config"

export type Saved = { ok: true; config: Config; persisted: boolean } | { ok: false; errors: string[] }

export type ConfigStore = {
  get: () => Config
  text: () => string
  save: (text: string) => Saved
  reset: () => { persisted: boolean }
  subscribe: (listener: () => void) => () => void
}

export function createConfigStore(storage: Storage | null): ConfigStore {
  const fallback = defaults(SCHEMA)
  let config = load(storage, fallback)
  const listeners = new Set<() => void>()

  const apply = (next: Config) => {
    if (next === config) return
    config = next
    for (const listener of listeners) listener()
  }

  return {
    get: () => config,
    text: () => JSON.stringify(config, null, 2),
    save(text) {
      const parsed = parseConfig(SCHEMA, text, config)
      if (!parsed.ok) return parsed
      const persisted = write(storage, JSON.stringify(parsed.config))
      apply(parsed.config)
      return { ...parsed, persisted }
    },
    reset() {
      const persisted = write(storage, null)
      const parsed = parseConfig(SCHEMA, "{}", config)
      if (parsed.ok) apply(parsed.config)
      return { persisted }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

function load(storage: Storage | null, fallback: Config): Config {
  const saved = read(storage)
  if (saved === null) return fallback
  const parsed = parseConfig(SCHEMA, saved, fallback)
  if (parsed.ok) return parsed.config
  console.warn(`${STORAGE_KEY} ignored: ${parsed.errors.join("; ")}`)
  return fallback
}

function read(storage: Storage | null): string | null {
  try {
    return storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

function write(storage: Storage | null, value: string | null): boolean {
  if (storage === null) return value === null
  try {
    if (value === null) storage.removeItem(STORAGE_KEY)
    else storage.setItem(STORAGE_KEY, value)
    return true
  } catch (error) {
    console.warn(`${STORAGE_KEY} not saved`, error)
    return false
  }
}
