import escapeStringRegexp from "escape-string-regexp";
import cash from "cash";
import bash from "bash-parser";
import { sed } from "sed-lite";

export { escapeStringRegexp, cash, bash, sed };
export { default as completeExecutables } from "./utils/complete-executables"

import * as namedExports from "./bash-utils.js"
export default namedExports;

