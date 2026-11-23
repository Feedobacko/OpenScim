import { encounterRegistry } from "../encounters/registry.js";
import { SimulationEngine } from "./SimulationEngine.js";
function buildSimulationEngine(engineConfig, encounterSeeds, replayTakeoverWork) {
  const {
    kind: kind,
    options: options,
    mechanics: mechanics,
  } = engineConfig.encounterConfig;
  const encounter = encounterRegistry.create(kind, options);
  if (encounterSeeds !== undefined) {
    encounter.reset(encounterSeeds);
  }
  const engine = new SimulationEngine({
    replayTakeoverWork: replayTakeoverWork,
    encounter: encounter,
    objTypeLoader: engineConfig.objTypeLoader ?? undefined,
    enableIntro: engineConfig.enableIntro,
    stats: engineConfig.stats,
    mechanics: {
      ...mechanics,
    },
    ...(undefined === engineConfig.startHp
      ? {}
      : {
          startHp: engineConfig.startHp,
        }),
    ...(options === undefined
      ? {}
      : {
          encounterConfig: options,
        }),
    ...(undefined === engineConfig.startPosition
      ? {}
      : {
          startPos: [...engineConfig.startPosition],
        }),
    ...(undefined === engineConfig.combatSeed
      ? {}
      : {
          combatSeed: engineConfig.combatSeed,
        }),
  });
  engine.setAttackStylePerCategory(engineConfig.attackStylePerCategory);
  engine.setMechanicsConfig(mechanics);
  engine.setInventory(engineConfig.inventory);
  engine.setEquipment(engineConfig.equipment);
  engine.setCombatSupplies(engineConfig.combatSupplies);
  return engine;
}
function createSimulationEngine(engineConfig) {
  return buildSimulationEngine(engineConfig);
}
export { buildSimulationEngine, createSimulationEngine };
