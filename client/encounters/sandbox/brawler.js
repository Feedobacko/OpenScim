// The one behaviour of every sandbox NPC: walk toward a target, attack it
// when one of its attacks reaches, wait its attack speed, again. Which
// target is the encounter's to say (`config.selectTarget`): the player
// alone, or in "ffa" the nearest NPC or player of another team. Attacks on
// an NPC are the engine's own NPC-on-NPC attacks (the Inferno's nibblers hit
// the pillars the same way), rolled with the monster table's stats of both.
//
// Random numbers come from `context.random`, the encounter's seeded
// generator; nothing else is random.
import { canNpcActAtTick, isActorAlive } from "../../engine/npcState.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getNpcPursuitMoves, isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { findNpcRouteToMeleeRange } from "../shared/npcRoutes.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange, getDistanceFromNpcCentre } from "../shared/npcAttack.js";
import { scheduleNextActionTick, buildNpcProjectileVisual, getProjectileSourcePosition, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack } from "../inferno/events.js";

// What the formulas and the events call each style.
const planOfStyle = {
  melee: { formulaStyle: "melee_crush", damageType: "melee", attackKind: "melee_crush" },
  range: { formulaStyle: "ranged", damageType: "range", attackKind: "range_arrow" },
  magic: { formulaStyle: "magic", damageType: "magic", attackKind: "magic_fire" },
};
// inferred: a ranged or magic attack without a projectile of its own lands two ticks later.
const defaultDistantImpactTicks = 2;
const cyclesPerTick = 30;

/** The reach that brings an NPC close enough for its longest attack. */
export const getApproachRange = (entry) => Math.max(...entry.attacks.map((attack) => attack.range));

function buildPlan(attack, maxHitOverride, attacker, target) {
  const plan = {
    ...planOfStyle[attack.style],
    sourceDeathPolicy: attack.style === "melee" ? "cancel-before-impact" : "persist",
  };
  const maxHit = maxHitOverride ?? attack.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  let visual = [];
  if (attack.projectile) {
    plan.impactDelayTicks = 0;
    plan.projectile = attack.projectile.timing;
    const endDelayCycles = getProjectileFlightCycles(attack.projectile.timing, getDistanceFromNpcCentre(attacker, target));
    visual = [buildNpcProjectileVisual(attacker, target, attack.projectile, endDelayCycles)];
  } else if (attack.flight) {
    plan.impactDelayTicks = Math.ceil(attack.flight.endDelayCycles / cyclesPerTick);
    const { spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight } = attack.flight;
    visual = [{ spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight, sourcePosition: getProjectileSourcePosition(attacker), target: buildActorVisualTarget(target) }];
  } else {
    plan.impactDelayTicks = attack.impactDelayTicks ?? (attack.style === "melee" ? 0 : defaultDistantImpactTicks);
  }
  return { plan, visual };
}

// When the straight walk is blocked (a pillar, a wall between them and no
// line of sight), one step along the route search toward the target, as the
// Colosseum's minotaur does with its modifier Red Flag (colosseum/minotaur.js).
function routeAround(actor, target, context) {
  const occupancy = context.world.occupancy;
  const [ownX, ownY] = actor.position;
  const isOwnTile = (x, y) => x >= ownX && x < ownX + actor.size && y >= ownY && y < ownY + actor.size;
  const isClearOfOthers = ([x, y], size) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (occupancy.isBlocked(x + dx, y + dy) && !isOwnTile(x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  const route = findNpcRouteToMeleeRange({
    source: actor.position,
    destination: [...target.position],
    size: actor.size,
    canOccupy: (tile, size) => isArenaFootprintWalkable(tile, size) && isClearOfOthers(tile, size),
    moveNear: true,
  });
  const step = route.kind === "failed" ? undefined : route.steps[0];
  return step ? [{ npcId: actor.id, path: [step] }] : [];
}

export const brawlerNpcDefinition = defineNpc({
  id: "sandbox-brawler",
  // The scene plays the death; the encounter takes the body away (encounter.js).
  onDamageResolved: ({ actor, damage }) => {
    if (damage?.sourceId) actor.state.lastAttackerId = damage.sourceId;
  },
  move: ({ actor, context, config }) => {
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return [];
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return [];
    const moves = getNpcPursuitMoves(actor, context, target);
    if (moves.length > 0 || isNpcInAttackRange(actor, target, actor.combat.attackRange)) return moves;
    return routeAround(actor, target, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor) || context.tick < actor.combat.nextActionTick) return idle;
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return idle;
    const entry = config.entryOf(actor);
    const inReach = entry.attacks.filter((attack) => isNpcInAttackRange(actor, target, attack.range));
    if (inReach.length === 0) return idle;
    const attack = inReach.length === 1 ? inReach[0] : inReach[Math.floor(context.random() * inReach.length)];
    const { plan, visual } = buildPlan(attack, actor.state.maxHit, actor, target);
    const npcAttack = rollNpcAttack({ attacker: actor, target, plan, random: context.random });
    // Null when an NPC has no stats: the catalog holds only NPCs of the monster table.
    if (!npcAttack) return idle;
    emitInfernoNpcAttack(context, {
      actor,
      target,
      clipId: attack.clip,
      kind: `sandbox_${attack.style}`,
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: visual,
    });
    actor.combat.attackStyle = attack.style;
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});
