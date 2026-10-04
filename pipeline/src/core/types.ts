export type IsoDate = string & { readonly __brand: "IsoDate" };

export function isoDate(value: string): IsoDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`Invalid date: ${value}`);
  return value as IsoDate;
}

export const today = (): IsoDate => isoDate(new Date().toISOString().slice(0, 10));
