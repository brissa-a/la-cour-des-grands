import { parseArgs } from "node:util";
import { type DataRoot, dataRoot } from "./publication/paths.ts";
import { type DataVersion, dataVersion } from "./publication/version.ts";

export const DEFAULT_DATA_ROOT = "/data";

export type Options = {
  job: string | undefined;
  dataRoot: DataRoot;
  publishRejected: DataVersion | null;
  pushToRemote: boolean;
  skipNewCutouts: boolean;
};

export function parseOptions(args: string[], env: Readonly<Record<string, string | undefined>>): Options {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "data-root": { type: "string" },
      "publish-rejected": { type: "string" },
      "push-to-remote": { type: "boolean", default: false },
      "skip-new-cutouts": { type: "boolean", default: false },
    },
  });
  const publishRejected = values["publish-rejected"] === undefined ? null : dataVersion(values["publish-rejected"]);
  if (publishRejected !== null && positionals.length > 0) throw new Error("--publish-rejected publishes a rejected snapshot as is and runs no job");
  return {
    job: positionals[0],
    dataRoot: dataRoot(values["data-root"] ?? env.LCDG_DATA_ROOT ?? DEFAULT_DATA_ROOT),
    publishRejected,
    pushToRemote: values["push-to-remote"],
    skipNewCutouts: values["skip-new-cutouts"],
  };
}
