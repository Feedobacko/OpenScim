import { getMonsterHitpoints, getMonsterFormulaStats } from "../../engine/monsterStats.js";
import { solHereditNpcTypeId, healingTotemNpcTypeId, colosseumSeqIds } from "./constants.js";
var defaultColosseumFormulaStats = {
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
var colosseumActorTemplates = {
  sol: {
    npcTypeId: solHereditNpcTypeId,
    size: 5,
    archetypeId: "sol_heredit",
  },
  beam_crystal: {
    npcTypeId: 12824,
    size: 1,
    archetypeId: "colosseum_beam_crystal",
  },
  solarflare: {
    npcTypeId: 12826,
    size: 1,
    archetypeId: "colosseum_solarflare",
  },
  bees: {
    npcTypeId: 12823,
    size: 2,
    archetypeId: "colosseum_bees",
  },
  healing_totem: {
    npcTypeId: healingTotemNpcTypeId,
    size: 1,
    archetypeId: "colosseum_healing_totem",
  },
};
function getHealingTotemFormulaStats() {
  const totemStats = getMonsterFormulaStats(healingTotemNpcTypeId);
  return (
    totemStats && {
      ...totemStats,
      alwaysAccuratePlayerHit: true,
    }
  );
}
function createColosseumActor(npcKey, actorId, position) {
  const archetype = colosseumActorTemplates[npcKey];
  const isBoss = npcKey === "sol";
  const maxHp = isBoss ? getMonsterHitpoints(solHereditNpcTypeId) : 1;
  const formulaStats = isBoss
    ? getMonsterFormulaStats(solHereditNpcTypeId)
    : npcKey === "bees"
      ? {
          ...(getMonsterFormulaStats(12823) ?? {
            ...defaultColosseumFormulaStats,
            levels: {
              ...defaultColosseumFormulaStats.levels,
              defence: 0,
            },
          }),
          alwaysAccuratePlayerHit: true,
        }
      : npcKey === "healing_totem"
        ? getHealingTotemFormulaStats()
        : defaultColosseumFormulaStats;
  if (maxHp === undefined || formulaStats === undefined) {
    throw new TypeError(`Missing Colosseum monster data for ${archetype.npcTypeId}`);
  }
  return {
    ...archetype,
    ...(npcKey === "solarflare" || npcKey === "healing_totem"
      ? {
          blocksNpcMovement: false,
        }
      : {}),
    ...(npcKey === "bees"
      ? {
          blocksNpcMovement: false,
          passThruNpcs: true,
          retainAfterDeath: true,
        }
      : {}),
    id: actorId,
    kind: "npc",
    role: isBoss ? "boss" : npcKey === "bees" || npcKey === "healing_totem" ? "minion" : "npc",
    alive: true,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    vitals: {
      hp: maxHp,
      maxHp: maxHp,
    },
    history: new Map(),
    formulaStats: structuredClone(formulaStats),
    combat: {
      // The general fields of an actor record, the same for every actor here.
      // Sol's cadence and reach are in bossAttacks.js and boss.js.
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: "typeless",
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: isBoss
        ? {
            idle: colosseumSeqIds.sol.idle,
            walk: colosseumSeqIds.sol.walk,
            run: colosseumSeqIds.sol.walk,
            attack: colosseumSeqIds.sol.spearTelegraph,
            death: colosseumSeqIds.sol.death,
          }
        : npcKey === "solarflare"
          ? {
              idle: colosseumSeqIds.solarflare.idle,
              walk: colosseumSeqIds.solarflare.idle,
              run: colosseumSeqIds.solarflare.idle,
              attack: null,
              death: null,
            }
          : npcKey === "bees"
            ? {
                idle: colosseumSeqIds.bees.idle,
                walk: colosseumSeqIds.bees.idle,
                run: colosseumSeqIds.bees.idle,
                attack: colosseumSeqIds.bees.attack,
                death: colosseumSeqIds.bees.despawn,
              }
            : npcKey === "healing_totem"
              ? {
                  idle: colosseumSeqIds.totem.idle,
                  walk: null,
                  run: null,
                  attack: colosseumSeqIds.totem.attack,
                  death: null,
                }
              : {
                  idle: colosseumSeqIds.crystal.idle,
                  walk: null,
                  run: null,
                  attack: colosseumSeqIds.crystal.attack,
                  death: null,
                },
    },
  };
}
export { createColosseumActor };
