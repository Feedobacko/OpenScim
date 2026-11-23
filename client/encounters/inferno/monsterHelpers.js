import { getArenaCollisionMap } from "../../engine/arena.js";
import { isActorAlive } from "../../engine/npcState.js";
import { weightEqually, getContextDecisions } from "../../engine/decisions.js";
import { isNpcInAttackRange } from "../shared/npcAttack.js";
import { isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { copyTilePosition, emitInfernoVisual } from "./events.js";
import { monsterObstacleCollisionFlags } from "./collisionFlags.js";
function chooseDistinctValues(decisions, decisionKey, candidates, count) {
  const remaining = [...candidates];
  const picked = [];
  for (let ordinal = 0; ordinal < count && remaining.length > 0; ordinal++) {
    const choice = decisions.choose(
      {
        ...decisionKey,
        ordinal: ordinal,
      },
      weightEqually(remaining),
    );
    remaining.splice(remaining.indexOf(choice), 1);
    picked.push(choice);
  }
  return picked;
}
function buildLabelledDecisions(context) {
  return {
    decisions: getContextDecisions(context),
    tick: context.tick,
  };
}
function canNpcAttackWithPlan(attacker, target, plan) {
  return (
    !attacker.combat.startedTurnOverlappingTarget &&
    isNpcInAttackRange(attacker, target, plan.damageType === "melee" ? 1 : attacker.combat.attackRange)
  );
}
// For the monsters of the waves, Jad and Zuk's healers; Zuk himself never
// emits it. See emitZukAttack in events.js for the name.
function emitZukDeath(context, event) {
  context.tickEvents.emit({
    type: "zuk_death",
    ...event,
    position: copyTilePosition(event.position),
  });
}
function emitInfernoAbility(context, event) {
  context.tickEvents.emit({
    type: "inferno_ability",
    ...event,
    position: copyTilePosition(event.position),
  });
}
function isCombatActionDue(combat, tick) {
  return tick >= combat.nextActionTick;
}
function emitZukHit({ actor: actor, damage: damage, context: context }) {
  if (damage.effectiveDamage < 0 || damage.hpAfter > damage.hpBefore) {
    return;
  }
  const npcKind =
    {
      zuk: "zuk",
      zuk_shield: "shield",
      zuk_mager: "mager",
      zuk_ranger: "ranger",
      zuk_jad: "jad",
      zuk_jad_healer: "jad_healer",
      zuk_healer: "healer",
      inferno_mager: "mager",
      inferno_ranger: "ranger",
      inferno_jad: "jad",
      inferno_jad_healer: "jad_healer",
      inferno_nibbler: "nibbler",
      inferno_bat: "bat",
      inferno_blob: "blob",
      inferno_blob_mage: "blob_child",
      inferno_blob_range: "blob_child",
      inferno_blob_melee: "blob_child",
      inferno_meleer: "meleer",
    }[actor.archetypeId] ?? null;
  if (npcKind !== null && npcKind !== "shield") {
    const eventContext = context;
    const event = {
      actorId: actor.id,
      npcKind: npcKind,
      position: actor.position,
    };
    eventContext.tickEvents.emit({
      type: "zuk_hit",
      ...event,
      position: copyTilePosition(event.position),
    });
    if (!(damage.hpAfter <= 0) && npcKind !== "mager" && npcKind !== "blob_child") {
      emitInfernoVisual(context.tickEvents, {
        animations: [
          {
            actorId: actor.id,
            clipId: "defend",
            delayCycles: 0,
          },
        ],
        projectiles: [],
        graphics: [],
      });
    }
  }
}
function resolveMonsterTarget(actor, world) {
  const targetId = actor.combat.targetId;
  if (targetId === null) {
    return null;
  }
  const target = world.getPlayers().find((player) => player.id === targetId) ?? world.getNpc(targetId);
  if (target != null && isActorAlive(target)) {
    return target;
  }
  const fallbackPlayer = world.getPlayer();
  if (fallbackPlayer?.alive) {
    actor.combat.targetId = fallbackPlayer.id;
    return fallbackPlayer;
  } else {
    return null;
  }
}
function isOpenFloorFootprint(tile, size) {
  if (!isArenaFootprintWalkable(tile, size)) {
    return false;
  }
  const collisionMap = getArenaCollisionMap();
  for (let dx = 0; dx < size; dx++) {
    for (let dy = 0; dy < size; dy++) {
      if (collisionMap?.hasFlag(tile[0] + dx, tile[1] + dy, monsterObstacleCollisionFlags)) {
        return false;
      }
    }
  }
  return true;
}
export { chooseDistinctValues, buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, emitInfernoAbility, isCombatActionDue, emitZukHit, resolveMonsterTarget, isOpenFloorFootprint };
