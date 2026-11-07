export type ConstituencyCode = string & { readonly __brand: "ConstituencyCode" };

export function constituencyCode(value: string): ConstituencyCode {
  if (!/^(0[1-9]|1\d|2[1-9AB]|[3-8]\d|9[0-5]|97[1-7]|98[678]|099)-[1-9]\d?$/.test(value)) {
    throw new Error(`Invalid constituency code: ${value}`);
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a constituency code
  return value as ConstituencyCode;
}

export type CommuneCode = string & { readonly __brand: "CommuneCode" };

export function communeCode(value: string): CommuneCode {
  if (!/^(\d{5}|2[AB]\d{3})$/.test(value)) throw new Error(`Invalid commune code: ${value}`);
  // oxlint-disable-next-line typescript/consistent-type-assertions -- brand constructor: the format test above proves a commune code
  return value as CommuneCode;
}

export const paddedCommuneCode = (value: string): CommuneCode => communeCode(/^\d{4}$/.test(value) ? `0${value}` : value);

const constituency = (department: string, number: string) => constituencyCode(`${department}-${Number(number)}`);

function departmentAndNumber(pattern: RegExp, value: string, what: string): [department: string, number: string] {
  const [, department, number] = pattern.exec(value) ?? [];
  if (department === undefined || number === undefined) throw new Error(`Invalid ${what}: ${value}`);
  return [department, number];
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
  const [, commune, number] = /^(.+)_(\d{1,4})$/.exec(value) ?? [];
  return commune === undefined || number === undefined ? value : `${commune}_${number.padStart(4, "0")}`;
}

const departmentOrder = (code: ConstituencyCode) => code.slice(0, code.lastIndexOf("-"));
const numberOrder = (code: ConstituencyCode) => Number(code.slice(code.lastIndexOf("-") + 1));

export const compareConstituencies = (a: ConstituencyCode, b: ConstituencyCode): number =>
  departmentOrder(a) < departmentOrder(b) ? -1 : departmentOrder(a) > departmentOrder(b) ? 1 : numberOrder(a) - numberOrder(b);

export const sortedConstituencies = (codes: Iterable<ConstituencyCode>): ConstituencyCode[] => [...codes].sort(compareConstituencies);
