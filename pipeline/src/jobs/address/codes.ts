import type { ConstituencyCode } from "../deputies.ts";

export type CommuneCode = string & { readonly __brand: "CommuneCode" };

export function communeCode(value: string): CommuneCode {
  if (!/^(\d{5}|2[AB]\d{3})$/.test(value)) throw new Error(`Invalid commune code: ${value}`);
  return value as CommuneCode;
}

export const paddedCommuneCode = (value: string): CommuneCode => communeCode(/^\d{4}$/.test(value) ? `0${value}` : value);

export function constituencyCode(value: string): ConstituencyCode {
  if (!/^(0[1-9]|[1-8]\d|9[0-5]|2[AB]|97[1-7]|98[678]|099)-[1-9]\d?$/.test(value)) {
    throw new Error(`Invalid constituency code: ${value}`);
  }
  return value as ConstituencyCode;
}

const constituency = (department: string, number: string) => constituencyCode(`${department}-${Number(number)}`);

function departmentAndNumber(pattern: RegExp, value: string, what: string): [department: string, number: string] {
  const match = pattern.exec(value);
  if (match === null) throw new Error(`Invalid ${what}: ${value}`);
  return [match[1]!, match[2]!];
}

export function fromInseeCode(value: string): ConstituencyCode {
  const [department, number] = departmentAndNumber(/^(\d{2}|2[AB]|9\d\d)-(\d{2})$/, value, "INSEE constituency code");
  return constituency(department === "978" ? "977" : department, number);
}

const MINISTRY_DEPARTMENTS: Record<string, string> = {
  ZA: "971",
  ZB: "972",
  ZC: "973",
  ZD: "974",
  ZS: "975",
  ZM: "976",
  ZX: "977",
  ZW: "986",
  ZP: "987",
  ZN: "988",
  ZZ: "099",
};

export function fromMinistryCode(value: string): ConstituencyCode {
  const [department, number] = departmentAndNumber(/^(\d{2}|2[AB]|Z[A-Z])(\d{2})$/, value, "ministry constituency code");
  const mapped = department.startsWith("Z") ? MINISTRY_DEPARTMENTS[department] : department;
  if (mapped === undefined) throw new Error(`Unknown ministry department: ${department}`);
  return constituency(mapped, number);
}

export function fromContourId(value: string): ConstituencyCode {
  const [department, number] = departmentAndNumber(/^(\d{2}|2[AB]|97\d)(\d{2})$/, value, "contour id");
  return constituency(department, number);
}

export function ministryStationKey(value: string): string {
  const match = /^(.+)_(\d{1,4})$/.exec(value);
  return match === null ? value : `${match[1]}_${match[2]!.padStart(4, "0")}`;
}

const departmentOrder = (code: ConstituencyCode) => code.slice(0, code.lastIndexOf("-"));
const numberOrder = (code: ConstituencyCode) => Number(code.slice(code.lastIndexOf("-") + 1));

export const compareConstituencies = (a: ConstituencyCode, b: ConstituencyCode): number =>
  departmentOrder(a) < departmentOrder(b) ? -1 : departmentOrder(a) > departmentOrder(b) ? 1 : numberOrder(a) - numberOrder(b);

export const sortedConstituencies = (codes: Iterable<ConstituencyCode>): ConstituencyCode[] => [...codes].sort(compareConstituencies);
