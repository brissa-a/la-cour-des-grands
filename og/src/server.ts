import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { pipeline } from "node:stream/promises"
import { DATA_PATH } from "../../web/src/data/source.ts"
import { POINTER_FILE } from "../../web/src/data/version.ts"
import { FALLBACK_PATH, parseImagePath } from "./canonical.ts"
import { clientOf, type ClientId } from "./client.ts"
import { isLinkPreviewCrawler } from "./crawlers.ts"
import type { DataFiles } from "./dataFiles.ts"
import type { ImageAnswer, Images } from "./images.ts"
import { answerPage, type PageSite } from "./page.ts"
import type { Releases } from "./releases.ts"
import { bodyFor, encoded, fileType, PAGE_TYPE, preferredEncoding, type Encoding, type StaticSite } from "./site.ts"
import { dataAddress, type OpenedFile } from "./snapshot.ts"

export type ServiceDeps = {
  readonly site: StaticSite
  readonly page: PageSite
  readonly releases: () => Releases
  readonly pointer: () => string | null
  readonly data: DataFiles
  readonly images: Images
  readonly fallback: () => Buffer | null
  readonly health: () => Readonly<Record<string, unknown>>
  readonly logError: (error: unknown) => void
}

type Reply = {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: Buffer | OpenedFile
  readonly encoding: Encoding
  readonly varies: boolean
}

export const MAX_TARGET_BYTES = 2048

export const HEALTH_PATH = "/healthz"

