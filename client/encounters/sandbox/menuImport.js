// The scenario code field of the sandbox's setup window (assets/application.js):
// a share code, a link that carries one, or a scenario's JSON becomes the
// active scenario, and the window switches to the scenario's arena, so that
// "Start Encounter" goes straight into it.
import { setActiveScenario } from "./activeScenario.js";
import { getSandboxArena, sandboxVariantKind } from "./arenas.js";
import { importScenarioText } from "./scenario.js";

/** Throws ScenarioError with a message for the player when the text is not a scenario. */
export function loadSandboxCode(text) {
  const scenario = setActiveScenario(importScenarioText(text));
  return {
    encounterKind: sandboxVariantKind(scenario.arena),
    name: scenario.meta.name,
    arenaName: getSandboxArena(scenario.arena).name,
    npcCount: scenario.npcs.length,
  };
}
