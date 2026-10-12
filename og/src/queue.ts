export type Outcome<T> =
  | { readonly kind: "done"; readonly value: T }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "timeout" }
  | { readonly kind: "busy" }

export type Job<T> = (signal: AbortSignal) => Promise<T>

export type RenderQueue<T> = {
  readonly run: (key: string, job: Job<T>) => Promise<Outcome<T>>
  readonly running: () => number
  readonly waiting: () => number
}

export type QueueLimits = { readonly concurrency: number; readonly capacity: number; readonly timeoutMs: number }

const BUSY = { kind: "busy" } as const

export function renderQueue<T>({ concurrency, capacity, timeoutMs }: QueueLimits): RenderQueue<T> {
  const inFlight = new Map<string, Promise<Outcome<T>>>()
  const waiting: (() => void)[] = []
  let running = 0

  function execute(job: Job<T>): Promise<Outcome<T>> {
    const controller = new AbortController()
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        controller.abort()
        resolve({ kind: "timeout" })
      }, timeoutMs)
      job(controller.signal)
        .then(
          value => resolve({ kind: "done", value }),
          (error: unknown) => resolve({ kind: "failed", error }),
        )
        .finally(() => clearTimeout(timer))
    })
  }

  return {
    run: (key, job) => {
      const joined = inFlight.get(key)
      if (joined !== undefined) return joined
      if (running >= concurrency && waiting.length >= capacity) return Promise.resolve(BUSY)
      const outcome = new Promise<Outcome<T>>(resolve => {
        const start = () => {
          running += 1
          void execute(job).then(result => {
            running -= 1
            inFlight.delete(key)
            resolve(result)
            waiting.shift()?.()
          })
        }
        if (running < concurrency) start()
        else waiting.push(start)
      })
      inFlight.set(key, outcome)
      return outcome
    },
    running: () => running,
    waiting: () => waiting.length,
  }
}

export function within<T>(promise: Promise<T>, ms: number): Promise<T | "late"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("late"), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
