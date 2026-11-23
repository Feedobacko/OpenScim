// Does the visit to an arena that starts now fight its boss with all its
// mechanics, and so draw the boss's scene (presentation.js)? The active
// scenario says, as the encounter reads it when the run starts.
import { getActiveScenario } from "./activeScenario.js";

export function isHostedVisit(arena) {
  const scenario = getActiveScenario();
  return Boolean(arena.hostKind && scenario?.arena === arena.id && scenario.options.bossMechanics);
}
