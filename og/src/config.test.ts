import assert from "node:assert/strict"
import { test } from "node:test"
import { browserSource, publicOrigin, readConfig } from "./config.ts"

test("the public origin the tags are built on is an https origin, or http on loopback for local runs, with nothing after the host", () => {
  assert.equal(publicOrigin("https://lcdg.kxv.fr"), "https://lcdg.kxv.fr")
  assert.equal(publicOrigin("https://lcdg.kxv.fr/"), "https://lcdg.kxv.fr")
  assert.equal(publicOrigin("https://LCDG.kxv.fr:8443"), "https://lcdg.kxv.fr:8443")
  assert.equal(publicOrigin("http://127.0.0.1:8080"), "http://127.0.0.1:8080")
  assert.equal(publicOrigin("http://localhost:8080/"), "http://localhost:8080")
  assert.equal(publicOrigin("http://[::1]:8080"), "http://[::1]:8080")
  for (const text of ["", "lcdg.kxv.fr", "http://lcdg.kxv.fr", "https://lcdg.kxv.fr/og", "https://lcdg.kxv.fr/?a=1", "https://lcdg.kxv.fr/#x", "https://user@lcdg.kxv.fr", "https://:pass@lcdg.kxv.fr", "ws://localhost:8080", "ftp://127.0.0.1", "javascript:alert(1)", "file:///etc/passwd"])
    assert.equal(publicOrigin(text), null, text)
})

test("the configuration defaults to lcdg.kxv.fr on port 8080 with the front built next door, and refuses a bad origin or port", () => {
  assert.deepEqual(readConfig({}, "/app/og"), { port: 8080, origin: "https://lcdg.kxv.fr", dist: "/app/web/dist", cacheDir: "/app/og/cache", browser: { kind: "launch" } })
  assert.deepEqual(readConfig({ PORT: "3000", PUBLIC_ORIGIN: "https://cour-des-grands.fr", DIST_DIR: "/srv/dist", CACHE_DIR: "/var/cache/og", CHROMIUM_ENDPOINT: "ws://lcdg-chromium:3000/" }, "/app/og"), {
    port: 3000,
    origin: "https://cour-des-grands.fr",
    dist: "/srv/dist",
    cacheDir: "/var/cache/og",
    browser: { kind: "connect", endpoint: "ws://lcdg-chromium:3000/" },
  })
  assert.throws(() => readConfig({ PUBLIC_ORIGIN: "http://lcdg.kxv.fr" }, "/app/og"), /PUBLIC_ORIGIN/)
  for (const port of ["0", "65536", "80.5", "http", ""]) assert.throws(() => readConfig({ PORT: port }, "/app/og"), /PORT/, port)
  assert.deepEqual([readConfig({ PORT: "1" }, "/").port, readConfig({ PORT: "65535" }, "/").port], [1, 65_535])
})

test("Chromium is launched here unless CHROMIUM_ENDPOINT names the ws:// address of a Playwright server, which is then refused for anything else", () => {
  assert.deepEqual([browserSource(undefined), browserSource("")], [{ kind: "launch" }, { kind: "launch" }])
  assert.deepEqual(browserSource("ws://lcdg-chromium:3000"), { kind: "connect", endpoint: "ws://lcdg-chromium:3000/" })
  assert.deepEqual(browserSource("wss://chromium.example/capture"), { kind: "connect", endpoint: "wss://chromium.example/capture" })
  for (const text of ["http://lcdg-chromium:3000/", "lcdg-chromium:3000", "ws://user@lcdg-chromium:3000/", "ws://:secret@lcdg-chromium:3000/", "not a url"]) assert.equal(browserSource(text), null, text)
  assert.throws(() => readConfig({ CHROMIUM_ENDPOINT: "http://lcdg-chromium:3000/" }, "/app/og"), /CHROMIUM_ENDPOINT/)
})
