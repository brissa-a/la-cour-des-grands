import assert from "node:assert/strict"
import { test } from "node:test"
import { copyText } from "./clipboard.ts"

test("a copy reports failure instead of throwing when the page has no clipboard or the browser refuses the write, so the text can be shown instead", async () => {
  const written: string[] = []
  const clipboard = {
    writeText: (text: string) => {
      written.push(text)
      return Promise.resolve()
    },
  }
  assert.equal(await copyText("<iframe>", clipboard), "copied")
  assert.deepEqual(written, ["<iframe>"])
  assert.equal(await copyText("<iframe>", { writeText: () => Promise.reject(new DOMException("Write permission denied.", "NotAllowedError")) }), "failed")
  assert.equal(await copyText("<iframe>", undefined), "failed")
})
