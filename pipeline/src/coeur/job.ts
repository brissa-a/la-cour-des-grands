export type Job<T> = {
  readonly nom: string;
  resultat(): Promise<T>;
};

export type Dependances = Record<string, Job<unknown>>;

export type Resultats<D extends Dependances> = {
  [K in keyof D]: D[K] extends Job<infer T> ? T : never;
};

export async function resoudre<D extends Dependances>(dependances: D): Promise<Resultats<D>> {
  const paires = await Promise.all(
    Object.entries(dependances).map(async ([cle, dependance]) => [cle, await dependance.resultat()]),
  );
  return Object.fromEntries(paires) as Resultats<D>;
}

export function job<const D extends Dependances, T>(definition: {
  nom: string;
  dependances: D;
  calcul: (resultats: Resultats<D>) => Promise<T> | T;
}): Job<T> {
  let enCours: Promise<T> | undefined;
  return {
    nom: definition.nom,
    resultat() {
      enCours ??= (async () => {
        const resultats = await resoudre(definition.dependances);
        const debut = performance.now();
        const resultat = await definition.calcul(resultats);
        console.log(`✓ ${definition.nom} (${Math.round(performance.now() - debut)} ms)`);
        return resultat;
      })();
      return enCours;
    },
  };
}
