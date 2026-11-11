import { join } from "node:path"
import { parseArgs } from "node:util"
import { readConfig } from "./config.ts"
import { dataCheck } from "./dataCheck.ts"
import { watchReleases } from "./releases.ts"
import { dataRootSource } from "./snapshot.ts"

// Run by deploy.sh with the new image before it replaces the running service: exits 1 unless the service would serve the version current.json names,
// or, with --allow-older-version, a version the data root keeps.
const { values } = parseArgs({ options: { "allow-older-version": { type: "boolean", default: false } } })
const { dataRoot } = readConfig(process.env, join(import.meta.dirname, ".."))
const watch = watchReleases({
  ...dataRootSource(dataRoot),
  onRelease: () => Promise.resolve(),
  log: (event, fields) => console.error(JSON.stringify({ event, ...fields })),
  everyMs: 0,
})
await watch.started
watch.stop()

const check = dataCheck(watch.state(), watch.pointed())
switch (check.kind) {
  case "none":
    console.error(JSON.stringify({ event: "no-version", dataRoot }))
    process.exitCode = 1
    break
  case "older":
    if (!values["allow-older-version"]) {
      console.error(JSON.stringify({ event: "older-version", dataRoot, version: check.version, pointed: check.pointed, override: "--allow-older-version" }))
      process.exitCode = 1
      break
    }
    console.log(JSON.stringify({ dataRoot, version: check.version, pointed: check.pointed }))
    break
  case "pointed":
    console.log(JSON.stringify({ dataRoot, version: check.version, pointed: check.version }))
}
