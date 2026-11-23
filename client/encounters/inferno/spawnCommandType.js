import { canPinInfernoWave } from "./startTile.js";
import { parseInfernoSpawnLayout } from "./spawnLayout.js";
function isInfernoSnapshot(encounterSnapshot) {
  return encounterSnapshot.kind === "inferno";
}
function getInfernoSpawnCommandType(encounterSnapshot) {
  if (!encounterSnapshot || !isInfernoSnapshot(encounterSnapshot)) {
    return null;
  }
  const {
    wave: wave,
    startSpawnLayout: startSpawnLayout,
    pinnedWave: pinnedWave,
  } = encounterSnapshot.state;
  if (parseInfernoSpawnLayout(startSpawnLayout)?.wave === wave) {
    return "reroll-wave";
  } else if (canPinInfernoWave(wave)) {
    if (pinnedWave === wave) {
      return "reroll-wave";
    } else {
      return "keep-spawns";
    }
  } else {
    return null;
  }
}
export { isInfernoSnapshot, getInfernoSpawnCommandType };
