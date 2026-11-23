// Preload for the determinism harness: imports one client module before
// anything else, so that it is the first module of the import graph to be
// entered. A module that only works when rendering.js was evaluated before it
// fails here.
//   LOAD_FIRST=client/engine/combatFormulas.js node --import ./tools/determinism/load-first.mjs tools/determinism/harness.mjs
import { register } from "node:module";
import { pathToFileURL } from "node:url";
const base = pathToFileURL(process.cwd() + "/");
register("./tools/determinism/node-hooks.mjs", base);
globalThis.self ??= globalThis; // PicoGL reads `self` when it loads
globalThis.location ??= { pathname: "/" };
await import(new URL(process.env.LOAD_FIRST, base).href);
