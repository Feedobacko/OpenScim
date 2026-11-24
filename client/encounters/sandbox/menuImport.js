// The scenario code field of the sandbox's setup window (assets/application.js):
// a share code, a link that carries one, or a scenario's JSON becomes the
// active scenario, and the window switches to the scenario's arena, so that
// "Start Encounter" goes straight into it, with the scenario's gear when it
// carries one.
import { getActiveScenario, setActiveScenario } from "./activeScenario.js";
import { getSandboxArena, sandboxVariantKind } from "./arenas.js";
import { importScenarioText } from "./scenario.js";

// The step the editor (editor.js) opens at when it is made again: kept in
// sessionStorage so that it survives the arena being entered, or the page
// loaded again. 0 is its start screen.
export const editorReopenKey = "openscim.sandbox.editorStep";

/**
 * The way into the sandbox from the menus and the lobby's gateway
 * (assets/application.js, handleConfigureEncounter): no setup window, but
 * the arena of the player's scenario, with the editor open at its start
 * screen (load a code, go on, a new scenario, the examples). Returns the
 * kind to enter.
 */
export function sandboxEntryKind() {
  try {
    globalThis.sessionStorage?.setItem(editorReopenKey, "0");
  } catch {
    // The editor opens at its first step instead.
  }
  const scenario = getActiveScenario();
  return sandboxVariantKind(scenario ? scenario.arena : getSandboxArena().id);
}

/** Throws ScenarioError with a message for the player when the text is not a scenario. */
export function loadSandboxCode(text) {
  const scenario = setActiveScenario(importScenarioText(text));
  return {
    encounterKind: sandboxVariantKind(scenario.arena),
    name: scenario.meta.name,
    arenaName: getSandboxArena(scenario.arena).name,
    npcCount: scenario.npcs.length,
    // The scenario's loadout, for the setup window to take (none: keep the player's).
    gear: scenario.gear ? { equipment: scenario.gear.equipment, inventory: scenario.gear.inventory, supplies: scenario.gear.supplies } : null,
  };
}
