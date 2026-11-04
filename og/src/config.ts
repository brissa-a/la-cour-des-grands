import { resolve } from "node:path"

export type PublicOrigin = string & { readonly __brand: "PublicOrigin" }

export type BrowserSource = { readonly kind: "launch" } | { readonly kind: "connect"; readonly endpoint: string }

export type Config = {
  readonly port: number
  readonly origin: PublicOrigin
  readonly dist: string
  readonly cacheDir: string
  readonly browser: BrowserSource
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

export function publicOrigin(text: string): PublicOrigin | null {
  const url = URL.parse(text)
  if (url === null || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") return null
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: an https origin (http only on loopback), no path, query or credentials, so links built on it stay on this site
  return url.origin as PublicOrigin
}

export function browserSource(endpoint: string | undefined): BrowserSource | null {
  if (endpoint === undefined || endpoint === "") return { kind: "launch" }
  const url = URL.parse(endpoint)
  if (url === null || (url.protocol !== "ws:" && url.protocol !== "wss:") || url.username !== "" || url.password !== "") return null
  return { kind: "connect", endpoint: url.href }
}

export function readConfig(env: Readonly<Record<string, string | undefined>>, here: string): Config {
  const origin = publicOrigin(env["PUBLIC_ORIGIN"] ?? "https://cour-des-grands.fr")
  if (origin === null) throw new Error("PUBLIC_ORIGIN must be an https origin such as https://cour-des-grands.fr")
  const port = Number(env["PORT"] ?? "8080")
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a TCP port number")
  const browser = browserSource(env["CHROMIUM_ENDPOINT"])
  if (browser === null) throw new Error("CHROMIUM_ENDPOINT must be the ws:// address of a Playwright run-server, or empty to launch Chromium here")
  return {
    port,
    origin,
    dist: resolve(here, env["DIST_DIR"] ?? "../web/dist"),
    cacheDir: resolve(here, env["CACHE_DIR"] ?? "cache"),
    browser,
  }
}
