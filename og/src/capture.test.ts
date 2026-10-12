import assert from "node:assert/strict"
import { test } from "node:test"
import { captureRoute, captureUrl } from "./capture.ts"
import { SHA as VERSION, viewOf } from "./fixture.test.ts"

test("the capture page is the service's own copy of the front, at a fixed origin, on the canonical view with the capture switch", () => {
  const { query } = viewOf("deputy=PA720892&vote=VTANR5L17V1&clean=true&title=true&next=http://evil.example/")
  assert.equal(captureUrl(query), "https://capture.invalid/?vote=VTANR5L17V1&color=vote&deputy=PA720892&clean=capture")
  assert.equal(captureUrl(viewOf("").query), "https://capture.invalid/?clean=capture")
})

test("the capture browser reaches its own origin, the published data pinned to the version being drawn, and the photos", () => {
  assert.deepEqual(captureRoute("https://capture.invalid/?vote=VTANR5L17V1&clean=capture", VERSION), { kind: "site", path: "/" })
  assert.deepEqual(captureRoute("https://capture.invalid/assets/index-Dha1ylb_.js", VERSION), { kind: "site", path: "/assets/index-Dha1ylb_.js" })
  assert.deepEqual(captureRoute("https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/votes/votes.csv", VERSION), {
    kind: "upstream",
    url: `https://raw.githubusercontent.com/brissa-a/lcdg-data/${VERSION}/v2/votes/votes.csv`,
  })
  assert.deepEqual(captureRoute("https://raw.githubusercontent.com/brissa-a/lcdg-nobg/test-v2/v2/PA720892.webp", VERSION), {
    kind: "upstream",
    url: "https://raw.githubusercontent.com/brissa-a/lcdg-nobg/test-v2/v2/PA720892.webp",
  })
})

test("every other address is blocked, look-alike hosts, other branches, climbs out of the data folder and local addresses included", () => {
  for (const address of [
    "https://raw.githubusercontent.com.evil.example/brissa-a/lcdg-data/test-v2/v2/catalog.json",
    "https://evil.example/https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/catalog.json",
    "https://user@raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/catalog.json",
    "https://raw.githubusercontent.com:444/brissa-a/lcdg-data/test-v2/v2/catalog.json",
    "http://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/catalog.json",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/main/v2/catalog.json",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/../../other-repo/x",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/%2e%2e/%2E%2E/other-repo/x",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2evil/catalog.json",
    "https://raw.githubusercontent.com/brissa-a/lcdg-data/test-v2/v2/catalog.json?token=x",
    "https://raw.githubusercontent.com/brissa-a/other/test-v2/v2/catalog.json",
    "https://capture.invalid:8443/",
    "http://capture.invalid/",
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:8080/healthz",
    "http://localhost/",
    "https://fonts.googleapis.com/css2?family=Roboto",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "not a url",
  ])
    assert.deepEqual(captureRoute(address, VERSION), { kind: "blocked" }, address)
})
