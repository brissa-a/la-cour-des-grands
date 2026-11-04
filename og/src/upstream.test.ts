import assert from "node:assert/strict"
import { test } from "node:test"
import { createUpstream } from "./upstream.ts"

function counting(bodies: Readonly<Record<string, { readonly status: number; readonly body: string }>>) {
  const asked: string[] = []
  const fetcher = (url: string) => {
    asked.push(url)
    const found = bodies[url] ?? { status: 404, body: "404: Not Found" }
    return Promise.resolve(new Response(found.body, { status: found.status, headers: { "content-type": "text/plain; charset=utf-8" } }))
  }
  return { asked, fetcher }
}

const FILES = { "https://x/a.csv": { status: 200, body: "aaaaaaaaaa" }, "https://x/b.csv": { status: 200, body: "bbbbbbbbbb" }, "https://x/c.csv": { status: 200, body: "cccccccccc" } }

test("a data file is downloaded once for all the captures that ask for it, at the same time or later", async () => {
  const { asked, fetcher } = counting(FILES)
  const upstream = createUpstream(fetcher, { maxBytes: 1_000, parallel: 4, timeoutMs: 1_000 })
  const [first, second] = await Promise.all([upstream.get("https://x/a.csv"), upstream.get("https://x/a.csv")])
  const third = await upstream.get("https://x/a.csv")
  assert.deepEqual([first, second, third].map(({ status, contentType, body }) => [status, contentType, body.toString()]), Array(3).fill([200, "text/plain; charset=utf-8", "aaaaaaaaaa"]))
  assert.deepEqual(asked, ["https://x/a.csv"])
})

test("only successful answers are kept, so a missing file is asked again", async () => {
  const { asked, fetcher } = counting(FILES)
  const upstream = createUpstream(fetcher, { maxBytes: 1_000, parallel: 4, timeoutMs: 1_000 })
  assert.equal((await upstream.get("https://x/missing.csv")).status, 404)
  await upstream.get("https://x/missing.csv")
  assert.deepEqual(asked, ["https://x/missing.csv", "https://x/missing.csv"])
})

test("past its memory bound the least recently used file is dropped", async () => {
  const { asked, fetcher } = counting(FILES)
  const upstream = createUpstream(fetcher, { maxBytes: 20, parallel: 4, timeoutMs: 1_000 })
  await upstream.get("https://x/a.csv")
  await upstream.get("https://x/b.csv")
  await upstream.get("https://x/a.csv")
  await upstream.get("https://x/c.csv")
  await upstream.get("https://x/a.csv")
  await upstream.get("https://x/b.csv")
  assert.deepEqual(asked, ["https://x/a.csv", "https://x/b.csv", "https://x/c.csv", "https://x/b.csv"])
})

test("no more downloads run at once than the limit, the others start as soon as one ends", async () => {
  let active = 0
  let most = 0
  const fetcher = async (url: string) => {
    active += 1
    most = Math.max(most, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active -= 1
    return new Response(url)
  }
  const upstream = createUpstream(fetcher, { maxBytes: 1_000_000, parallel: 3, timeoutMs: 1_000 })
  const bodies = await Promise.all(Array.from({ length: 10 }, (_, index) => upstream.get(`https://x/${index}.webp`)))
  assert.deepEqual(
    bodies.map(({ body }) => body.toString()),
    Array.from({ length: 10 }, (_, index) => `https://x/${index}.webp`),
  )
  assert.equal(most, 3)
})

test("a download that hangs is given up after its time limit, and its slot goes to the next one", async () => {
  const fetcher = (url: string, init: RequestInit) =>
    url.endsWith("hang.csv")
      ? new Promise<Response>((_, reject) => init.signal?.addEventListener("abort", () => reject(new Error("timed out"))))
      : Promise.resolve(new Response(new Uint8Array([1, 2, 3])))
  const upstream = createUpstream(fetcher, { maxBytes: 1_000, parallel: 1, timeoutMs: 30 })
  const hanging = upstream.get("https://x/hang.csv")
  const next = upstream.get("https://x/next.bin")
  await assert.rejects(hanging, /timed out/)
  assert.deepEqual(await next, { status: 200, contentType: "application/octet-stream", body: Buffer.from([1, 2, 3]) })
})
