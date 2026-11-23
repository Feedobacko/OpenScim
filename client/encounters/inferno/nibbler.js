import { canNpcActAtTick, isActorAlive } from "../../engine/npcState.js";
import { getContextDecisions } from "../../engine/decisions.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack } from "./events.js";
import { canNpcAttackWithPlan, emitZukDeath, isCombatActionDue, emitZukHit } from "./monsterHelpers.js";
function selectNibblerTarget({ actor: actor, config: config, context: context }) {
  const player = context.world.getPlayer();
  if (!actor.state.targetsPlayer) {
    const waveTarget = config.getWaveTarget(context);
    if (waveTarget && isActorAlive(waveTarget)) {
      actor.combat.targetId = waveTarget.id;
      return waveTarget;
    }
    actor.state.targetsPlayer = true;
  }
  actor.combat.targetId = player?.id ?? null;
  if (player?.alive) {
    return player;
  } else {
    return null;
  }
}
var nibblerNpcDefinition = defineNpc({
  id: "inferno-jal-nib",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "nibbler",
      position: actor.position,
    }),
  move: (hook) => {
    if (!canNpcActAtTick(hook.actor, hook.context.tick)) {
      return [];
    }
    selectNibblerTarget(hook);
    return getNpcPursuitMoves(hook.actor, hook.context);
  },
  tick: (hook) => {
    const { actor: actor, context: context } = hook;
    const noAttack = {
      environmentalDamages: [],
    };
    if (
      !canNpcActAtTick(actor, context.tick) ||
      context.tick < actor.state.firstActionTick
    ) {
      return noAttack;
    }
    const target = selectNibblerTarget(hook);
    if (!target || !isActorAlive(target)) {
      return noAttack;
    }
    if (
      !canNpcAttackWithPlan(actor, target, {
        formulaStyle: "melee_crush",
        damageType: "melee",
        attackKind: "melee_crush",
        impactDelayTicks: 0,
      })
    ) {
      return noAttack;
    }
    if (actor.state.arrivedTargetId !== target.id) {
      actor.state.arrivedTargetId = target.id;
      return noAttack;
    }
    if (!isCombatActionDue(actor.combat, context.tick)) {
      return noAttack;
    }
    const npcAttack = {
      attackerId: actor.id,
      targetId: target.id,
      style: "melee",
      attackKind: "melee_crush",
      rolledDamage: getContextDecisions(context).int(
        {
          site: "inferno.nibbler.damage",
          tick: context.tick,
          actorId: actor.id,
          targetId: target.id,
        },
        0,
        4,
      ),
      accuracySucceeded: true,
      impactDelayTicks: 0,
      sourceDeathPolicy: "cancel-before-impact",
    };
    emitInfernoNpcAttack(context, {
      actor: actor,
      target: target,
      clipId: "attack",
      kind: "nibbler_melee",
      impactDelayTicks: 0,
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, 4);
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  },
});
export { nibblerNpcDefinition };
