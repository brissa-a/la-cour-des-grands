export type DateIso = string & { readonly __brand: "DateIso" };

export function dateIso(valeur: string): DateIso {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valeur)) throw new Error(`Date invalide : ${valeur}`);
  return valeur as DateIso;
}

export const aujourdhui = (): DateIso => dateIso(new Date().toISOString().slice(0, 10));
