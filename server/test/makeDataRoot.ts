import { createHash } from "node:crypto"
import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { parseCsv } from "../../web/src/data/csvRows.ts"
import { isList, isRecord } from "../../web/src/data/json.ts"

// Builds test/data, the data root the integration tests draw from, out of the v2/ folders of lcdg-data and lcdg-nobg:
//   node test/makeDataRoot.ts <lcdg-data>/v2 <lcdg-nobg>/v2 test/data
const [source = "", photos = "", root = ""] = process.argv.slice(2)

const VOTES = new Set(["VTANR5L17V1", "VTANR5L17V7979", "VTANR5L17V8427"])
const PHOTOS = ["PA720892"]
const AS_IS = [
  "seats/hemicycle.csv",
  "seats/hemicycle.svg",
  "deputies/values/civility.csv",
  "deputies/values/group.csv",
  "deputies/values/region.csv",
  "deputies/values/vote_position.csv",
  "deputies/values/yes_no.csv",
  "votes/values/kind.csv",
  "votes/values/result.csv",
  "votes/values/yes_no.csv",
]

type Table = { readonly header: readonly string[]; readonly rows: readonly Readonly<Record<string, string>>[] }

async function table(path: string): Promise<Table> {
  const text = await readFile(join(source, path), "utf8")
  const header = text.slice(0, text.indexOf("\n")).split(",")
  return { header, rows: parseCsv(path, text, header) }
}

function csv({ header, rows }: Table): string {
  const cell = (value = "") => (/[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value)
  return [header, ...rows.map(row => header.map(column => row[column]))].map(line => line.map(cell).join(",")).join("\n") + "\n"
}

const files = new Map<string, Buffer>()
for (const path of AS_IS) files.set(path, await readFile(join(source, path)))
for (const id of PHOTOS) files.set(`photos/${id}.webp`, await readFile(join(photos, `${id}.webp`)))

const init = await table("deputies/init.csv")
files.set("deputies/init.csv", Buffer.from(csv({ ...init, rows: init.rows.map(row => (row["photo"] ? { ...row, photo: `photos/${row["deputy_id"] ?? ""}.webp` } : row)) })))

const votes = await table("votes/votes.csv")
const kept = votes.rows.filter(row => VOTES.has(row["vote_id"] ?? ""))
files.set("votes/votes.csv", Buffer.from(csv({ ...votes, rows: kept })))
const positions = new Map<string, number>()
for (const file of new Set(kept.map(row => row["file"] ?? ""))) {
  const { header, rows } = await table(file)
  const columns = header.filter(column => column === "deputy_id" || VOTES.has(column))
  positions.set(file, columns.length - 1)
  files.set(file, Buffer.from(csv({ header: columns, rows })))
}

const catalog: unknown = JSON.parse(await readFile(join(source, "catalog.json"), "utf8"))
if (!isRecord(catalog) || !isList(catalog.files)) throw new Error("catalog.json: no files list")
const listed = catalog.files.filter(isRecord).flatMap(entry => {
  if (typeof entry.file !== "string" || !files.has(entry.file)) return []
  if (entry.file === "votes/votes.csv") return [{ ...entry, rows: kept.length }]
  const count = positions.get(entry.file)
  return [count === undefined || !isRecord(entry.columnsOf) ? entry : { ...entry, columnsOf: { ...entry.columnsOf, count } }]
})
files.set("catalog.json", Buffer.from(`${JSON.stringify({ ...catalog, files: listed }, null, 2)}\n`))

const sha = (algorithm: string, content: Buffer | string) => createHash(algorithm).update(content).digest("hex")
const manifest = [...files].map(([path, content]) => `${sha("sha256", content)}  ${path}\n`).toSorted()
const version = sha("sha1", manifest.join(""))

await rm(join(root, "v2"), { recursive: true, force: true })
for (const [path, content] of files) {
  await mkdir(dirname(join(root, "v2", version, path)), { recursive: true })
  await writeFile(join(root, "v2", version, path), content)
}
await writeFile(join(root, "v2", "current.json"), `${JSON.stringify({ version, publishedAt: new Date().toISOString() })}\n`)
console.log(`${root}/v2/${version}: ${files.size} files`)
