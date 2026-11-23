// The manticore: three tiles wide, with a reach of 15 tiles. When it first
// has the player in reach and in sight it settles the order of its three
// orbs, one of each combat style, and charges for 10 ticks. Then it throws
// them one tick apart, and charges again. It is in waves 4 to 11, in pairs
// from wave 9.
//
// OBS is one manticore in wave 4, nine volleys, all of them ranged, magic,
// melee. T is the tick the first orb leaves:
//   T-6            the charge animation starts (it lasts 4 ticks)
//   T-5, T-4, T-3  the orbs appear over it, 300, 400 and 500 high
//   T, T+1, T+2    the throw animation (3 ticks); an orb leaves on each tick
//   T+1, T+2, T+3  the hitsplats
//   T+4            the next charge animation: a volley every 10 ticks
//
// The modifier Mantimayhem (WIKI): at level I each orb "add[s] an additional
// projectile", hitting twice; at level II an orb that is not prayed against
// inflicts venom; at level III the three orbs come "in any order of magic,
// range, and melee".
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { isNpcInAttackRange } from "../shared/npcAttack.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { getProjectileSourcePosition, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { colosseumMonsters, manticoreOrbSpotAnimIds, manticoreOrbImpactSpotAnimIds, venomFromPoisonVarp } from "./constants.js";
import { moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

// WIKI: the most each orb hits for. (OBS: a melee orb that was not prayed
// against hit 31.)
const orbPlans = {
  range: { formulaStyle: "ranged", damageType: "range", attackKind: "range_arrow", maxHit: 36 },
  magic: { formulaStyle: "magic", damageType: "magic", attackKind: "magic_fire", maxHit: 31 },
  melee: { formulaStyle: "melee_crush", damageType: "melee", attackKind: "melee_crush", maxHit: 31 },
};
// WIKI and SIM: the first two orbs are ranged then magic or magic then
// ranged, and the last is always melee.
const orbOrders = [
  ["range", "magic", "melee"],
  ["magic", "range", "melee"],
];
// Mantimayhem III: the four orders that do not end with melee as well.
const anyOrbOrders = [...orbOrders, ["range", "melee", "magic"], ["magic", "melee", "range"], ["melee", "range", "magic"], ["melee", "magic", "range"]];
// OBS and SIM: the hitsplat comes one tick after the orb leaves, at 2 to 4
// tiles (SIM: at any distance), and the prayer that counts is the one up
// when it leaves: 26 orbs prayed against as they left all hit 0, 24 of them
// with another prayer up a tick later; the one that was not hit 31. (WIKI:
// the orbs "land with a projectile travel time of 0".)
const orbImpactDelayTicks = 1;
// OBS: an orb leaves on the tick it is thrown and flies 30 client cycles,
// from the height it was held at down to 50, with slope 127; the first orb
// has a start offset of 50, the other two 0. OBS saw one order only: that
// the heights and the start offset go with an orb's place in the order, and
// not with its style, is inferred.
const orbFlight = { startDelayCycles: 0, endDelayCycles: 30, slope: 127, endHeight: 50 };
const orbHeights = [300, 400, 500];
const orbStartOffsets = [50, 0, 0];
// OBS, once: the melee orb that hurt drew its impact on the player, 100
// high, as its hitsplat came; an orb that was prayed against drew none. That
// the other two styles do the same, and that an orb which misses without a
// prayer draws it too, is inferred.
const orbImpactGraphicHeight = 100;
// WIKI: a manticore copies the order of another that is within 15 tiles of
// it and in its sight.
const copyRange = 15;
// WIKI and SIM: when a manticore throws, another that was ready is held back
// by 5 ticks.
const heldBackTicks = 5;
// OBS and SIM: the charge animation starts when 6 ticks of the charge are
// left, and the three orbs appear over the manticore when 5, 4 and 3 are
// left; it holds each until that orb leaves.
const chargeClipTicksLeft = 6;
const firstOrbShownTicksLeft = 5;
// OBS: the game sends a held orb anew every tick. The scene plays a graphic
// out instead, 60 client cycles for an orb (CACHE): so an orb is drawn every
// second tick, and once more two ticks before it leaves, which makes it end
// as it flies off.
const heldOrbGraphicTicks = 2;

const chargeTicks = colosseumMonsters.manticore.attackSpeed;

function chooseOrbOrder(actor, context, config) {
  const other = context.world
    .getNpcs()
    .find((npc) => npc !== actor && npc.alive && manticoreNpcDefinition.getState(npc)?.orbOrder && isNpcInAttackRange(actor, npc, copyRange));
  if (other) {
    return [...manticoreNpcDefinition.getState(other).orbOrder];
  }
  const orders = (config.modifiers().mantimayhem ?? 0) >= 3 ? anyOrbOrders : orbOrders;
  return [...orders[Math.floor(context.random() * orders.length)]];
}

const heldOrbGraphic = (actor, orbIndex) => ({
  spotAnimId: manticoreOrbSpotAnimIds[actor.state.orbOrder[orbIndex]],
  target: buildActorVisualTarget(actor),
  height: orbHeights[orbIndex],
  delayCycles: 0,
});

// One orb leaves the manticore: an attack of its own, rolled now, or two of
// them with Mantimayhem. `graphics` is what else there is to draw on this
// tick. Returns the attacks. (The second projectile of Mantimayhem is not
// drawn: no source says how it flies.)
function throwOrb(actor, player, orbIndex, context, config, graphics = []) {
  const style = actor.state.orbOrder[orbIndex];
  const plan = orbPlans[style];
  const mantimayhem = config.modifiers().mantimayhem ?? 0;
  const isPrayedAgainst = isCorrectProtectionPrayer(plan.damageType, player.activePrayer);
  const npcAttacks = Array.from({ length: mantimayhem >= 1 ? 2 : 1 }, (unusedElement, hitIndex) => ({
    ...rollWaveMonsterAttack(actor, player, { ...plan, impactDelayTicks: orbImpactDelayTicks, sourceDeathPolicy: "persist" }, context, config),
    // The engine announces an attack once: the second hit continues the first.
    ...(hitIndex === 0 ? {} : { isContinuation: true }),
    ...(mantimayhem >= 2 && !isPrayedAgainst ? { applyPoison: venomFromPoisonVarp } : {}),
  }));
  const projectiles = [
    {
      ...orbFlight,
      spotAnimId: manticoreOrbSpotAnimIds[style],
      startOffset: orbStartOffsets[orbIndex],
      startHeight: orbHeights[orbIndex],
      sourcePosition: getProjectileSourcePosition(actor),
      target: buildActorVisualTarget(player),
    },
  ];
  if (!isPrayedAgainst) {
    graphics.push({
      spotAnimId: manticoreOrbImpactSpotAnimIds[style],
      target: buildActorVisualTarget(player),
      height: orbImpactGraphicHeight,
      delayCycles: orbFlight.endDelayCycles,
    });
  }
  if (orbIndex === 0) {
    emitInfernoNpcAttack(context, { actor, target: player, clipId: "throw", kind: "colosseum_manticore_orbs", impactDelayTicks: orbImpactDelayTicks, projectiles });
    if (graphics.length > 0) {
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
    }
  } else {
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles, graphics });
  }
  return npcAttacks;
}

