import { isRecord, type JsonRecord } from "../data/json.ts"

const LEAF = Symbol("leaf")

export type Leaf<T> = {
  readonly [LEAF]: true
  readonly fallback: T
  readonly expected: string
  readonly description: string
  readonly read: (value: unknown) => T | undefined
}

export type Schema = { readonly [key: string]: Schema | Leaf<unknown> }

export type ConfigOf<S extends Schema> = {
  readonly [K in keyof S]: S[K] extends Leaf<infer T> ? T : S[K] extends Schema ? ConfigOf<S[K]> : never
}

export type Parsed<C> = { ok: true; config: C } | { ok: false; errors: string[] }

export function integer(min: number, max: number, fallback: number, description: string): Leaf<number> {
  return {
    [LEAF]: true,
    fallback,
    description,
    expected: `un entier entre ${min} et ${max}`,
    read: value => (Number.isInteger(value) && Number(value) >= min && Number(value) <= max ? Number(value) : undefined),
  }
}

export function decimal(min: number, max: number, fallback: number, description: string): Leaf<number> {
  return {
    [LEAF]: true,
    fallback,
    description,
    expected: `un nombre entre ${min} et ${max}`,
    read: value => (typeof value === "number" && value >= min && value <= max ? value : undefined),
  }
}

export function defaults<S extends Schema>(schema: S): ConfigOf<S> {
  return readConfig(schema, {}, {}, [])
}

export function parseConfig<S extends Schema>(schema: S, text: string, previous: ConfigOf<S>): Parsed<ConfigOf<S>> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`JSON invalide : ${error instanceof Error ? error.message : String(error)}`] }
  }
  const errors: string[] = []
  const config = readConfig(schema, json, previous, errors)
  return errors.length ? { ok: false, errors } : { ok: true, config }
}

export function nodeAt(schema: Schema, path: readonly string[]): Schema | Leaf<unknown> | undefined {
  let node: Schema | Leaf<unknown> = schema
  for (const key of path) {
    if (isLeaf(node) || !Object.hasOwn(node, key)) return undefined
    const child: Schema | Leaf<unknown> | undefined = node[key]
    if (child === undefined) return undefined
    node = child
  }
  return node
}

export function isLeaf(node: Schema | Leaf<unknown>): node is Leaf<unknown> {
  return LEAF in node
}

function readConfig<S extends Schema>(schema: S, value: unknown, previous: JsonRecord, errors: string[]): ConfigOf<S> {
  const config = readNode(schema, value, previous, "", errors)
  // oxlint-disable-next-line typescript/consistent-type-assertions -- readNode gives each key of the schema the value its leaf read, its fallback or its previous value, as ConfigOf spells out; TypeScript cannot follow that walk
  return config as ConfigOf<S>
}

function readNode(schema: Schema, value: unknown, previous: JsonRecord, path: string, errors: string[]): JsonRecord {
  const at = (key: string) => (path ? `${path}.${key}` : key)
  if (value === undefined) value = {}
  if (!isRecord(value)) {
    errors.push(`${path || "La configuration"} doit être un objet`)
    return previous
  }
  for (const key of Object.keys(value)) if (!Object.hasOwn(schema, key)) errors.push(`${at(key)} : clé inconnue`)
  const next: Record<string, unknown> = {}
  for (const [key, node] of Object.entries(schema)) {
    if (!isLeaf(node)) {
      const previousGroup = previous[key]
      next[key] = readNode(node, value[key], isRecord(previousGroup) ? previousGroup : {}, at(key), errors)
      continue
    }
    if (value[key] === undefined) {
      next[key] = node.fallback
      continue
    }
    const read = node.read(value[key])
    if (read === undefined) errors.push(`${at(key)} doit être ${node.expected}`)
    next[key] = read ?? previous[key]
  }
  const unchanged = Object.keys(next).every(key => Object.is(next[key], previous[key]))
  return unchanged ? previous : next
}
