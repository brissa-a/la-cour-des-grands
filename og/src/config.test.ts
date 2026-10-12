import assert from "node:assert/strict"
import { test } from "node:test"
import { publicOrigin, readConfig } from "./config.ts"

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
  assert.deepEqual(readConfig({}, "/app/og"), { port: 8080, origin: "https://lcdg.kxv.fr", dist: "/app/web/dist", cacheDir: "/app/og/cache" })
  assert.deepEqual(readConfig({ PORT: "3000", PUBLIC_ORIGIN: "https://cour-des-grands.fr", DIST_DIR: "/srv/dist", CACHE_DIR: "/var/cache/og" }, "/app/og"), {
    port: 3000,
    origin: "https://cour-des-grands.fr",
    dist: "/srv/dist",
    cacheDir: "/var/cache/og",
  })
  assert.throws(() => readConfig({ PUBLIC_ORIGIN: "http://lcdg.kxv.fr" }, "/app/og"), /PUBLIC_ORIGIN/)
  for (const port of ["0", "65536", "80.5", "http", ""]) assert.throws(() => readConfig({ PORT: port }, "/app/og"), /PORT/, port)
  assert.deepEqual([readConfig({ PORT: "1" }, "/").port, readConfig({ PORT: "65535" }, "/").port], [1, 65_535])
})
