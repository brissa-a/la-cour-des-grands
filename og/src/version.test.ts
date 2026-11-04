import assert from "node:assert/strict"
import { test } from "node:test"
import { DATA_BRANCH } from "../../web/src/data/source.ts"
import { SHA } from "./fixture.test.ts"
import { BRANCH_HEAD_URL, checkVersion, dataVersion, type Fetcher } from "./version.ts"

test("a data version is a full lowercase commit SHA and nothing else, so it can name a cache folder and a URL segment", () => {
  assert.equal(dataVersion(SHA), SHA)
  for (const text of ["", SHA.toUpperCase(), SHA.slice(1), `${SHA}0`, ` ${SHA}`, `${SHA}\n`, "../../../../../../../../../../etc/passwd", `${SHA.slice(0, 39)}g`, DATA_BRANCH])
    assert.equal(dataVersion(text), null, JSON.stringify(text))
})

function answering(response: Response | Error, seen: { url: string; init: RequestInit }[] = []): Fetcher {
  return (url, init) => {
    seen.push({ url, init })
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response)
  }
}

test("the branch head comes from GitHub as a bare SHA, asked with the last ETag so an unchanged branch costs a 304", async () => {
  const seen: { url: string; init: RequestInit }[] = []
  assert.deepEqual(await checkVersion(answering(new Response(`${SHA}\n`, { headers: { etag: `"${SHA}"` } }), seen), null), { kind: "found", version: SHA, etag: `"${SHA}"` })
  assert.deepEqual(await checkVersion(answering(new Response(null, { status: 304 }), seen), `"${SHA}"`), { kind: "unchanged" })
  assert.equal(seen[0]?.url, BRANCH_HEAD_URL)
  assert.equal(BRANCH_HEAD_URL, `https://api.github.com/repos/brissa-a/lcdg-data/commits/${DATA_BRANCH}`)
  const headers = seen.map(({ init }) => new Headers(init.headers))
  assert.deepEqual(
    headers.map(sent => [sent.get("accept"), sent.get("if-none-match"), sent.get("user-agent")]),
    [
      ["application/vnd.github.sha", null, "lcdg-og"],
      ["application/vnd.github.sha", `"${SHA}"`, "lcdg-og"],
    ],
  )
})

test("a refused, garbled or failed check is reported as failed, never as a version", async () => {
  assert.deepEqual(await checkVersion(answering(new Response("rate limited", { status: 403 })), null), { kind: "failed", reason: "HTTP 403" })
  assert.deepEqual(await checkVersion(answering(new Response("<html>")), null), { kind: "failed", reason: 'not a commit SHA: "<html>"' })
  assert.deepEqual(await checkVersion(answering(new Error("getaddrinfo ENOTFOUND api.github.com")), null), { kind: "failed", reason: "getaddrinfo ENOTFOUND api.github.com" })
  assert.deepEqual(await checkVersion(answering(new Response("x".repeat(500))), null), { kind: "failed", reason: `not a commit SHA: "${"x".repeat(60)}"` })
})
