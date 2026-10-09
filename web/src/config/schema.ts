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

export type Path<C> = {
  [K in keyof C & string]: C[K] extends object ? K | `${K}.${Path<C[K]>}` : K
}[keyof C & string]

export type ValueAt<C, P extends string> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof C
    ? ValueAt<C[K], Rest>
    : never
  : P extends keyof C
    ? C[P]
    : never

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
  return Object.fromEntries(
    Object.entries(schema).map(([key, node]) => [key, isLeaf(node) ? node.fallback : defaults(node)]),
  ) as ConfigOf<S>
}

export function parseConfig<S extends Schema>(schema: S, text: string, previous: ConfigOf<S>): Parsed<ConfigOf<S>> {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    return { ok: false, errors: [`JSON invalide : ${error instanceof Error ? error.message : String(error)}`] }
  }
  const errors: string[] = []
  const config = readNode(schema, json, previous, "", errors)
  return errors.length ? { ok: false, errors } : { ok: true, config: config as ConfigOf<S> }
}

export function valueAt<C, P extends Path<C>>(config: C, path: P): ValueAt<C, P> {
  return path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], config) as ValueAt<C, P>
}

export function nodeAt(schema: Schema, path: readonly string[]): Schema | Leaf<unknown> | undefined {
  let node: Schema | Leaf<unknown> = schema
  for (const key of path) {
    if (isLeaf(node) || !Object.hasOwn(node, key)) return undefined
    node = node[key] as Schema | Leaf<unknown>
  }
  return node
}

export function isLeaf(node: Schema | Leaf<unknown>): node is Leaf<unknown> {
  return LEAF in node
}

function readNode(schema: Schema, value: unknown, previous: unknown, path: string, errors: string[]): unknown {
  const at = (key: string) => (path ? `${path}.${key}` : key)
  if (value === undefined) value = {}
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    errors.push(`${path || "La configuration"} doit être un objet`)
    return previous
  }
  const given = value as Record<string, unknown>
  for (const key of Object.keys(given)) if (!Object.hasOwn(schema, key)) errors.push(`${at(key)} : clé inconnue`)
  const before = previous as Record<string, unknown>
  const next: Record<string, unknown> = {}
  for (const [key, node] of Object.entries(schema)) {
    if (!isLeaf(node)) {
      next[key] = readNode(node, given[key], before[key], at(key), errors)
      continue
    }
    if (given[key] === undefined) {
      next[key] = node.fallback
      continue
    }
    const read = node.read(given[key])
    if (read === undefined) errors.push(`${at(key)} doit être ${node.expected}`)
    next[key] = read ?? before[key]
  }
  const unchanged = Object.keys(next).every(key => Object.is(next[key], before[key]))
  return unchanged ? previous : next
}
