export type DeputeId = string & { readonly __brand: "DeputeId" };

export function deputeId(valeur: string): DeputeId {
  if (!/^PA\d+$/.test(valeur)) throw new Error(`Identifiant de député invalide : ${valeur}`);
  return valeur as DeputeId;
}

export type Depute = {
  id: DeputeId;
  enExercice: boolean;
};
