import assert from "node:assert/strict"
import { test } from "node:test"
import { loadShareData } from "./data.ts"
import { FILES, readerOf } from "./fixture.test.ts"
import { parseShared } from "./query.ts"
import { metaTexts, type TextData } from "./texts.ts"

const DATA = await loadShareData(readerOf(FILES))

function textsOf(search: string, data = DATA) {
  const params = new URLSearchParams(search)
  return metaTexts(parseShared(name => params.get(name), data), data)
}

test("a vote's link is titled by the vote, described by its kind, day, result and the view, and its image alt adds the deputy's ring", () => {
  assert.deepEqual(textsOf("?vote=VTANR5L17V1&deputy=PA720892"), {
    title: "Mathilde Panot · La motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues.",
    description: "Motion de censure du 8 octobre 2024 · Rejeté · Vote n° 1 en couleur · Siège en hémicycle",
    imageAlt:
      "Vote n° 1 en couleur · Siège en hémicycle · La motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues. · Motion de censure du 8 octobre 2024 · Rejeté · Un cercle désigne Mathilde Panot",
  })
  assert.deepEqual(textsOf("?vote=VTANR5L17V242&chart=vote&color=deputies/init.csv:age").description, "Scrutin public ordinaire du 4 novembre 2024 · Adopté · Âge en couleur · Vote n° 242 en colonnes")
})

test("a link without a vote is titled by its colour and layout features and dated by the data", () => {
  assert.deepEqual(textsOf("?color=deputies/init.csv:age&chart=deputies/init.csv:group"), {
    title: "Âge en couleur · Groupe politique en colonnes",
    description: "Les députés de l'Assemblée nationale · Données au 10 octobre 2026",
    imageAlt: "Âge en couleur · Groupe politique en colonnes · Données au 10 octobre 2026",
  })
  assert.deepEqual(textsOf("?deputy=PA720614", { ...DATA, generated: null }), {
    title: "Marine Le Pen · Groupe politique en couleur · Siège en hémicycle",
    description: "Les députés de l'Assemblée nationale",
    imageAlt: "Groupe politique en couleur · Siège en hémicycle · Un cercle désigne Marine Le Pen",
  })
})

test("a scrutin the data does not list is named as any vote, without a vote day or result", () => {
  assert.deepEqual(textsOf("?vote=VTANR5L17V999999"), {
    title: "Vote sur un scrutin en couleur · Siège en hémicycle",
    description: "Les députés de l'Assemblée nationale · Données au 10 octobre 2026",
    imageAlt: "Vote sur un scrutin en couleur · Siège en hémicycle · Données au 10 octobre 2026",
  })
})

test("a link's image alt rings a deputy only when the view draws them: not one in office without a seat yet, not one who no longer sits, not a predecessor in a vote while his successor has no seat yet, but one in a vote at his successor's seat", () => {
  assert.deepEqual(textsOf("?deputy=PA796046", { ...DATA, generated: null }), {
    title: "Isabelle Delyon · Groupe politique en couleur · Siège en hémicycle",
    description: "Les députés de l'Assemblée nationale",
    imageAlt: "Groupe politique en couleur · Siège en hémicycle",
  })
  assert.equal(textsOf("?deputy=PA796042", { ...DATA, generated: null }).imageAlt, "Groupe politique en couleur · Siège en hémicycle")
  assert.equal(
    textsOf("?vote=VTANR5L17V1&deputy=PA796042").imageAlt,
    "Vote n° 1 en couleur · Siège en hémicycle · La motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues. · Motion de censure du 8 octobre 2024 · Rejeté",
  )
  assert.equal(textsOf("?deputy=PA1327", { ...DATA, generated: null }).imageAlt, "Groupe politique en couleur · Siège en hémicycle")
  assert.match(textsOf("?vote=VTANR5L17V1&deputy=PA1327").imageAlt, / · Un cercle désigne Nicolas Forissier$/)
})

test("a link's image alt leaves the ring out when the version's seats or mandates do not read, since it cannot tell whether the view draws the deputy", async () => {
  const withoutSeats = Object.fromEntries(Object.entries(FILES).filter(([path]) => path !== "seats/hemicycle.csv"))
  const badMandate = { ...FILES, "deputies/init.csv": (FILES["deputies/init.csv"] ?? "").replace("2024-07-08/2026-11-09", "2026-11-09/2024-07-01") }
  for (const files of [withoutSeats, badMandate]) {
    const data = await loadShareData(readerOf(files))
    assert.equal(textsOf("?deputy=PA720614", data).imageAlt, "Groupe politique en couleur · Siège en hémicycle · Données au 10 octobre 2026")
    assert.equal(
      textsOf("?vote=VTANR5L17V1&deputy=PA720892", data).imageAlt,
      "Vote n° 1 en couleur · Siège en hémicycle · La motion de censure déposée par M. Boris Vallaud, Mme Mathilde Panot et 188 de leurs collègues. · Motion de censure du 8 octobre 2024 · Rejeté",
    )
  }
})

// @ts-expect-error a version whose seats or mandates do not read has no answer to whether the view draws a deputy
export type Unchecked = TextData["drawing"]["drawn"]
