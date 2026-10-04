export type Job<T> = {
  readonly name: string;
  result(): Promise<T>;
};

export type Dependencies = Record<string, Job<unknown>>;

export type Results<D extends Dependencies> = {
  [K in keyof D]: D[K] extends Job<infer T> ? T : never;
};

export async function resolve<D extends Dependencies>(dependencies: D): Promise<Results<D>> {
  const entries = await Promise.all(
    Object.entries(dependencies).map(async ([key, dependency]) => [key, await dependency.result()]),
  );
  return Object.fromEntries(entries) as Results<D>;
}

export function job<const D extends Dependencies, T>(definition: {
  name: string;
  dependencies: D;
  run: (results: Results<D>) => Promise<T> | T;
}): Job<T> {
  let running: Promise<T> | undefined;
  return {
    name: definition.name,
    result() {
      running ??= (async () => {
        const results = await resolve(definition.dependencies);
        const start = performance.now();
        const result = await definition.run(results);
        console.log(`✓ ${definition.name} (${Math.round(performance.now() - start)} ms)`);
        return result;
      })();
      return running;
    },
  };
}
