import type { ClientId } from "./client.ts"

// `total` counts every client's downloads, running and waiting: past it, a request is refused at once, whatever its client holds.
export type DownloadLimits = { readonly perClient: number; readonly waiting: number; readonly waitMs: number; readonly total: number }

export type Entry = "started" | "refused"

export type DownloadCounts = { readonly clients: number; readonly running: number; readonly waiting: number; readonly waited: number; readonly refused: number }

export type Downloads = {
  // A download holds its client's place until `done` aborts, when its answer is sent or its connection closes.
  readonly enter: (client: ClientId, done: AbortSignal) => Promise<Entry>
  readonly counts: () => DownloadCounts
}

type Line = { running: number; readonly queue: Set<() => void> }

export function perClientDownloads({ perClient, waiting, waitMs, total }: DownloadLimits): Downloads {
  const lines = new Map<ClientId, Line>()
  let running = 0
  let queued = 0
  let waited = 0
  let refused = 0

  function hold(client: ClientId, line: Line, done: AbortSignal): void {
    done.addEventListener("abort", () => {
      const [next] = line.queue
      if (next !== undefined) next()
      else {
        line.running -= 1
        running -= 1
        if (line.running === 0) lines.delete(client)
      }
    })
  }

  return {
    enter: (client, done) => {
      if (done.aborted) return Promise.resolve("refused")
      if (running + queued >= total) {
        refused += 1
        return Promise.resolve("refused")
      }
      const line = lines.get(client) ?? { running: 0, queue: new Set() }
      lines.set(client, line)
      if (line.running < perClient) {
        line.running += 1
        running += 1
        hold(client, line, done)
        return Promise.resolve("started")
      }
      if (line.queue.size >= waiting) {
        refused += 1
        return Promise.resolve("refused")
      }
      waited += 1
      return new Promise(resolve => {
        const leave = (entry: Entry) => {
          clearTimeout(timer)
          done.removeEventListener("abort", gone)
          line.queue.delete(start)
          queued -= 1
          resolve(entry)
        }
        const start = () => {
          leave("started")
          hold(client, line, done)
        }
        const gone = () => leave("refused")
        const timer = setTimeout(() => {
          refused += 1
          leave("refused")
        }, waitMs)
        done.addEventListener("abort", gone)
        line.queue.add(start)
        queued += 1
      })
    },
    counts: () => ({ clients: lines.size, running, waiting: queued, waited, refused }),
  }
}
