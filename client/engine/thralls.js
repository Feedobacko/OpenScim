// The greater thralls of the Arceuus spellbook. From
// oldschool.runescape.wiki/w/Thrall, /w/Resurrect_Greater_Ghost (and
// _Skeleton, _Zombie) and /w/Greater_ghostly_thrall (and skeletal,
// zombified), read 2026-11-23:
//
// - Level 76, 10 fire, 5 blood and 1 cosmic rune (spells.js), and 6 prayer
//   points, which the wiki's table calls the spell's cost: they are taken.
//   The Book of the Dead is worn or carried.
// - A thrall stays one tick per level of Magic as it is when cast (boosted).
//   Another resurrection can be cast 16 ticks after the last; it replaces
//   the thrall that is there.
// - It attacks what the player attacks, every 4 ticks, for 0 to 3: it
//   always hits and ignores defence. Its damage is the player's (it counts
//   for the summoner), so its hits are queued with the player as source.
//   Ghost and skeleton reach 6 tiles; the zombie is melee.
//
// The ids are the cache's (RuneLite's gamevals name them:
// ARCEUUS_THRALL_*_GREATER, HUMAN_SPELLCAST_RESURRECT,
// RESURRECT_*_CAST_SPOTANIM, *_ATTACK_THRALL, THRALL_*_TRAVEL).
//
// The thrall is not an actor of the world: no encounter sees it among its
// NPCs, it blocks no tile and nothing can attack it. It lives on the player
// (`player.thrall`) only while it is there, so a run without one holds the
// state it held before thralls existed.
import { isTileInAttackRange, isTileInsideFootprint } from "./attackRange.js";
import { isArenaTileWalkable } from "./arena.js";
import { isNpcAlive, isNpcAttackableAtTick } from "./npcState.js";
import { getProjectileFlightCycles, projectileTimings } from "./projectiles.js";
import { monsterByNpcTypeId } from "../data/monsters.js";

const BOOK_OF_THE_DEAD_ITEM_ID = 25818;
const THRALL_PRAYER_COST = 6;
const THRALL_COOLDOWN_TICKS = 16;
const THRALL_ATTACK_SPEED = 4;
const THRALL_MAX_HIT = 3;
const RESURRECT_ANIMATION_ID = 8973;
// The sounds the server sends (SoundEffectID: RESURRECT_GREATER_*_CAST_AND_FIRE
// in thrallSpells, RESURRECT_END here). No thrall animation has sounds on its
// frames. ponytail: no sound of a thrall's attack is named, and none is played;
// a recording of the game would name it.
const THRALL_END_SOUND_ID = 5054;

// ponytail: the hit delays are not recorded. The wiki says only that a
// magic thrall hits "1-2 ticks earlier" than a ranged one; a recording
// of the game would settle them.
const thrallSpells = {
  "Resurrect Greater Ghost": {
    npcTypeId: 10880,
    style: "magic",
    attackKind: "magic_shadow",
    range: 6,
    hitDelayTicks: 1,
    castSpotAnimId: 1873,
    castSoundId: 5063,
    idleSeqId: 894,
    attackSeqId: 11101,
    projectile: { spotAnimId: 1907, timing: projectileTimings.magic_spell },
    impactSpotAnimId: 1908,
  },
  "Resurrect Greater Skeleton": {
    npcTypeId: 10883,
    style: "range",
    attackKind: "range_arrow",
    range: 6,
    hitDelayTicks: 2,
    castSpotAnimId: 1874,
    castSoundId: 5048,
    idleSeqId: 13670,
    attackSeqId: 13672,
    projectile: { spotAnimId: 1906, timing: projectileTimings.arrow },
  },
  "Resurrect Greater Zombie": {
    npcTypeId: 10886,
    style: "melee",
    attackKind: "melee_crush",
    range: 1,
    hitDelayTicks: 1,
    castSpotAnimId: 1875,
    castSoundId: 5058,
    idleSeqId: 13675,
    attackSeqId: 13681,
  },
};

function isThrallSpell(spellName) {
  return Object.hasOwn(thrallSpells, spellName);
}

function hasBookOfTheDead(player) {
  return (
    player.equipment.shield === BOOK_OF_THE_DEAD_ITEM_ID ||
    player.inventory.some((itemRef) => itemRef?.id === BOOK_OF_THE_DEAD_ITEM_ID)
  );
}

