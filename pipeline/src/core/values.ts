import { type Cell, cell, writeOutput } from "./csv.ts";
import { type Dependencies, type Job, type Results, job } from "./job.ts";

export type HexColor = `#${string}`;

export type ValueRow<V extends string> = {
  value: V;
  label_fr: string;
  short_fr?: string;
  color?: HexColor;
};

export type ValueTable<V extends string> = {
  readonly path: string;
  readonly values: Job<ReadonlySet<V>>;
};

const OPTIONAL_COLUMNS = ["short_fr", "color"] as const;

export function valueTable<const V extends string, const D extends Dependencies>(definition: {
  path: string;
  dependencies: D;
  rows: (results: Results<D>) => readonly ValueRow<V>[];
}): ValueTable<V> {
  return {
    path: definition.path,
    values: job({
      name: definition.path,
      dependencies: definition.dependencies,
      async run(results) {
        const rows = definition.rows(results);
        const values = new Set(rows.map((r) => r.value));
        if (values.size !== rows.length) throw new Error(`${definition.path}: duplicate values`);
        const columns = ["value", "label_fr", ...OPTIONAL_COLUMNS.filter((c) => rows.some((r) => r[c] !== undefined))] as const;
        const lines = [columns, ...rows.map((r) => columns.map((c): Cell => r[c] ?? null))];
        await writeOutput(definition.path, lines.map((l) => l.map(cell).join(",")).join("\n") + "\n");
        return values;
      },
    }),
  };
}

export const fixedValues = <const V extends string>(path: string, rows: readonly ValueRow<V>[]): ValueTable<V> =>
  valueTable({ path, dependencies: {}, rows: () => rows });

export const labelledValues = <V extends string>(path: string, labels: { [K in V]: string }): ValueTable<V> =>
  fixedValues(
    path,
    (Object.entries(labels) as [V, string][]).map(([value, label_fr]) => ({ value, label_fr })),
  );
