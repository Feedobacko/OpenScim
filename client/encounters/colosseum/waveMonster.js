// What the monsters of the waves have in common: how one becomes an actor,
// how it walks, and when it may attack. One module per monster holds its
// attack (shaman.js, jaguar.js, javelin.js, manticore.js, shockwave.js,
// minotaur.js).
import { getDistanceToFootprint } from "../../engine/attackRange.js";
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { isNpcInAttackRange, rollNpcAttack } from "../shared/npcAttack.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { applyRelentlessToPlan, applyRelentlessDefenceBypass } from "../sol-heredit/minions.js";
import { colosseumMonsters, firstAttackDelayTicks } from "./constants.js";

// The plain actor of a monster; `kind` is a key of colosseumMonsters and
// `spawnTick` the tick it is placed on. It takes its first turn on the tick
// after.
export function createWaveMonsterActor(kind, { id, position, spawnTick }) {
  const monster = colosseumMonsters[kind];
  const hitpoints = getMonsterHitpoints(monster.npcTypeId);
  const formulaStats = getMonsterFormulaStats(monster.npcTypeId);
  if (hitpoints === undefined || formulaStats === undefined) {
    throw new TypeError(`Missing Colosseum monster data for ${monster.npcTypeId}`);
  }
  return {
    id,
    kind: "npc",
    // Not "boss": the default scene plays the death of any other NPC by itself.
    role: "minion",
    npcTypeId: monster.npcTypeId,
    archetypeId: `colosseum_${kind}`,
    size: monster.size,
    alive: true,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    spawnTick,
    history: new Map(),
    vitals: { hp: hitpoints, maxHp: hitpoints },
    formulaStats: structuredClone(formulaStats),
    combat: {
      attackSpeed: monster.attackSpeed,
      attackRange: monster.attackRange,
      attackStyle: monster.attackStyle,
      nextActionTick: spawnTick + firstAttackDelayTicks,
      targetId: "player",
      lastAttackTick: null,
      // The sequences are in the render config (presentation.js).
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}

// The `move` hook of a monster's definition. A monster walks towards the
// player until he is in its reach and in its sight, one tile a tick, without
// finding a way round what blocks it (the default of an NPC definition).
// SIM: on its first turn it takes that step even when it could attack from
// where it was placed. (SIM treats its reach as 0 for that turn; here it is
// 1, because this engine's pursuit does not move an NPC whose reach is 0. The
// two differ only for a monster placed beside the player.)
export function moveWaveMonster({ actor, context }) {
  if (context.tick !== actor.spawnTick + 1) {
    return getNpcPursuitMoves(actor, context);
  }
  const attackRange = actor.combat.attackRange;
  actor.combat.attackRange = 1;
  try {
    return getNpcPursuitMoves(actor, context);
  } finally {
    actor.combat.attackRange = attackRange;
  }
}

// Whether a monster may attack the player this tick (SIM): its attack timer
// has run down, and the player is alive, in its reach, in its sight and not
// under it.
export function canWaveMonsterAttack(actor, player, tick) {
  return player?.alive === true && tick >= actor.combat.nextActionTick && isNpcInAttackRange(actor, player, actor.combat.attackRange);
}

// An attack of a wave's monster on the player, rolled now. `config` is what
// the encounter registered the monster's definition with: its `modifiers()`
// are the modifiers of the run. WIKI, the modifier Relentless: enemy attacks
// bypass 33 % of the player's Defence level (66 % at level II) and their max
// hit is 1 higher (3, 6); at level III they "fully ignore accuracy checks".
// How it is applied is Sol Heredit's module's, which does it for his
// warband.
export function rollWaveMonsterAttack(actor, player, plan, context, config) {
  const relentless = config.modifiers().relentless ?? 0;
  const npcAttack = rollNpcAttack({
    attacker: actor,
    target: relentless === 0 ? player : applyRelentlessDefenceBypass(player, relentless),
    plan: relentless === 0 ? plan : applyRelentlessToPlan(plan, relentless),
    random: context.random,
  });
  // Null when the monster table has no stats for the NPC type.
  if (!npcAttack) {
    throw new TypeError(`Missing formula stats for ${actor.id}`);
  }
  return npcAttack;
}

/** The steps from the player's tile to the nearest tile of a monster; a diagonal step counts as one. */
export function getStepsToPlayer(actor, player) {
  return getDistanceToFootprint(player.position[0], player.position[1], actor.position[0], actor.position[1], actor.size);
}
