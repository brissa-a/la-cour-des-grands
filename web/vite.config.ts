import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig(({ mode }) => {
  const dataRoot = loadEnv(mode, process.cwd()).VITE_DATA_ROOT
  const localData = dataRoot?.startsWith("/@fs/") ? [dataRoot.slice("/@fs".length)] : []
  return {
    plugins: [react()],
    server: { fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...localData] } },
  }
})
