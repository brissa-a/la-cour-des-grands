import { parseArgs } from "node:util";

export type Options = {
  job: string | undefined;
  pushToRemote: boolean;
  skipNewCutouts: boolean;
};

export function parseOptions(args: string[]): Options {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "push-to-remote": { type: "boolean", default: false },
      "skip-new-cutouts": { type: "boolean", default: false },
    },
  });
  return {
    job: positionals[0],
    pushToRemote: values["push-to-remote"],
    skipNewCutouts: values["skip-new-cutouts"],
  };
}

export const options = parseOptions(process.argv.slice(2));
