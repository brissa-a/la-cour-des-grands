import { join } from "node:path"
import { readConfig } from "./config.ts"
import { watchReleases } from "./releases.ts"
import { dataRootSource } from "./snapshot.ts"

// Run by deploy.sh with the new image before it replaces the running service: exits 1 when the data root holds no version the service would serve.
const { dataRoot } = readConfig(process.env, join(import.meta.dirname, ".."))
const watch = watchReleases({
  ...dataRootSource(dataRoot),
  onRelease: () => Promise.resolve(),
  log: (event, fields) => console.error(JSON.stringify({ event, ...fields })),
  everyMs: 0,
})
await watch.started
watch.stop()

const state = watch.state()
if (state.kind === "starting") {
  console.error(JSON.stringify({ event: "no-version", dataRoot }))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({ dataRoot, version: state.current.version, pointed: watch.pointed() }))
}
