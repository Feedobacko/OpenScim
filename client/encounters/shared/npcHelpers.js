import { canNpcBeHealed } from "../../engine/npcState.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getDistanceFromNpcCentre } from "./npcAttack.js";
function buildActorVisualTarget(actor) {
  return {
    kind: "actor",
    actorId: actor.id,
    size: actor.size,
    position: [...actor.position],
  };
}
function getProjectileSourcePosition(projectileSource) {
  const centreOffset = Math.floor(projectileSource.size / 2) + 0.5;
  return [projectileSource.position[0] + centreOffset, projectileSource.position[1] + centreOffset];
}
var activeOutcome = {
  phase: "active",
};
function scheduleNextActionTick(combat, tick, delayTicks) {
  combat.nextActionTick = tick + delayTicks;
}
function faceActorToward(actor, target) {
  const dx = target.position[0] + target.size / 2 - actor.position[0] - actor.size / 2;
  const dy = target.position[1] + target.size / 2 - actor.position[1] - actor.size / 2;
  if (dx !== 0 || dy !== 0) {
    actor.facing =
      (Math.round(Math.atan2(-dx, -dy) * (2048 / (Math.PI * 2))) + 2048) % 2048;
  }
}
function buildNpcProjectileVisual(attacker, target, projectile, endDelayCycles = getProjectileFlightCycles(projectile.timing, getDistanceFromNpcCentre(attacker, target)), projectileSource = attacker) {
  return {
    spotAnimId: projectile.spotAnimId,
    sourcePosition: getProjectileSourcePosition(projectileSource),
    target: buildActorVisualTarget(target),
    startDelayCycles: Math.min(projectile.timing.delay, endDelayCycles),
    endDelayCycles: endDelayCycles,
    slope: projectile.slope,
    startOffset: projectile.timing.progress,
    startHeight: projectile.startHeight,
    endHeight: projectile.endHeight,
  };
}
function healNpc(npc, amount, tickEvents) {
  if (!npc || !canNpcBeHealed(npc) || amount <= 0) {
    return 0;
  }
  const healedAmount = Math.min(amount, npc.vitals.maxHp - npc.vitals.hp);
  if (healedAmount <= 0) {
    return 0;
  } else {
    npc.vitals = {
      ...npc.vitals,
      hp: npc.vitals.hp + healedAmount,
    };
    tickEvents.emit({
      type: "hitsplat_spawned",
      targetId: npc.id,
      amount: healedAmount,
      hitsplatType: "heal",
    });
    return healedAmount;
  }
}
export {
  buildActorVisualTarget,
  getProjectileSourcePosition,
  activeOutcome,
  scheduleNextActionTick,
  faceActorToward,
  buildNpcProjectileVisual,
  healNpc,
};
