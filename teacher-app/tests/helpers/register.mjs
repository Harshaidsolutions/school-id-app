// Registers the TS loader for the current process (used via `node --import`).
import { register } from "node:module";
register("./loader.mjs", import.meta.url);
