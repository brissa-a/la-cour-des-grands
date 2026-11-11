import assert from "node:assert/strict"
import { test } from "node:test"
import { clientOf } from "./client.ts"

test("a client is the address Traefik puts in X-Real-Ip, else the socket's, so a request reaching the service directly still counts", () => {
  assert.equal(clientOf("203.0.113.7", "172.22.0.3"), "203.0.113.7")
  assert.equal(clientOf(" 203.0.113.7 ", "172.22.0.3"), "203.0.113.7")
  assert.equal(clientOf(["203.0.113.7", "198.51.100.1"], "172.22.0.3"), "203.0.113.7")
  assert.equal(clientOf(undefined, "172.22.0.3"), "172.22.0.3")
  assert.equal(clientOf("", "172.22.0.3"), "172.22.0.3")
  assert.equal(clientOf(undefined, undefined), "unknown")
})