const IMMUTABLE = "public, max-age=31536000, immutable"
const PAGE_CACHE = "public, max-age=60"
const FALLBACK_CACHE = "public, max-age=60"
// As long as the page: a pointer a minute old still names a version kept on disk, and fresher would cost every visit a round trip before its first data file.
const POINTER_CACHE = "public, max-age=60"
// The data is open to every origin; a file of it opened as a page (an SVG) runs nothing, loads nothing and gets an origin of its own.
const DATA_HEADERS = { "access-control-allow-origin": "*", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox" }
const JPEG = "image/jpeg"
const RETRY_AFTER_S = "30"
// What a download holds in memory, file read ahead and socket queue, while its client is slow: Traefik lets one address keep 1500 open on /data/.
const STREAM_CHUNK_BYTES = 16 * 1024

function reply(status: number, headers: Readonly<Record<string, string>>, body: Buffer): Reply {
  return { status, headers, body, encoding: "identity", varies: false }
}

function text(status: number, message: string, headers: Readonly<Record<string, string>> = {}): Reply {
  return reply(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", ...headers }, Buffer.from(`${message}\n`))
}

function redirect(status: 301 | 302, location: string, cacheControl: string): Reply {
  return reply(status, { location, "cache-control": cacheControl }, Buffer.alloc(0))
}

function jpeg(image: Buffer | null, cacheControl: string): Reply {
  if (image === null) return text(503, "Image indisponible, réessayez plus tard", { "retry-after": RETRY_AFTER_S })
  return reply(200, { "content-type": JPEG, "cache-control": cacheControl }, image)
}

function imageReply(answer: ImageAnswer, fallback: Buffer | null): Reply {
  switch (answer.kind) {
    case "image":
      return jpeg(answer.jpeg, IMMUTABLE)
    case "fallback":
      return jpeg(fallback, FALLBACK_CACHE)
    case "moved":
      return redirect(302, answer.location, "no-store")
    case "notFound":
      return text(404, "Image introuvable")
  }
}

async function handle(request: IncomingMessage, deps: ServiceDeps): Promise<Reply> {
  const target = request.url ?? ""
  if (Buffer.byteLength(target) > MAX_TARGET_BYTES) return text(414, "Adresse trop longue")
  if (request.method !== "GET" && request.method !== "HEAD") return text(405, "Méthode non permise", { allow: "GET, HEAD" })
  if (!target.startsWith("/")) return text(400, "Adresse invalide")
  const url = new URL(`http://service.invalid${target}`)
  const encoding = preferredEncoding(request.headers["accept-encoding"])
  const client = clientOf(request.headers["x-real-ip"], request.socket.remoteAddress)
  switch (url.pathname) {
    case "/": {
      const question = target.indexOf("?")
      const answer = answerPage(question === -1 ? null : target.slice(question + 1), deps.releases(), deps.page)
      if (answer.kind === "redirect") return redirect(301, answer.location, PAGE_CACHE)
      if (answer.prerender !== null && isLinkPreviewCrawler(request.headers["user-agent"])) deps.images.prerender(answer.prerender.release, answer.prerender.view, client)
      return { status: 200, headers: { "content-type": PAGE_TYPE, "cache-control": PAGE_CACHE }, body: encoded(Buffer.from(answer.html), encoding), encoding, varies: true }
    }
    case "/index.html":
      return redirect(301, "/", PAGE_CACHE)
    case HEALTH_PATH:
      return reply(200, { "content-type": "application/json", "cache-control": "no-store" }, Buffer.from(JSON.stringify(deps.health())))
    case FALLBACK_PATH:
      return jpeg(deps.fallback(), FALLBACK_CACHE)
    default:
      return file(url, encoding, client, deps)
  }
}

async function data(pathname: string, encoding: Encoding, deps: ServiceDeps): Promise<Reply> {
  const address = dataAddress(pathname)
  if (address === null) return text(404, "Fichier introuvable", DATA_HEADERS)
  switch (address.kind) {
    case "pointer": {
      const pointer = deps.pointer()
      if (pointer === null) return text(503, "Données indisponibles, réessayez plus tard", { "retry-after": RETRY_AFTER_S, ...DATA_HEADERS })
      return reply(200, { "content-type": fileType(POINTER_FILE).type, "cache-control": POINTER_CACHE, ...DATA_HEADERS }, Buffer.from(pointer))
    }
    case "file": {
      const found = await deps.data.get(address.version, address.file, encoding)
      if (found === null) return text(404, "Fichier introuvable", DATA_HEADERS)
      return { status: 200, headers: { "content-type": found.type, "cache-control": IMMUTABLE, ...DATA_HEADERS }, body: found.body, encoding: found.encoding, varies: found.varies }
    }
  }
}

async function file(url: URL, encoding: Encoding, client: ClientId, deps: ServiceDeps): Promise<Reply> {
  if (url.pathname.startsWith(DATA_PATH)) return data(url.pathname, encoding, deps)
  const address = parseImagePath(url.pathname)
  if (address !== null) return imageReply(await deps.images.answer(address, url.searchParams, client), deps.fallback())
  const asset = deps.site.assets.get(url.pathname)
  if (asset === undefined) return text(404, "Page introuvable")
  const chosen = bodyFor(asset.bodies, encoding)
  return { status: 200, headers: { "content-type": asset.type, "cache-control": asset.cacheControl }, ...chosen, varies: asset.bodies.compressed !== null }
}

function send(response: ServerResponse, { status, headers, body, encoding, varies }: Reply): void {
  response.writeHead(status, {
    ...headers,
    "content-length": String(Buffer.isBuffer(body) ? body.length : body.size),
    "x-content-type-options": "nosniff",
    ...(encoding === "identity" ? {} : { "content-encoding": encoding }),
    ...(varies ? { vary: "Accept-Encoding" } : {}),
  })
  if (Buffer.isBuffer(body)) response.end(body)
  else pipeline(body.handle.createReadStream({ highWaterMark: STREAM_CHUNK_BYTES }), response).catch(() => undefined)
}

export function createService(deps: ServiceDeps): Server {
  return createServer({ highWaterMark: STREAM_CHUNK_BYTES }, (request, response) => {
    handle(request, deps).then(
      answer => send(response, answer),
      (error: unknown) => {
        deps.logError(error)
        send(response, text(500, "Erreur interne"))
      },
    )
  })
}
