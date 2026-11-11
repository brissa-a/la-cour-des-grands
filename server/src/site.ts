import { readdir, readFile } from "node:fs/promises"
import { extname, join, relative, sep } from "node:path"
import { promisify } from "node:util"
import { brotliCompress, brotliCompressSync, constants, gzip, gzipSync } from "node:zlib"

export type Encoding = "br" | "gzip" | "identity"

export type FileType = { readonly type: string; readonly compress: boolean }

export type Bodies = { readonly identity: Buffer; readonly compressed: { readonly br: Buffer; readonly gzip: Buffer } | null }

export type Asset = { readonly type: string; readonly cacheControl: string; readonly bodies: Bodies }

export type StaticSite = { readonly index: string; readonly assets: ReadonlyMap<string, Asset> }

export const PAGE_FILE = "index.html"

export const PAGE_TYPE = "text/html; charset=utf-8"

const IMMUTABLE = "public, max-age=31536000, immutable"

const REVALIDATED = "public, max-age=3600"

const HASHED_DIRECTORY = "assets/"

const TYPES: Readonly<Record<string, FileType>> = {
  ".css": { type: "text/css; charset=utf-8", compress: true },
  ".csv": { type: "text/csv; charset=utf-8", compress: true },
  ".geojson": { type: "application/geo+json", compress: true },
  ".html": { type: PAGE_TYPE, compress: true },
  ".ico": { type: "image/x-icon", compress: true },
  ".jpg": { type: "image/jpeg", compress: false },
  ".js": { type: "text/javascript; charset=utf-8", compress: true },
  ".json": { type: "application/json", compress: true },
  ".png": { type: "image/png", compress: false },
  ".svg": { type: "image/svg+xml", compress: true },
  ".txt": { type: "text/plain; charset=utf-8", compress: true },
  ".webp": { type: "image/webp", compress: false },
  ".woff2": { type: "font/woff2", compress: false },
}

const UNKNOWN_TYPE: FileType = { type: "application/octet-stream", compress: false }

// Pages and data files are compressed as they are sent: brotli's default quality 11 costs 75 to 200 times quality 5 for 10 to 20 % fewer bytes
// (3.6 s against 17 ms for the 4 MB of votes/votes.csv).
const QUICK_BROTLI = { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }

const brotliLater = promisify(brotliCompress)

const gzipLater = promisify(gzip)

export function fileType(path: string): FileType {
  return TYPES[extname(path).toLowerCase()] ?? UNKNOWN_TYPE
}

export function bodiesOf(content: Buffer, compress: boolean): Bodies {
  if (!compress) return { identity: content, compressed: null }
  return { identity: content, compressed: { br: brotliCompressSync(content), gzip: gzipSync(content) } }
}

export async function loadSite(dist: string): Promise<StaticSite> {
  const assets = new Map<string, Asset>()
  let index: string | null = null
  for (const entry of await readdir(dist, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith(".")) continue
    const file = join(entry.parentPath, entry.name)
    const path = relative(dist, file).split(sep).join("/")
    const content = await readFile(file)
    if (path === PAGE_FILE) {
      index = content.toString("utf8")
      continue
    }
    const { type, compress } = fileType(path)
    assets.set(`/${path}`, { type, cacheControl: path.startsWith(HASHED_DIRECTORY) ? IMMUTABLE : REVALIDATED, bodies: bodiesOf(content, compress) })
  }
  if (index === null) throw new Error(`${dist}: no ${PAGE_FILE}; build the front first (npm run build in web/)`)
  return { index, assets }
}

export function siteFile(site: StaticSite, path: string): { readonly type: string; readonly body: Buffer } | null {
  if (path === "/") return { type: PAGE_TYPE, body: Buffer.from(site.index) }
  const asset = site.assets.get(path)
  return asset === undefined ? null : { type: asset.type, body: asset.bodies.identity }
}

export function preferredEncoding(acceptEncoding: string | undefined): Encoding {
  const accepted = new Map<string, number>()
  for (const part of acceptEncoding?.split(",") ?? []) {
    const [name = "", ...parameters] = part.split(";").map(token => token.trim().toLowerCase())
    const quality = parameters.find(parameter => parameter.startsWith("q="))
    accepted.set(name, quality === undefined ? 1 : Number(quality.slice(2)) || 0)
  }
  const weight = (name: Encoding) => accepted.get(name) ?? accepted.get("*") ?? 0
  if (weight("br") > 0) return "br"
  if (weight("gzip") > 0) return "gzip"
  return "identity"
}

export function encoded(content: Buffer, encoding: Encoding): Buffer {
  switch (encoding) {
    case "br":
      return brotliCompressSync(content, QUICK_BROTLI)
    case "gzip":
      return gzipSync(content)
    case "identity":
      return content
  }
}

export function compressedOffLoop(content: Buffer, encoding: "br" | "gzip"): Promise<Buffer> {
  return encoding === "br" ? brotliLater(content, QUICK_BROTLI) : gzipLater(content)
}

export function bodyFor(bodies: Bodies, encoding: Encoding): { readonly encoding: Encoding; readonly body: Buffer } {
  if (bodies.compressed === null) return { encoding: "identity", body: bodies.identity }
  switch (encoding) {
    case "br":
      return { encoding, body: bodies.compressed.br }
    case "gzip":
      return { encoding, body: bodies.compressed.gzip }
    case "identity":
      return { encoding, body: bodies.identity }
  }
}
