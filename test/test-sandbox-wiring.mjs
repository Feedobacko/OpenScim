// What would break the sandbox silently when the rest of the app changes:
//
// - Host hooks. With the arena's boss on, the sandbox hands its host every
//   optional hook the engine calls (encounter.js, sandboxHostHooks). A hook
//   the engine starts calling later, and the sandbox neither implements nor
//   hands on, would be skipped for every boss arena without an error. Every
//   method the engine calls on an encounter must be one of the two.
// - Arena kinds. engine/encounterKinds.js lists the sandbox's variant kinds
//   by hand; they must be the kinds of sandbox/arenas.js, in order.
//
// Plain Node with the harness's module hooks; the engine's calls are read
// from its source, as `encounter.<name>(` or `encounter.<name>?.(`.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

await loadEnvironment();
const { SandboxEncounter, sandboxHostHooks } = await import("../client/encounters/sandbox/encounter.js");
const { sandboxArenas, sandboxKind, sandboxVariantKind } = await import("../client/encounters/sandbox/arenas.js");
const { encounterDefinitions } = await import("../client/engine/encounterKinds.js");

const engineDirectory = new URL("../client/engine/", import.meta.url);
const called = new Set();
for (const file of readdirSync(engineDirectory).filter((name) => name.endsWith(".js"))) {
  const source = readFileSync(new URL(file, engineDirectory), "utf8");
  for (const [, name] of source.matchAll(/\bencounter\??\.([A-Za-z]\w*)\??\.?\(/g)) called.add(name);
}
assert.ok(called.size >= 30, `the engine's encounter calls were found (${called.size})`);

const own = new Set(Object.getOwnPropertyNames(SandboxEncounter.prototype));
const handedOn = new Set(sandboxHostHooks);
const unhandled = [...called].filter((name) => !own.has(name) && !handedOn.has(name)).sort();
assert.deepEqual(unhandled, [], `the engine calls hooks the sandbox neither implements nor hands its host: ${unhandled.join(", ")} (encounter.js, sandboxHostHooks)`);
// And nothing is handed on that the engine no longer calls (a renamed hook).
const stale = [...handedOn].filter((name) => !called.has(name)).sort();
assert.deepEqual(stale, [], `handed to the host but never called by the engine: ${stale.join(", ")}`);

const listed = encounterDefinitions.find((definition) => definition.kind === sandboxKind);
assert.ok(listed, "engine/encounterKinds.js lists the sandbox");
assert.deepEqual(listed.variantKinds, sandboxArenas.slice(1).map((arena) => sandboxVariantKind(arena.id)), "engine/encounterKinds.js lists the arenas of sandbox/arenas.js");

console.log(`sandbox wiring: ${called.size} engine calls handled; ${sandboxArenas.length} arena kinds listed`);
process.exit(0);