/**
 * Why the player may not cast a resurrection at `tick`, runes and level aside (canCastSpell checks those): the
 * text of a game message, or null when he may. ponytail: the wiki quotes no message; these are plain words.
 */
function getThrallCastRefusal(player, tick) {
  if (!player.alive) return "";
  if (!hasBookOfTheDead(player)) return "You need the Book of the Dead to cast this spell.";
  if (player.prayerState.points < THRALL_PRAYER_COST) return "You need " + THRALL_PRAYER_COST + " prayer points to cast this spell.";
  const ticksLeft = (player.thrallCooldownUntilTick ?? 0) - tick;
  if (ticksLeft > 0) return "You can cast another resurrection in " + ticksLeft + " ticks.";
  return null;
}

/** Puts the spell's thrall beside the player, replacing one that is there. Returns the events of the cast. */
function resurrectThrall(player, spellName, tick) {
  const spell = thrallSpells[spellName];
  player.prayerState = { ...player.prayerState, points: player.prayerState.points - THRALL_PRAYER_COST };
  player.thrallCooldownUntilTick = tick + THRALL_COOLDOWN_TICKS;
  // Beside the player, not under him: a zombie is a man's size and would be
  // drawn inside him. ponytail: west, east, south, north, the first that is
  // walkable; not recorded which side the game picks.
  const [px, py] = player.position;
  const spawnTile =
    [[px - 1, py], [px + 1, py], [px, py - 1], [px, py + 1]].find(([x, y]) => isArenaTileWalkable(x, y)) ?? [px, py];
  player.thrall = {
    // A new id for each resurrection: the scene keeps a drawn NPC by its id,
    // and a thrall that replaces another must not keep the other's model.
    id: "thrall_" + tick,
    spellName,
    npcTypeId: spell.npcTypeId,
    size: 1,
    position: spawnTile,
    previousPosition: [...spawnTile],
    facing: player.facing,
    spawnTick: tick,
    expiresTick: tick + player.stats.magic.current,
    nextAttackTick: tick + 1,
  };
  const castEvent = { type: "spell_self_cast", animationId: RESURRECT_ANIMATION_ID, spotAnimId: spell.castSpotAnimId, soundId: spell.castSoundId };
  // ponytail: the thrall rises without its spawn animation (GHOST_UPDATE_THRALL_SPAWN and the skeleton's); played
  // as a clip on the tick of the cast, the ghost and the skeleton were not seen in the scene. Add it back with a
  // recording of when the game plays it.
  return [castEvent];
}

function sign(value) {
  return value > 0 ? 1 : value < 0 ? -1 : 0;
}

// ponytail: one greedy step a tick (diagonal, else along one axis), not a
// path search; thralls pathfind round obstacles in the game. Swap in
// playerMovement.js's search if one gets stuck behind a pillar.
function stepToward(thrall, goal, blocked) {
  const [x, y] = thrall.position;
  const dx = sign(goal[0] - x);
  const dy = sign(goal[1] - y);
  for (const [stepX, stepY] of [[dx, dy], [dx, 0], [0, dy]]) {
    if (stepX === 0 && stepY === 0) continue;
    const next = [x + stepX, y + stepY];
    if (isArenaTileWalkable(next[0], next[1]) && !blocked(next)) {
      thrall.position = next;
      return;
    }
  }
}

function faceToward(thrall, target) {
  const dx = target.position[0] + target.size / 2 - thrall.position[0] - 0.5;
  const dy = target.position[1] + target.size / 2 - thrall.position[1] - 0.5;
  if (dx !== 0 || dy !== 0) {
    thrall.facing = (Math.round(Math.atan2(-dx, -dy) * (2048 / (Math.PI * 2))) + 2048) % 2048;
  }
}

function findThrallTarget(player, world, tick) {
  const npc = world.getNpc(player.attackTarget ?? player.lastAttackTarget ?? "");
  if (!npc || !isNpcAlive(npc) || !isNpcAttackableAtTick(npc, tick)) return null;
  return monsterByNpcTypeId.get(npc.npcTypeId)?.immunities.thrall === true ? null : npc;
}

