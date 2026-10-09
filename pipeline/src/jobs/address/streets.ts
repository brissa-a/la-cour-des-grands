import type { ConstituencyCode } from "../deputies.ts";
import { sortedConstituencies } from "./codes.ts";

export type Street = {
  all: Set<ConstituencyCode>;
  numbers: Map<string, Set<ConstituencyCode>>;
};

export type RollEntry = {
  address: string;
  number: string | null;
  constituencies: ConstituencyCode[];
};

export function addToStreet(streets: Map<string, Street>, street: string, number: string | null, constituency: ConstituencyCode) {
  let entry = streets.get(street);
  if (entry === undefined) {
    entry = { all: new Set(), numbers: new Map() };
    streets.set(street, entry);
  }
  entry.all.add(constituency);
  if (number === null) return;
  const numbers = entry.numbers.get(number);
  if (numbers === undefined) entry.numbers.set(number, new Set([constituency]));
  else numbers.add(constituency);
}

// A mixed street with no numbered address (a split lieu-dit) keeps one row listing every constituency, so it is not lost.
export function compressStreets(streets: ReadonlyMap<string, Street>): RollEntry[] {
  return [...streets].flatMap(([street, { all, numbers }]): RollEntry[] =>
    all.size === 1 || numbers.size === 0
      ? [{ address: street, number: null, constituencies: sortedConstituencies(all) }]
      : [...numbers].map(([number, constituencies]) => ({
          address: `${number} ${street}`,
          number,
          constituencies: sortedConstituencies(constituencies),
        })),
  );
}
