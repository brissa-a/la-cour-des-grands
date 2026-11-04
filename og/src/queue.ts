import type { ClientId } from "./client.ts"

export type Outcome<T> =
  | { readonly kind: "done"; readonly value: T }
  | { readonly kind: "failed"; readonly error: unknown }
  | { readonly kind: "timeout" }
  | { readonly kind: "busy" }

export type Job<T> = (signal: AbortSignal) => Promise<T>

export type Admission = "wait" | "idleOnly"

export type RenderQueue<T> = {
  readonly run: (key: string, client: ClientId, admission: Admission, job: Job<T>) => Promise<Outcome<T>>
  readonly running: () => number
  readonly waiting: () => number
  readonly clients: () => number
}

export type QueueLimits = { readonly concurrency: number; readonly capacity: number; readonly perClient: number; readonly timeoutMs: number }

const BUSY = { kind: "busy" } as const

export function renderQueue<T>({ concurrency, capacity, perClient, timeoutMs }: QueueLimits): RenderQueue<T> {
  const inFlight = new Map<string, Promise<Outcome<T>>>()
  const lines: Readonly<Record<"fair" | "surplus", (() => void)[]>> = { fair: [], surplus: [] }
  const held = new Map<ClientId, number>()
  let running = 0

  function hold(client: ClientId, change: 1 | -1): void {
    const count = (held.get(client) ?? 0) + change
    if (count === 0) held.delete(client)
    else held.set(client, count)
  }

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

  // Surplus renders start only when no fair one waits, so ahead of a newcomer one client never has more than perClient renders, its running ones included.
  function lineFor(client: ClientId, admission: Admission): "now" | "fair" | "surplus" | null {
    if (running < concurrency) return "now"
    if (admission === "idleOnly") return null
    const line = (held.get(client) ?? 0) < perClient ? "fair" : "surplus"
    return lines[line].length < capacity ? line : null
  }

  return {
    run: (key, client, admission, job) => {
      const joined = inFlight.get(key)
      if (joined !== undefined) return joined
      const line = lineFor(client, admission)
      if (line === null) return Promise.resolve(BUSY)
      const outcome = new Promise<Outcome<T>>(resolve => {
        const start = () => {
          running += 1
          if (line !== "fair") hold(client, 1)
          void execute(job).then(result => {
            running -= 1
            hold(client, -1)
            inFlight.delete(key)
            resolve(result)
            const next = lines.fair.shift() ?? lines.surplus.shift()
            next?.()
          })
        }
        if (line === "now") start()
        else {
          if (line === "fair") hold(client, 1)
          lines[line].push(start)
        }
      })
      inFlight.set(key, outcome)
      return outcome
    },
    running: () => running,
    waiting: () => lines.fair.length + lines.surplus.length,
    clients: () => held.size,
  }
}

export function within<T>(promise: Promise<T>, ms: number): Promise<T | "late"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve("late"), ms)
    promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}