// The orbs the manticore holds over itself while it charges and while it
// waits for the player to come into sight: one more of them when 5, 4 and 3
// ticks of the charge are left.
function drawHeldOrbs(actor, context) {
  const state = actor.state;
  const ticksLeft = actor.combat.nextActionTick - context.tick;
  while (state.orbShownTicks.length < state.orbOrder.length && ticksLeft <= firstOrbShownTicksLeft - state.orbShownTicks.length) {
    state.orbShownTicks.push(context.tick);
  }
  const graphics = state.orbShownTicks.flatMap((shownTick, orbIndex) => {
    // While it charges, the tick an orb leaves is known; while it waits, not.
    const ticksUntilItLeaves = ticksLeft > 0 ? ticksLeft + orbIndex : Infinity;
    const isDrawn = (context.tick - shownTick) % heldOrbGraphicTicks === 0 ? ticksUntilItLeaves >= heldOrbGraphicTicks : ticksUntilItLeaves === heldOrbGraphicTicks;
    return isDrawn ? [heldOrbGraphic(actor, orbIndex)] : [];
  });
  if (graphics.length > 0) {
    emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
  }
}

export const manticoreNpcDefinition = defineNpc({
  id: "colosseum-manticore",
  move: moveWaveMonster,
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    const state = actor.state;
    if (!player?.alive) {
      return idle;
    }
    // The second and third orb leave one and two ticks after the first,
    // whether the player is still in sight or not (SIM).
    if (state.volleyTick !== null) {
      const orbIndex = context.tick - state.volleyTick;
      if (orbIndex >= 2) {
        state.volleyTick = null;
      }
      if (orbIndex === 1 || orbIndex === 2) {
        return { environmentalDamages: [], npcAttacks: throwOrb(actor, player, orbIndex, context, config) };
      }
    }
    const inSight = isNpcInAttackRange(actor, player, actor.combat.attackRange);
    if (state.orbOrder === null) {
      // OBS: with the player in sight from the start, its first orb left 13
      // ticks after it appeared: the charge began on the third tick, the
      // first on which a monster of a wave may attack (waveMonster.js sets
      // nextActionTick to it). SIM begins it a tick sooner.
      if (inSight && context.tick >= actor.combat.nextActionTick) {
        state.orbOrder = chooseOrbOrder(actor, context, config);
        actor.combat.nextActionTick = context.tick + chargeTicks;
      }
      return idle;
    }
    const ticksLeft = actor.combat.nextActionTick - context.tick;
    if (ticksLeft === chargeClipTicksLeft) {
      emitInfernoVisual(context.tickEvents, { animations: [{ actorId: actor.id, clipId: "charge", delayCycles: 0 }], projectiles: [], graphics: [] });
    }
    // OBS: the charge goes on while the manticore walks to get the player
    // back in sight. SIM: it throws only with him in sight.
    if (ticksLeft > 0 || !inSight) {
      drawHeldOrbs(actor, context);
      return idle;
    }
    actor.combat.nextActionTick = context.tick + chargeTicks;
    for (const npc of context.world.getNpcs()) {
      if (npc !== actor && npc.alive && manticoreNpcDefinition.getState(npc)?.orbOrder && context.tick >= npc.combat.nextActionTick) {
        npc.combat.nextActionTick = context.tick + heldBackTicks;
      }
    }
    state.volleyTick = context.tick;
    state.orbShownTicks = [];
    // The third orb leaves two ticks from now: its last drawing over the manticore.
    return { environmentalDamages: [], npcAttacks: throwOrb(actor, player, 0, context, config, [heldOrbGraphic(actor, 2)]) };
  },
});

/** The state of a manticore that has not seen the player yet: no order of orbs, none shown, no volley under way. */
export const createManticoreState = () => ({ orbOrder: null, orbShownTicks: [], volleyTick: null });
