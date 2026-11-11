import { parseOptions } from "./options.ts";

export const options = parseOptions(process.argv.slice(2), process.env);
