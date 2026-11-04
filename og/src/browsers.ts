export type Recycler<B> = {
  readonly use: <T>(work: (browser: B) => Promise<T>) => Promise<T>
  readonly close: () => Promise<void>
}

export type RecyclerDeps<B> = {
  readonly launch: (lost: () => void) => Promise<B>
  readonly close: (browser: B) => Promise<void>
  readonly maxUses: number
}

type Generation<B> = { readonly browser: Promise<B>; uses: number; active: number; retired: boolean }

export function recycler<B>({ launch, close, maxUses }: RecyclerDeps<B>): Recycler<B> {
  let current: Generation<B> | null = null
  const closing = new Set<Promise<void>>()

  function shut(generation: Generation<B>): void {
    const closed = generation.browser.then(close, () => undefined).finally(() => closing.delete(closed))
    closing.add(closed)
  }

  function forget(generation: Generation<B>): void {
    if (current === generation) current = null
  }

  function retire(generation: Generation<B>): void {
    forget(generation)
    generation.retired = true
    if (generation.active === 0) shut(generation)
  }

  function fresh(): Generation<B> {
    const generation: Generation<B> = { browser: launch(() => forget(generation)), uses: 0, active: 0, retired: false }
    generation.browser.catch(() => forget(generation))
    return generation
  }

  return {
    use: async work => {
      if (current !== null && current.uses >= maxUses) retire(current)
      current ??= fresh()
      const generation = current
      generation.uses += 1
      generation.active += 1
      try {
        return await work(await generation.browser)
      } finally {
        generation.active -= 1
        if (generation.retired && generation.active === 0) shut(generation)
      }
    },
    close: async () => {
      if (current !== null) retire(current)
      await Promise.all(closing)
    },
  }
}
