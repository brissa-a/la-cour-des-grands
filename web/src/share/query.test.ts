import assert from "node:assert/strict"
import { test } from "node:test"
import { loadShareData } from "./data.ts"
import { FILES, readerOf } from "./fixture.test.ts"
import { canonicalQuery, type Known } from "./query.ts"

const KNOWN: Known = await loadShareData(readerOf(FILES))

function canonical(search: string, known = KNOWN): string {
  const params = new URLSearchParams(search)
  return canonicalQuery(name => params.get(name), known)
}

test("the canonical query writes the view, then the deputy, then the photos, whatever order the link gives them", () => {
  const expected = "vote=VTANR5L17V1&color=deputies%2Finit.csv%3Aage&chart=vote&layout=halfRings&deputy=PA720892&showPic=true"
  assert.equal(canonical("?vote=VTANR5L17V1&color=deputies/init.csv:age&chart=vote&layout=halfRings&deputy=PA720892&showPic=true"), expected)
  assert.equal(canonical("?showPic=true&layout=halfRings&deputy=PA720892&chart=vote&color=deputies%2Finit.csv%3Aage&vote=VTANR5L17V1"), expected)
  assert.equal(canonical("?deputy=PA720614&vote=VTANR5L17V999999"), "vote=VTANR5L17V999999&color=vote&deputy=PA720614")
})

test("the canonical query leaves out the defaults, the parameters it does not know and the embed and capture switches", () => {
  assert.equal(canonical(""), "")
  assert.equal(canonical("?color=deputies/init.csv:group&layout=hemicycle&showPic=false&clean=capture&title=true&utm_source=x&fbclid=y"), "")
  assert.equal(canonical("?clean=true&chart=deputies/init.csv:age&layout=columns"), "chart=deputies%2Finit.csv%3Aage")
})

test("values that name nothing the data knows are dropped: an unknown deputy or feature, a malformed scrutin, paths, addresses and markup", () => {
  assert.equal(canonical("?vote=../../etc/passwd&color=http://169.254.169.254/&chart=<script>alert(1)</script>&deputy=PA0&showPic=1"), "")
  assert.equal(canonical("?deputy=PA720892%00&color=deputies/init.csv:first_name&chart=deputies/init.csv:in_office"), "")
  assert.equal(canonical("?vote=VTANR5L17V1&vote=../x&deputy=PA720892&deputy=PA0"), "vote=VTANR5L17V1&color=vote&deputy=PA720892")
})

test("a canonical query is its own canonical form", () => {
  for (const search of ["?showPic=true&deputy=PA720614&chart=deputies/init.csv:group", "?vote=VTANR5L17V242&chart=vote&color=deputies/init.csv:age&utm=1", "?layout=columns"]) {
    const once = canonical(search)
    assert.equal(canonical(`?${once}`), once, search)
  }
})
