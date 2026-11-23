import { canNpcActAtTick } from "../../engine/npcState.js";
import { getProjectileFlightCycles, getTicksFromCycles } from "../../engine/projectiles.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick, buildNpcProjectileVisual } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack } from "./events.js";
import { buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, isCombatActionDue, emitZukHit, resolveMonsterTarget } from "./monsterHelpers.js";
var batProjectile = {
  spotAnimId: 1382,
  timing: {
    delay: 10,
    lengthAdjustment: 22,
    stepMultiplier: 8,
    progress: 128,
  },
  slope: 16,
  startHeight: 200,
  endHeight: 124,
};
var batNpcDefinition = defineNpc({
  id: "inferno-jal-mejrah",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "bat",
      position: actor.position,
    }),
  tick: ({ actor: actor, context: context }) => {
    const noAttack = {
      environmentalDamages: [],
    };
    if (
      !canNpcActAtTick(actor, context.tick) ||
      context.tick < actor.state.firstActionTick
    ) {
      return noAttack;
    }
    if (!isCombatActionDue(actor.combat, context.tick)) {
      return noAttack;
    }
    const target = resolveMonsterTarget(actor, context.world);
    if (!target) {
      return noAttack;
    }
    const distance = Math.max(
      Math.abs(actor.position[0] - target.position[0]),
      Math.abs(actor.position[1] - target.position[1]),
    );
    const endDelayCycles = getProjectileFlightCycles(batProjectile.timing, distance);
    const plan = {
      formulaStyle: "ranged",
      damageType: "range",
      attackKind: "range_arrow",
      impactDelayTicks: getTicksFromCycles(endDelayCycles),
      maxHit: 19,
      sourceDeathPolicy: "persist",
    };
    if (!canNpcAttackWithPlan(actor, target, plan)) {
      return noAttack;
    }
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: target,
      plan: plan,
      random: context.random,
      labelled: buildLabelledDecisions(context),
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id} or ${target.id}`);
    }
    emitInfernoNpcAttack(context, {
      actor: actor,
      target: target,
      clipId: "attack",
      kind: "bat_range",
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: [
        {
          ...buildNpcProjectileVisual(actor, target, batProjectile, endDelayCycles),
          sourcePosition: [actor.position[0] + 0.5, actor.position[1] + 0.5],
        },
      ],
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, 3);
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  },
});
export { batNpcDefinition };
