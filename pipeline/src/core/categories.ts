import { type ValueTable, labelledValues } from "./values.ts";

export type YesNo = "yes" | "no";

export const yesNo = (value: boolean): YesNo => (value ? "yes" : "no");

const tables = new Map<string, ValueTable<YesNo>>();

export function yesNoValues(folder: string): ValueTable<YesNo> {
  let table = tables.get(folder);
  if (table === undefined) {
    table = labelledValues<YesNo>(`${folder}/values/yes_no.csv`, { yes: "Oui", no: "Non" });
    tables.set(folder, table);
  }
  return table;
}
