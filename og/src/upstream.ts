import { sizedLru } from "./lru.ts"

export type UpstreamResponse = { readonly status: number; readonly contentType: string; readonly body: Buffer }

export type Upstream = { readonly get: (url: string) => Promise<UpstreamResponse>; readonly clear: () => void }

export type UpstreamLimits = { readonly maxBytes: number; readonly parallel: number; readonly timeoutMs: number }

// raw.githubusercontent.com stalls hundreds of parallel downloads, the photos of one capture: 400 of 652 timed out unbounded, none at 16.
export function createUpstream(fetcher: (url: string, init: RequestInit) => Promise<Response>, { maxBytes, parallel, timeoutMs }: UpstreamLimits): Upstream {
  let kept = new Map<string, UpstreamResponse>()
  let order = sizedLru<string>()
  const inFlight = new Map<string, Promise<UpstreamResponse>>()
  const waiting: (() => void)[] = []
  let active = 0

  async function inTurn<T>(work: () => Promise<T>): Promise<T> {
    if (active < parallel) active += 1
    else await new Promise<void>(handOver => waiting.push(handOver))
    try {
      return await work()
    } finally {
      const next = waiting.shift()
      if (next === undefined) active -= 1
      else next()
    }
  }

  async function download(url: string): Promise<UpstreamResponse> {
    const fetched = await inTurn(async () => {
      const response = await fetcher(url, { signal: AbortSignal.timeout(timeoutMs) })
      return { status: response.status, contentType: response.headers.get("content-type") ?? "application/octet-stream", body: Buffer.from(await response.arrayBuffer()) }
    })
    if (fetched.status === 200) {
      kept.set(url, fetched)
      order.set(url, fetched.body.length)
      for (const evicted of order.evict(maxBytes, () => false)) kept.delete(evicted)
    }
    return fetched
  }

  return {
    get: url => {
      const hit = kept.get(url)
      if (hit !== undefined) {
        order.touch(url)
        return Promise.resolve(hit)
      }
      const pending = inFlight.get(url)
      if (pending !== undefined) return pending
      const fetching = download(url).finally(() => inFlight.delete(url))
      inFlight.set(url, fetching)
      return fetching
    },
    clear: () => {
      kept = new Map()
      order = sizedLru()
    },
  }
}
