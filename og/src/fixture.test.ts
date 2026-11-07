import assert from "node:assert/strict"
import { fstatSync } from "node:fs"
import { readdir, stat } from "node:fs/promises"
import { loadShareData } from "../../web/src/share/data.ts"
import { FILES, readerOf } from "../../web/src/share/fixture.test.ts"
import { canonicalView, renderId, type CanonicalView } from "./canonical.ts"
import { publicOrigin } from "./config.ts"
import { dataVersion } from "../../web/src/data/version.ts"

export function given<T>(value: T | null | undefined, what: string): T {
  assert.ok(value !== null && value !== undefined, what)
  return value
}

export const DATA = await loadShareData(readerOf(FILES))

export const ORIGIN = given(publicOrigin("https://lcdg.kxv.fr"), "origin")

export const OLD = given(dataVersion("1111111111111111111111111111111111111111"), "old version")

export const NEW = given(dataVersion("2222222222222222222222222222222222222222"), "new version")

export const SHA = given(dataVersion("d14b3767011d709e9565eeab3af97ca1ad57650a"), "real version")

export const RENDER = renderId("<!doctype html>", { width: 600 })

export function viewOf(search: string): CanonicalView {
  return canonicalView(new URLSearchParams(search), DATA)
}

export async function eventually(holds: () => boolean | Promise<boolean>, what: string, withinMs = 2_000): Promise<void> {
  const deadline = performance.now() + withinMs
  while (!(await holds())) {
    assert.ok(performance.now() < deadline, what)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

export async function openDescriptorsOn(path: string): Promise<number> {
  const { dev, ino } = await stat(path)
  const same = (fd: number) => {
    try {
      const opened = fstatSync(fd)
      return opened.dev === dev && opened.ino === ino
    } catch {
      return false
    }
  }
  return (await readdir("/dev/fd")).filter(name => same(Number(name))).length
}