/**
 * The thrall's turn, after the player's attack: it goes back to the grave
 * when its time is up, else moves toward what the player attacks (or back
 * to the player) and attacks it when in reach.
 */
function runThrallTurn(player, { world, tick, random, combatSystem, tickEvents }) {
  const thrall = player.thrall;
  if (!thrall) return;
  if (!player.alive || tick >= thrall.expiresTick) {
    delete player.thrall;
    tickEvents.emit({ type: "game_message", kind: "game", segments: [{ text: "Your thrall returns to the grave." }] });
    tickEvents.emit({ type: "thrall_despawned", soundId: THRALL_END_SOUND_ID });
    return;
  }
  const spell = thrallSpells[thrall.spellName];
  const target = findThrallTarget(player, world, tick);
  thrall.previousPosition = [...thrall.position];
  const inReach = () => !!target && isTileInAttackRange(thrall.position, target.position, target.size, spell.range, true);
  if (target && !inReach()) {
    stepToward(thrall, target.position, (tile) => isTileInsideFootprint(tile, target.position, target.size) || (tile[0] === player.position[0] && tile[1] === player.position[1]));
  } else if (!target && Math.max(Math.abs(thrall.position[0] - player.position[0]), Math.abs(thrall.position[1] - player.position[1])) > 1) {
    stepToward(thrall, player.position, (tile) => tile[0] === player.position[0] && tile[1] === player.position[1]);
  }
  if (!target || !inReach() || tick < thrall.nextAttackTick) return;
  thrall.nextAttackTick = tick + THRALL_ATTACK_SPEED;
  faceToward(thrall, target);
  const damage = Math.floor(random() * (THRALL_MAX_HIT + 1));
  // A roll of 0 is a hit for nothing, shown as the game shows it: blocked.
  // (An accurate hit of the player's is at least 1; see applyHit.)
  combatSystem.queuePendingHit(
    world,
    {
      sourceId: player.id,
      targetId: target.id,
      style: spell.style,
      attackKind: spell.attackKind,
      launchTick: tick,
      impactTick: tick + spell.hitDelayTicks,
      rolledDamage: damage,
      accuracySucceeded: damage > 0,
      sourceDeathPolicy: "persist",
    },
    { source: player, target },
  );
  const distance = Math.max(Math.abs(target.position[0] - thrall.position[0]), Math.abs(target.position[1] - thrall.position[1]));
  const targetVisual = { kind: "actor", actorId: target.id, size: target.size, position: [...target.position] };
  tickEvents.emit({
    type: "inferno_visual",
    animations: [{ actorId: thrall.id, clipId: "attack", delayCycles: 0 }],
    projectiles: spell.projectile
      ? [
          {
            spotAnimId: spell.projectile.spotAnimId,
            sourcePosition: [thrall.position[0] + 0.5, thrall.position[1] + 0.5],
            target: targetVisual,
            startDelayCycles: spell.projectile.timing.delay,
            endDelayCycles: getProjectileFlightCycles(spell.projectile.timing, distance),
            slope: 16,
            startOffset: spell.projectile.timing.progress,
            // ponytail: heights of an arrow (43 and 31, times 4 as the scene measures), not recorded.
            startHeight: 172,
            endHeight: 124,
          },
        ]
      : [],
    graphics: spell.impactSpotAnimId
      ? [{ spotAnimId: spell.impactSpotAnimId, target: targetVisual, height: 0, delayCycles: spell.hitDelayTicks * 30 }]
      : [],
  });
}

/** The thrall as the scene draws an NPC (an entry of the state's `npcs`), or null. */
function getThrallSnapshot(player) {
  const thrall = player.thrall;
  if (!thrall) return null;
  return {
    id: thrall.id,
    npcTypeId: thrall.npcTypeId,
    role: "thrall",
    alive: true,
    position: thrall.position,
    previousPosition: thrall.previousPosition,
    facingAngle: thrall.facing,
    size: 1,
    hp: 1,
    maxHp: 1,
    spawnTick: thrall.spawnTick,
    untargetable: true,
    history: new Map(),
  };
}

export { THRALL_END_SOUND_ID, thrallSpells, isThrallSpell, getThrallCastRefusal, resurrectThrall, runThrallTurn, getThrallSnapshot, THRALL_COOLDOWN_TICKS };
