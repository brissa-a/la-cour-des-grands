import { createReadStream } from "node:fs"
import { resolve, sep } from "node:path"
import { defineConfig, loadEnv, type Plugin } from "vite"
import react from "@vitejs/plugin-react"

const PUBLISHED_ORIGIN = "https://cour-des-grands.fr"

function localData(root: string): Plugin {
  return {
    name: "lcdg-local-data",
    configureServer: server => {
      server.middlewares.use("/data", (request, response) => {
        const file = resolve(root, `.${decodeURIComponent(new URL(request.url ?? "/", "http://dev.invalid").pathname)}`)
        const fail = () => {
          response.statusCode = 404
          response.end()
        }
        if (file.startsWith(root + sep)) createReadStream(file).on("error", fail).pipe(response)
        else fail()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const dataRoot = loadEnv(mode, process.cwd(), "").LCDG_DATA_ROOT
  return {
    plugins: [react(), ...(dataRoot ? [localData(resolve(dataRoot))] : [])],
    server: { proxy: dataRoot ? {} : { "/data": { target: PUBLISHED_ORIGIN, changeOrigin: true } } },
  }
})
