import assert from "node:assert/strict"
import { test } from "node:test"
import { pointedVersion } from "../../web/src/data/version.ts"
import { capturePointer, captureRoute, captureUrl } from "./capture.ts"
import { OLD as OTHER, SHA as VERSION, viewOf } from "./fixture.test.ts"

test("the capture page is the service's own copy of the front, at a fixed origin, on the image's view with the capture switch and without photos", () => {
  const { image } = viewOf("deputy=PA720892&vote=VTANR5L17V1&clean=true&title=true&showPic=true&next=http://evil.example/")
  assert.equal(captureUrl(image), "https://capture.invalid/?vote=VTANR5L17V1&color=vote&deputy=PA720892&clean=capture")
  assert.equal(captureUrl(viewOf("").image), "https://capture.invalid/?clean=capture")
})

test("the capture browser reaches its own origin: the front's files, the data pointer and the files of the version being drawn", () => {
  assert.deepEqual(captureRoute("https://capture.invalid/?vote=VTANR5L17V1&clean=capture", VERSION), { kind: "site", path: "/" })
  assert.deepEqual(captureRoute("https://capture.invalid/assets/index-Dha1ylb_.js", VERSION), { kind: "site", path: "/assets/index-Dha1ylb_.js" })
  assert.deepEqual(captureRoute("https://capture.invalid/data/v2/current.json", VERSION), { kind: "pointer" })
  const csv = { type: "text/csv; charset=utf-8", compress: true }
  assert.deepEqual(captureRoute(`https://capture.invalid/data/v2/${VERSION}/votes/votes.csv`, VERSION), { kind: "data", file: { path: "votes/votes.csv", type: csv } })
  assert.deepEqual(captureRoute(`https://capture.invalid/data/v2/${OTHER}/deputies/init.csv`, OTHER), { kind: "data", file: { path: "deputies/init.csv", type: csv } })
})

test("the pointer the capture page reads names the version being drawn, not the current one", () => {
  assert.equal(pointedVersion(capturePointer(VERSION)), VERSION)
  assert.equal(pointedVersion(capturePointer(OTHER)), OTHER)
})

test("every other address is blocked: another data version, a path out of the version, other origins, GitHub and local addresses", () => {
  for (const address of [
    `https://capture.invalid/data/v2/${OTHER}/votes/votes.csv`,
    `https://capture.invalid/data/v2/${VERSION}/../${OTHER}/catalog.json`,
    `https://capture.invalid/data/v2/${VERSION}/%2e%2e/${OTHER}/catalog.json`,
    `https://capture.invalid/data/v2/${VERSION}/..%2f${OTHER}/catalog.json`,
    `https://capture.invalid/data/v2/${VERSION}/.hidden`,
    `https://capture.invalid/data/v2/${VERSION}/index.html`,
    `https://capture.invalid/data/v2/${VERSION}/seats/draw.js`,
    `https://capture.invalid/data/v2/${VERSION}/`,
    `https://capture.invalid/data/v2/${VERSION}`,
    "https://capture.invalid/data/v2/.store/0123456789abcdef",
    "https://capture.invalid/data/v2/.runs/last.json",
    "https://capture.invalid/data/v2/main/catalog.json",
    "https://capture.invalid/data/v2/",
    `https://cour-des-grands.fr/data/v2/${VERSION}/catalog.json`,
    "https://cour-des-grands.fr/data/v2/current.json",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/main/v2/votes/votes.csv",
    "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/main/v2/PA720892.webp",
    "https://api.github.com/repos/brissa-a/lcdg-data/commits/main",
    "https://capture.invalid:8443/",
    "http://capture.invalid/",
    "http://capture.invalid/data/v2/current.json",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:8080/healthz",
    "http://traefik:8080/api/http/routers",
    "http://localhost/",
    "https://fonts.googleapis.com/css2?family=Roboto",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "not a url",
  ])
    assert.deepEqual(captureRoute(address, VERSION), { kind: "blocked" }, address)
})

export const unproven: readonly unknown[] = [
  // @ts-expect-error the capture page is only ever given a view written back by canonicalView
  captureUrl("vote=x&next=http://evil.example/"),
  // @ts-expect-error the page's query keeps the photos, which the capture never draws
  captureUrl(viewOf("showPic=true").query),
]
