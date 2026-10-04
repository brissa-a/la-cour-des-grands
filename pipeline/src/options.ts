import { parseArgs } from "node:util";

export type Options = {
  job: string | undefined;
  publishTo: { branch: string } | null;
  skipNewCutouts: boolean;
};

function parse(): Options {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      "push-to-remote": { type: "boolean", default: false },
      branch: { type: "string" },
      "skip-new-cutouts": { type: "boolean", default: false },
    },
  });
  const branch = values.branch;
  if (values["push-to-remote"] && branch === undefined) {
    throw new Error("--push-to-remote requires --branch <name> (use --branch main to publish for real)");
  }
  if (!values["push-to-remote"] && branch !== undefined) {
    throw new Error("--branch is only used with --push-to-remote");
  }
  return {
    job: positionals[0],
    publishTo: branch === undefined ? null : { branch },
    skipNewCutouts: values["skip-new-cutouts"],
  };
}

export const options = parse();

export const DEFAULT_BRANCH = "main";
export const targetBranch = options.publishTo?.branch ?? DEFAULT_BRANCH;
