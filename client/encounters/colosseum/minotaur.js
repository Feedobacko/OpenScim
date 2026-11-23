// The minotaur: three tiles wide, it walks up to the player and smashes every
// five ticks. While the player is not beside it, it heals a wounded monster
// near it to full instead. It comes as a reinforcement in waves 7 to 11.
// With the modifier Red Flag it finds its way round what blocks it.
import { hasLineOfSight } from "../../engine/attackRange.js";
import { isNpcInAttackRange } from "../shared/npcAttack.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick, healNpc, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { findNpcRouteToMeleeRange } from "../shared/npcRoutes.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { colosseumMonsters } from "./constants.js";
import { canWaveMonsterAttack, getStepsToPlayer, moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

const smashPlan = {
  formulaStyle: "melee_crush",
  damageType: "melee",
  attackKind: "melee_crush",
  maxHit: 74, // WIKI; the formula gives the same from TABLE's stats
  // WIKI: "its damage is calculated one tick later than its attack
  // animation", so the prayer that counts is the one up when it lands. SIM
  // lands it one tick after the swing too, and counts the prayer at the swing.
  impactDelayTicks: 1,
  prayerCheckAt: "impact",
  sourceDeathPolicy: "persist",
};
// WIKI, the conditions of the heal: the other monster's health is below 75 %,
// and its centre tile is in sight of the minotaur's centre tile and no more
// than 7 tiles from it. (The same page's introduction says "within 6 tiles".)
const healBelowHealthFraction = 0.75;
const healRange = 7;

// OBS, one heal: on the tick the minotaur plays its heal animation, the
// healed monster draws spot animation 444 (CACHE: tzhaar_heal), 128 high,
// and its heal hitsplat. No projectile, and no sound but those on the
// frames of the animation.
const healGraphic = { spotAnimId: 444, height: 128 };

const getCentreTile = (npc) => [npc.position[0] + Math.floor(npc.size / 2), npc.position[1] + Math.floor(npc.size / 2)];

// The monster the minotaur would heal: the first in turn order that meets
// the wiki's conditions. Which one it picks among several is inferred.
function findMonsterToHeal(actor, context) {
  const [x, y] = getCentreTile(actor);
  return context.world.getNpcs().find((npc) => {
    if (npc === actor || !npc.alive || npc.death !== undefined || npc.vitals.hp >= npc.vitals.maxHp * healBelowHealthFraction) {
      return false;
    }
    const [otherX, otherY] = getCentreTile(npc);
    return Math.max(Math.abs(otherX - x), Math.abs(otherY - y)) <= healRange && hasLineOfSight(x, y, otherX, otherY);
  });
}

// WIKI, the modifier Red Flag: "Minotaurs gain the ability to routefind,
// allowing it to move around obstacles". The route is the shortest over the
// arena's floor to a tile beside the player, one step of it a tick, searched
// anew every tick.
// inferred: the route goes round the other monsters as it goes round a
// pillar. (The search ends as near the player as it gets when it cannot
// reach him; only when it finds no step at all is the floor alone asked,
// and a step of that route that another monster stands in is not taken.)
// With the player under it the minotaur steps off him as any monster does.
function moveWithRouteFinding(hook) {
  const { actor, context } = hook;
  const player = context.world.getPlayer();
  if (actor.alive && player?.alive && getStepsToPlayer(actor, player) === 0) {
    return moveWaveMonster(hook);
  }
  if (!actor.alive || !player?.alive || isNpcInAttackRange(actor, player, actor.combat.attackRange)) {
    return [];
  }
  const occupancy = context.world.occupancy;
  const [ownX, ownY] = actor.position;
  const isOwnTile = (x, y) => x >= ownX && x < ownX + actor.size && y >= ownY && y < ownY + actor.size;
  const isClearOfOthers = ([x, y], size) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (occupancy.isBlocked(x + dx, y + dy) && !isOwnTile(x + dx, y + dy)) {
          return false;
        }
      }
    }
    return true;
  };
  const findRoute = (canOccupy) => findNpcRouteToMeleeRange({ source: actor.position, destination: [...player.position], size: actor.size, canOccupy, moveNear: true });
  let route = findRoute((tile, size) => isArenaFootprintWalkable(tile, size) && isClearOfOthers(tile, size));
  if (route.kind === "failed") {
    route = findRoute(isArenaFootprintWalkable);
  }
  const step = route.kind === "failed" ? undefined : route.steps[0];
  // The engine moves an NPC along the path it is given without asking who stands there.
  return step && isClearOfOthers(step, actor.size) ? [{ npcId: actor.id, path: [step] }] : [];
}

export const minotaurNpcDefinition = defineNpc({
  id: "colosseum-minotaur",
  move: (hook) => (hook.config.modifiers().redflag ? moveWithRouteFinding(hook) : moveWaveMonster(hook)),
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!player?.alive || context.tick < actor.combat.nextActionTick) {
      return idle;
    }
    if (canWaveMonsterAttack(actor, player, context.tick)) {
      const npcAttack = rollWaveMonsterAttack(actor, player, smashPlan, context, config);
      emitInfernoNpcAttack(context, { actor, target: player, clipId: "attack", kind: "colosseum_minotaur_smash", impactDelayTicks: smashPlan.impactDelayTicks });
      scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.minotaur.attackSpeed);
      return { environmentalDamages: [], npcAttacks: [npcAttack] };
    }
    // WIKI: it heals only while the player is not within melee distance of
    // it, "including diagonally". That a heal takes the place of an attack on
    // its attack timer is inferred.
    const wounded = getStepsToPlayer(actor, player) > 1 ? findMonsterToHeal(actor, context) : undefined;
    if (wounded) {
      // Turns the minotaur to the monster and plays the clip; the attack event
      // it emits besides is what the heal's sound answers (audio.js).
      emitInfernoNpcAttack(context, { actor, target: wounded, clipId: "heal", kind: "colosseum_minotaur_heal", impactDelayTicks: 0 });
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: [{ ...healGraphic, target: buildActorVisualTarget(wounded), delayCycles: 0 }] });
      healNpc(wounded, wounded.vitals.maxHp - wounded.vitals.hp, context.tickEvents);
      scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.minotaur.attackSpeed);
    }
    return idle;
  },
});
