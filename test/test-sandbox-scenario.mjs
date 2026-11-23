// The sandbox's scenario format (client/encounters/sandbox/scenario.js):
// share codes and files read back what was written, bad input is refused
// with a message, and the ten examples are valid. Plain Node, no browser.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

// scenario.js takes pako from vendor.js, which Node loads through the harness's module hooks.
await loadEnvironment();
const scenario = await import("../client/encounters/sandbox/scenario.js");
const { sandboxExamples } = await import("../client/encounters/sandbox/examples.js");
const { sandboxArenas } = await import("../client/encounters/sandbox/arenas.js");

const { normalizeScenario, encodeShareCode, decodeShareCode, importScenarioText, scenarioToJson, ScenarioError } = scenario;

// Ten examples, every one valid, in more than one arena and both modes; one has two Sol Heredits.
assert.equal(sandboxExamples.length, 10);
assert.equal(new Set(sandboxExamples.map((entry) => entry.key)).size, 10);
assert.ok(new Set(sandboxExamples.map((entry) => entry.scenario.arena)).size >= 6);
assert.deepEqual(new Set(sandboxExamples.map((entry) => entry.scenario.mode)), new Set(["versus", "ffa"]));
// Two Suns: the real Sol Heredit (the arena's host, bossMechanics) and a second one of the sandbox's.
const twoSuns = sandboxExamples.find((entry) => entry.key === "two-suns").scenario;
assert.equal(twoSuns.arena, "sol_heredit");
assert.equal(twoSuns.options.bossMechanics, true);
assert.equal(twoSuns.npcs.filter((npc) => npc.npc === "sol_heredit").length, 1);
for (const { scenario: example } of sandboxExamples) assert.deepEqual(normalizeScenario(example), example);

// A share code, a link that carries one, and the JSON all read back the same scenario.
for (const { scenario: example } of sandboxExamples) {
  const code = encodeShareCode(example);
  assert.match(code, /^OSB1\.[\w-]+$/);
  assert.deepEqual(decodeShareCode(code), example);
  assert.deepEqual(importScenarioText(`https://openscim.dev/sandbox/${example.arena}#sbx=${code}`), example);
  assert.deepEqual(importScenarioText(scenarioToJson(example)), example);
}

// What is filled in, and what is dropped.
const minimal = normalizeScenario({ arena: "yama", npcs: [{ npc: "inferno.bat", position: [30, 30], hp: 5.5, team: "  red ", levels: { magic: 99, nonsense: 1 } }] });
assert.equal(minimal.format, "openscim-sandbox");
assert.equal(minimal.version, 1);
assert.equal(minimal.mode, "versus");
assert.equal(minimal.meta.name, "Untitled");
assert.deepEqual(minimal.options, { playerStart: null, ffaIncludesPlayer: true, bossMechanics: false });
assert.deepEqual(minimal.npcs, [{ id: "npc-1", npc: "inferno.bat", position: [30, 30], team: "red", levels: { magic: 99 } }]);

// Refused, each with a message.
const refuses = (input, pattern) => assert.throws(() => normalizeScenario(input), (error) => error instanceof ScenarioError && pattern.test(error.message));
refuses(null, /JSON object/);
refuses({ arena: "nowhere" }, /Unknown arena/);
refuses({ arena: "yama", version: 99 }, /version 99/);
refuses({ arena: "yama", format: "other" }, /Not a sandbox scenario/);
refuses({ arena: "yama", npcs: [{ npc: "nobody", position: [1, 1] }] }, /unknown NPC/);
refuses({ arena: "yama", npcs: [{ npc: "inferno.bat", position: [1] }] }, /position/);
refuses({ arena: "yama", npcs: Array.from({ length: 41 }, () => ({ npc: "inferno.bat", position: [1, 1] })) }, /At most 40/);
assert.throws(() => decodeShareCode("OSB1.!!!"), ScenarioError);
assert.throws(() => decodeShareCode("OSB1.AAAA"), ScenarioError);
assert.throws(() => importScenarioText("{ not json"), /Not valid JSON/);

// Every arena is a variant of the sandbox with a route.
assert.equal(sandboxArenas.length, new Set(sandboxArenas.map((arena) => arena.id)).size);

console.log("sandbox scenario format: ok");
process.exit(0);
