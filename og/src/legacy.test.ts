import assert from "node:assert/strict"
import { test } from "node:test"
import { legacyParams } from "./legacy.ts"

function translated(v1Query: string): Readonly<Record<string, string>> {
  return Object.fromEntries(legacyParams(new URLSearchParams(v1Query)))
}

test("a v1 layout or coloration becomes the v2 chart or coloration of the same column, and the two combine", () => {
  const cases: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
    ["layout=pergroupe", { chart: "deputies/init.csv:group" }],
    ["layout=perage", { chart: "deputies/init.csv:age" }],
    ["layout=persexe", { chart: "deputies/init.csv:civility" }],
    ["color=groupe", { color: "deputies/init.csv:group" }],
    ["color=age", { color: "deputies/init.csv:age" }],
    ["color=sexe", { color: "deputies/init.csv:civility" }],
    ["layout=hemicycle&color=age", { color: "deputies/init.csv:age" }],
    ["layout=perage&color=sexe", { chart: "deputies/init.csv:age", color: "deputies/init.csv:civility" }],
    ["color=age&layout=persexe&showPic=true", { chart: "deputies/init.csv:civility", color: "deputies/init.csv:age", showPic: "true" }],
  ]
  for (const [v1Query, v2] of cases) assert.deepEqual(translated(v1Query), v2, v1Query)
})

test("what the v2 cannot show, the followers view, the Twitter coloration and the scrutins of the 15th legislature, is dropped, and the rest of the view kept", () => {
  const cases: readonly (readonly [string, Readonly<Record<string, string>>])[] = [
    ["layout=perfollower", {}],
    ["color=twitter&sf=2&base=10", {}],
    ["layout=perscrutin&scrutinIdLayout=VTANR5L15V100", {}],
    ["color=scrutin&scrutinIdColor=VTANR5L15V100", {}],
    ["layout=perfollower&color=age", { color: "deputies/init.csv:age" }],
    ["layout=perage&color=scrutin&scrutinIdColor=VTANR5L15V100", { chart: "deputies/init.csv:age" }],
    ["layout=perage&color=twitter&showPic=false", { chart: "deputies/init.csv:age" }],
  ]
  for (const [v1Query, v2] of cases) assert.deepEqual(translated(v1Query), v2, v1Query)
})

test("a parameter only the v1 knew marks a link as v1's, whose v2 names are then dropped", () => {
  for (const name of ["visualLayoutName", "visualColorName", "scrutinIdLayout", "scrutinIdColor", "sf", "base", "onlyOne"])
    assert.deepEqual(translated(`${name}=x&chart=deputies/init.csv:age&showPic=true`), { showPic: "true" }, name)
})

test("a v2 link is left untouched, the hemicycle layout name both versions share included", () => {
  for (const v2Query of ["", "vote=VTANR5L17V1&color=vote&deputy=PA720892", "chart=deputies/init.csv:age&layout=columns", "layout=hemicycle&showPic=true", "color=deputies/init.csv:age&clean=true&title=true"]) {
    const params = new URLSearchParams(v2Query)
    assert.equal(legacyParams(params), params, v2Query)
  }
})
