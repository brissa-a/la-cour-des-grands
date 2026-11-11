import assert from "node:assert/strict"
import { test } from "node:test"
import { fetchUnder, openSnapshot } from "./source.ts"

const VERSION = "d14b3767011d709e9565eeab3af97ca1ad57650a"

test("a reader fetches each path under its root, and a refused fetch fails with the path and the HTTP status", async () => {
  const asked: string[] = []
  const read = fetchUnder("https://data.example/v2/", url => {
    asked.push(url)
    return Promise.resolve(url.endsWith("missing.csv") ? new Response("", { status: 404 }) : new Response("a,b\n1,2\n"))
  })
  assert.equal(await read("votes/votes.csv"), "a,b\n1,2\n")
  await assert.rejects(read("votes/missing.csv"), /^Error: votes\/missing\.csv: HTTP 404$/)
  assert.deepEqual(asked, ["https://data.example/v2/votes/votes.csv", "https://data.example/v2/votes/missing.csv"])
})

function serving(pointer: Response): { readonly asked: string[]; readonly fetcher: (url: string) => Promise<Response> } {
  const asked: string[] = []
  return {
    asked,
    fetcher: url => {
      asked.push(url)
      return Promise.resolve(url.endsWith("/current.json") ? pointer : new Response(`content of ${url}`))
    },
  }
}

test("the front asks the site's own origin for the current version, then reads everything from that version's folder", async () => {
  const { asked, fetcher } = serving(new Response(`{"version":"${VERSION}","publishedAt":"2026-11-07T04:00:00.000Z"}`))
  const snapshot = await openSnapshot(fetcher)
  assert.equal(snapshot.root, `/data/v2/${VERSION}/`)
  assert.equal(await snapshot.read("catalog.json"), `content of /data/v2/${VERSION}/catalog.json`)
  assert.deepEqual(asked, ["/data/v2/current.json", `/data/v2/${VERSION}/catalog.json`])
})

test("a pointer that names no version, or that the site refuses, stops the loading with its reason", async () => {
  await assert.rejects(openSnapshot(serving(new Response('{"version":"main"}')).fetcher), /^Error: current\.json: no data version$/)
  await assert.rejects(openSnapshot(serving(new Response("", { status: 503 })).fetcher), /^Error: current\.json: HTTP 503$/)
})
