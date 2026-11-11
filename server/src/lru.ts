export type SizedLru<K> = {
  readonly bytes: () => number
  readonly set: (key: K, size: number) => void
  readonly touch: (key: K) => void
  readonly delete: (key: K) => void
  readonly deleteWhere: (match: (key: K) => boolean) => void
  readonly evict: (maxBytes: number, first: (key: K) => boolean) => readonly K[]
}

export function sizedLru<K>(): SizedLru<K> {
  const sizes = new Map<K, number>()
  let total = 0

  function remove(key: K): void {
    total -= sizes.get(key) ?? 0
    sizes.delete(key)
  }

  return {
    bytes: () => total,
    set: (key, size) => {
      remove(key)
      sizes.set(key, size)
      total += size
    },
    touch: key => {
      const size = sizes.get(key)
      if (size === undefined) return
      sizes.delete(key)
      sizes.set(key, size)
    },
    delete: remove,
    deleteWhere: match => {
      for (const key of [...sizes.keys()].filter(match)) remove(key)
    },
    evict: (maxBytes, first) => {
      const evicted: K[] = []
      for (const pass of [first, (key: K) => !first(key)])
        for (const key of [...sizes.keys()].filter(pass)) {
          if (total <= maxBytes) return evicted
          remove(key)
          evicted.push(key)
        }
      return evicted
    },
  }
}
