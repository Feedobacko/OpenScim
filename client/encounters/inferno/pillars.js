import { createCollisionMap } from "../../engine/collision.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { infernoPillarCollisionFlags } from "./collisionFlags.js";
var infernoPillars = [
  {
    key: "west",
    locId: 30353,
    position: [17, 37],
  },
  {
    key: "south",
    locId: 30354,
    position: [27, 23],
  },
  {
    key: "northEast",
    locId: 30355,
    position: [34, 39],
  },
];
var infernoPillarDynamicLocs = infernoPillars.map((pillar) => ({
  locId: pillar.locId,
  localX: pillar.position[0],
  localY: pillar.position[1],
  rotation: 0,
  type: 10,
  level: 0,
}));
var pillarCollapseRemovalTicks = 2;
var scriptedPillarCollapseRemovalTicks = 3;
var infernoPillarFormulaStats = {
  levels: {
    attack: 1,
    strength: 1,
    defence: 1,
    ranged: 1,
    magic: 1,
  },
  offensive: {
    atk: 0,
    ranged: 0,
    magic: 0,
    str: 0,
    rangedStr: 0,
    magicStr: 0,
  },
  defensive: {
    stab: 0,
    slash: 0,
    crush: 0,
    rangedLight: 0,
    rangedStandard: 0,
    rangedHeavy: 0,
    magic: 0,
  },
  attributes: [],
};
function getInfernoPillarTiles(pillar) {
  const tiles = [];
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      tiles.push([pillar.position[0] + dx, pillar.position[1] + dy]);
    }
  }
  return tiles;
}
function createCollisionMapOverlay(baseCollisionMap) {
  const flagOverrides = new Map();
  const getFlag = (x, y) => flagOverrides.get(`${x},${y}`) ?? baseCollisionMap.getFlag(x, y);
  const updateFlag = (x, y, update) => {
    const flag = getFlag(x, y);
    if (flag !== -1) {
      flagOverrides.set(`${x},${y}`, update(flag));
    }
  };
  return {
    sizeX: baseCollisionMap.sizeX,
    sizeY: baseCollisionMap.sizeY,
    getFlag: getFlag,
    hasFlag: (x, y, mask) => {
      const flag = getFlag(x, y);
      return flag !== -1 && (flag & mask) !== 0;
    },
    flag: (x, y, mask) => updateFlag(x, y, (flag) => flag | mask),
    unflag: (x, y, mask) => updateFlag(x, y, (flag) => flag & ~mask),
  };
}
function buildArenaConfigWithPillars(arenaConfig, intactPillarKeys) {
  if (intactPillarKeys.size === 0 && arenaConfig.collisionMap === null) {
    return arenaConfig;
  }
  const collisionMap = arenaConfig.collisionMap
    ? createCollisionMapOverlay(arenaConfig.collisionMap)
    : createCollisionMap(64, 64);
  const walkableTiles = arenaConfig.walkableTiles ? new Set(arenaConfig.walkableTiles) : null;
  for (const pillar of infernoPillars) {
    const intact = intactPillarKeys.has(pillar.key);
    for (const [x, y] of getInfernoPillarTiles(pillar)) {
      if (intact) {
        collisionMap.flag(x, y, infernoPillarCollisionFlags);
        walkableTiles?.delete(`${x},${y}`);
      } else {
        collisionMap.unflag(x, y, infernoPillarCollisionFlags);
        walkableTiles?.add(`${x},${y}`);
      }
    }
  }
  return {
    bounds: arenaConfig.bounds,
    walkableTiles: walkableTiles,
    collisionMap: collisionMap,
  };
}
var infernoPillarNpcDefinition = defineNpc({
  id: "inferno-rocky-support",
  move: false,
  onDamageResolved: ({
    actor: actor,
    damage: damage,
    config: config,
    context: context,
  }) => {
    if (damage.hpBefore > 0 && damage.hpAfter <= 0) {
      config.collapse(actor.state.pillar, context);
    }
  },
});
var infernoPillarCollapseNpcDefinition = defineNpc({
  id: "inferno-rocky-support-collapse",
  move: false,
});
function createPillarActorRecord(supportSpawn) {
  return {
    id: supportSpawn.id,
    kind: "npc",
    npcTypeId: supportSpawn.npcTypeId,
    archetypeId: supportSpawn.archetypeId,
    size: 3,
    role: "npc",
    alive: true,
    position: [...supportSpawn.position],
    previousPosition: [...supportSpawn.position],
    facing: 0,
    lockedFacing: 0,
    vitals: {
      hp: supportSpawn.hp,
      maxHp: supportSpawn.hp,
    },
    history: new Map(),
    formulaStats: structuredClone(infernoPillarFormulaStats),
    spawnTick: supportSpawn.spawnTick,
    untargetable: true,
    blocksNpcMovement: false,
    combat: {
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: "typeless",
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        death: null,
      },
    },
  };
}
function createInfernoPillarActor(pillarSpawn) {
  return infernoPillarNpcDefinition.createActor(
    {
      ...createPillarActorRecord({
        id: pillarSpawn.id,
        npcTypeId: 7709,
        archetypeId: "inferno_pillar",
        position: pillarSpawn.pillar.position,
        spawnTick: pillarSpawn.spawnTick,
        hp: 255,
      }),
      healthBarWhenUntargetable: true,
    },
    {
      pillar: pillarSpawn.pillar.key,
    },
  );
}
export { infernoPillars, infernoPillarDynamicLocs, pillarCollapseRemovalTicks, scriptedPillarCollapseRemovalTicks, getInfernoPillarTiles, buildArenaConfigWithPillars, infernoPillarNpcDefinition, infernoPillarCollapseNpcDefinition, createPillarActorRecord, createInfernoPillarActor };
