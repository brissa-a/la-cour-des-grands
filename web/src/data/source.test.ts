import assert from "node:assert/strict"
import { test } from "node:test"
import { fetchUnder } from "./source.ts"

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
