// The sandbox's way in from the application's menus and the lobby's gateway
// (assets/application.js): the arena to enter, and the step its editor opens at.
import { getActiveScenario } from "./activeScenario.js";
import { getSandboxArena, sandboxVariantKind } from "./arenas.js";

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
