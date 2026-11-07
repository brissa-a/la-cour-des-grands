import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { filesUnder } from "./files.ts";
import type { CountedFiles } from "./guards.ts";
import { type DataRoot, type SnapshotPath, dataRoot, snapshotPath } from "./paths.ts";

export type Column = { readonly name: string; readonly type: string; readonly values?: string };

export type Table = {
  readonly file: string;
  readonly key: string;
  readonly columns: readonly Column[];
  readonly rows: readonly (readonly string[])[];
};

export type Contents = { readonly tables: readonly Table[]; readonly files: Readonly<Record<string, string>> };

export type CatalogJson = { generated: string; files: Record<string, unknown>[] };

export const COUNTED: CountedFiles = { deputies: snapshotPath("deputies/init.csv"), votes: snapshotPath("votes/votes.csv") };

export const temporaryDir = (): Promise<string> => mkdtemp(`${tmpdir()}/lcdg-publication-`);

export const temporaryRoot = async (): Promise<DataRoot> => dataRoot(await temporaryDir());

const csvOf = (table: Table): string => [[table.key, ...table.columns.map((c) => c.name)], ...table.rows].map((r) => r.join(",")).join("\n") + "\n";

async function put(dir: string, file: string, content: string): Promise<void> {
  await mkdir(dirname(`${dir}/${file}`), { recursive: true });
  await writeFile(`${dir}/${file}`, content);
}

export async function writeSnapshot(dir: string, contents: Contents, edit: (catalog: CatalogJson) => void = () => undefined): Promise<void> {
  const catalog: CatalogJson = { generated: "2026-11-07", files: [] };
  for (const table of contents.tables) {
    const content = csvOf(table);
    await put(dir, table.file, content);
    catalog.files.push({
      file: table.file,
      entity: table.key,
      key: table.key,
      rows: table.rows.length,
      size: Buffer.byteLength(content),
      gzipSize: 1,
      features: table.columns.map((c) => ({ title: c.name, type: c.type, column: c.name, ...(c.values === undefined ? {} : { values: c.values }) })),
    });
  }
  for (const [file, content] of Object.entries(contents.files)) await put(dir, file, content);
  edit(catalog);
  await put(dir, "catalog.json", JSON.stringify(catalog, null, 1) + "\n");
}

export function standard(options: { deputies?: number; votes?: readonly string[]; photos?: number; extra?: string } = {}): Contents {
  const { deputies = 600, votes = ["V1", "V2", "V3"], photos = 3, extra = "" } = options;
  const ids = Array.from({ length: deputies }, (_, i) => `PA${i + 1}`);
  const photographed = ids.slice(0, photos);
  return {
    tables: [
      {
        file: "deputies/init.csv",
        key: "deputy_id",
        columns: [
          { name: "photo", type: "image" },
          { name: "civility", type: "category", values: "deputies/values/civility.csv" },
        ],
        rows: ids.map((id, i) => [id, i < photos ? `photos/${id}.webp` : "", "M."]),
      },
      { file: "votes/votes.csv", key: "vote_id", columns: [{ name: "title", type: "text" }], rows: votes.map((v) => [v, `vote ${v}${extra}`]) },
    ],
    files: {
      "deputies/values/civility.csv": "value,label_fr\nM.,M.\n",
      ...Object.fromEntries(photographed.map((id) => [`photos/${id}.webp`, `photo of ${id}`])),
    },
  };
}

export async function sourcesOf(dir: string): Promise<Map<SnapshotPath, string>> {
  return new Map((await filesUnder(dir)).map((file): [SnapshotPath, string] => [snapshotPath(file), `${dir}/${file}`]));
}

export async function sources(contents: Contents, edit?: (catalog: CatalogJson) => void): Promise<Map<SnapshotPath, string>> {
  const dir = await temporaryDir();
  await writeSnapshot(dir, contents, edit);
  return sourcesOf(dir);
}

export function clock(start = Date.parse("2026-11-07T04:00:00.000Z")): () => Date {
  let tick = 0;
  return () => new Date(start + 60_000 * tick++);
}
