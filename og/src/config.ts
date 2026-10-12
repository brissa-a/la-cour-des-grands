import { resolve } from "node:path"

export type PublicOrigin = string & { readonly __brand: "PublicOrigin" }

export type Config = {
  readonly port: number
  readonly origin: PublicOrigin
  readonly dist: string
  readonly cacheDir: string
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"])

export function publicOrigin(text: string): PublicOrigin | null {
  const url = URL.parse(text)
  if (url === null || url.username !== "" || url.password !== "" || url.pathname !== "/" || url.search !== "" || url.hash !== "") return null
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) return null
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: an https origin (http only on loopback), no path, query or credentials, so links built on it stay on this site
  return url.origin as PublicOrigin
}

export function readConfig(env: Readonly<Record<string, string | undefined>>, here: string): Config {
  const origin = publicOrigin(env["PUBLIC_ORIGIN"] ?? "https://lcdg.kxv.fr")
  if (origin === null) throw new Error("PUBLIC_ORIGIN must be an https origin such as https://lcdg.kxv.fr")
  const port = Number(env["PORT"] ?? "8080")
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PORT must be a TCP port number")
  return {
    port,
    origin,
    dist: resolve(here, env["DIST_DIR"] ?? "../web/dist"),
    cacheDir: resolve(here, env["CACHE_DIR"] ?? "cache"),
  }
}
