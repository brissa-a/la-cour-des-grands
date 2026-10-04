import { category } from "./csv.ts";

const YES_NO = ["yes", "no"] as const;
export type YesNo = (typeof YES_NO)[number];

export const yesNo = (value: boolean): YesNo => (value ? "yes" : "no");

export const yesNoCategory = (title: string) => category(title, YES_NO, { yes: "#2e7d32", no: "#bdbdbd" });
