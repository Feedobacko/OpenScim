import { canNpcActAtTick, isActorAlive, isNpcAlive, canNpcBeHealed } from "../../engine/npcState.js";
import { isFootprintInAttackRange, areFootprintsOverlapping } from "../../engine/attackRange.js";
import { getContextDecisions } from "../../engine/decisions.js";
import { getDistanceFromNpcCentre, rollNpcAttack } from "../shared/npcAttack.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import {
  buildActorVisualTarget,
  getProjectileSourcePosition,
  scheduleNextActionTick,
  faceActorToward,
  healNpc,
} from "../shared/npcHelpers.js";
import { emitZukAttack, emitInfernoVisual } from "./events.js";
import { buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, isCombatActionDue, emitZukHit, resolveMonsterTarget } from "./monsterHelpers.js";
import { createInfernoActor, createRetaliationState } from "./actors.js";
function isActorInMeleeRange(actor, target) {
  return isFootprintInAttackRange(
    {
      southWest: actor.position,
      width: actor.size,
      height: actor.size,
    },
    {
      southWest: target.position,
      width: target.size,
      height: target.size,
    },
    {
      attackRange: 1,
      checkCollision: true,
    },
  );
}
function buildJadAttackVisual(actor, target, style) {
  faceActorToward(actor, target);
  const animations = [
    {
      actorId: actor.id,
      clipId: style,
      delayCycles: 0,
    },
  ];
  switch (style) {
    case "range":
      return {
        animations: animations,
        projectiles: [],
        graphics: [],
      };
    case "magic": {
      const distance = getDistanceFromNpcCentre(actor, target);
      return {
        animations: animations,
        graphics: [],
        projectiles: [
          {
            spotAnimId: 448,
            start: 2,
            end: 2,
          },
          {
            spotAnimId: 449,
            start: 6,
            end: 6,
          },
          {
            spotAnimId: 450,
            start: 10,
            end: 12,
          },
        ].map((projectilePart) => ({
          spotAnimId: projectilePart.spotAnimId,
          sourcePosition: getProjectileSourcePosition(actor),
          target: buildActorVisualTarget(target),
          startDelayCycles: 90 + projectilePart.start,
          endDelayCycles: 90 + projectilePart.end + distance * 8,
          slope: 16,
          startOffset: 32,
          startHeight: 512,
          endHeight: 124,
        })),
      };
    }
    default:
      return (function (unknownStyle) {
        throw new TypeError(`Unknown demonstration style: ${unknownStyle}`);
      })(style);
  }
}
var defaultJadHealerMeleePlan = {
  formulaStyle: "melee_crush",
  damageType: "melee",
  attackKind: "melee_crush",
  impactDelayTicks: 0,
  sourceDeathPolicy: "cancel-before-impact",
};
function getJadHealerSupportTarget(actor, context) {
  const supportTarget = context.world.getNpc(actor.state.supportTargetId);
  if (supportTarget && (canNpcBeHealed(supportTarget) || supportTarget.death !== undefined)) {
    return supportTarget;
  } else {
    return null;
  }
}
var getJadHealerFirstTurnTick = (actor) => actor.state.firstTurnTick ?? actor.spawnTick ?? 0;
var jadHealerNpcDefinition = defineNpc({
  id: "inferno-jad-healer",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  move: ({ actor: actor, context: context }) => {
    if (!canNpcActAtTick(actor, context.tick) || context.tick < getJadHealerFirstTurnTick(actor)) {
      return [];
    }
    const player = context.world.getPlayer();
    if (
      actor.combat.targetId !== null &&
      (player === null || actor.combat.targetId === player.id) &&
      !player?.alive
    ) {
      actor.combat.targetId = null;
      if (actor.combat.retaliation) {
        actor.combat.retaliation.lastIncomingAttackTick = null;
      }
    }
    if (actor.combat.targetId !== null) {
      if (player?.alive && actor.combat.targetId === player.id) {
        return getNpcPursuitMoves(actor, context);
      } else {
        return [];
      }
    }
    const supportTarget = getJadHealerSupportTarget(actor, context);
    if (!supportTarget || areFootprintsOverlapping(actor, supportTarget)) {
      return [];
    } else {
      return getNpcPursuitMoves(actor, context, supportTarget);
    }
  },
  tick: ({ actor: actor, context: context, config: config }) => {
    if (!canNpcActAtTick(actor, context.tick) || context.tick < (actor.spawnTick ?? 0)) {
      return {
        environmentalDamages: [],
      };
    }
    const supportTarget = getJadHealerSupportTarget(actor, context);
    if (actor.combat.targetId === null && supportTarget) {
      faceActorToward(actor, supportTarget);
    }
    if (context.tick < getJadHealerFirstTurnTick(actor)) {
      return {
        environmentalDamages: [],
      };
    }
    if (
      isNpcAlive(actor) &&
      actor.combat.targetId === null &&
      context.tick >= actor.state.nextHealTick &&
      supportTarget &&
      isActorInMeleeRange(actor, supportTarget)
    ) {
      actor.state.nextHealTick = context.tick + 4;
      emitInfernoVisual(context.tickEvents, {
        animations: [
          {
            actorId: actor.id,
            clipId: "heal",
            delayCycles: 0,
          },
        ],
        projectiles: [],
        graphics: [],
      });
      if (config?.sampleHeal && canNpcBeHealed(supportTarget)) {
        healNpc(
          supportTarget,
          config.sampleHeal({
            actor: actor,
            target: supportTarget,
            context: context,
          }),
          context.tickEvents,
        );
      }
      config?.presentHeal?.(supportTarget, context);
    }
    const actionDue = isCombatActionDue(actor.combat, context.tick);
    const player = context.world.getPlayer();
    const meleePlan = {
      ...defaultJadHealerMeleePlan,
      ...config?.melee,
    };
    if (!actionDue || !player?.alive || actor.combat.targetId !== player.id || !canNpcAttackWithPlan(actor, player, meleePlan)) {
      return {
        environmentalDamages: [],
      };
    }
    const npcAttack =
      config?.melee &&
      rollNpcAttack({
        attacker: actor,
        target: player,
        plan: meleePlan,
        random: context.random,
        labelled: buildLabelledDecisions(context),
      });
    if (npcAttack === null) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    emitInfernoVisual(context.tickEvents, {
      animations: [
        {
          actorId: actor.id,
          clipId: "melee",
          delayCycles: 0,
        },
      ],
      projectiles: [],
      graphics: [],
    });
    emitZukAttack(context, {
      attack: "jad_healer_melee",
      sourceId: actor.id,
      targetId: player.id,
      sourcePosition: actor.position,
      targetPosition: player.position,
      launchTick: context.tick,
      impactTick: context.tick + (npcAttack?.impactDelayTicks ?? 0),
    });
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, 4);
    if (npcAttack) {
      return {
        environmentalDamages: [],
        npcAttacks: [npcAttack],
      };
    } else {
      return {
        environmentalDamages: [],
      };
    }
  },
});
function createJadHealer(healerSetup) {
  const baseActor = createInfernoActor(
    {
      kind: "jad_healer",
      variant: healerSetup.variant ?? "zuk",
    },
    healerSetup.id,
    healerSetup.position,
  );
  baseActor.spawnTick = healerSetup.spawnTick;
  baseActor.combat.attackSpeed = 4;
  baseActor.combat.attackStyle = "melee";
  baseActor.combat.attackRange = 1;
  baseActor.combat.retaliation = createRetaliationState();
  return jadHealerNpcDefinition.createActor(baseActor, {
    parentId: healerSetup.parentId,
    supportTargetId: healerSetup.parentId,
    nextHealTick: healerSetup.firstTurnTick ?? healerSetup.spawnTick,
    ...(healerSetup.firstTurnTick === undefined
      ? {}
      : {
          firstTurnTick: healerSetup.firstTurnTick,
        }),
  });
}
var jadExecution = {
  attackRange: 15,
  initialDelayTicks: 8,
  selectStyle: ({ actor: actor, target: target, context: context }) => {
    if (!canNpcAttackWithPlan(actor, target, jadExecution.profiles.magic.attack)) {
      return null;
    }
    const decisionKey = {
      site: "inferno.jad.style",
      tick: context.tick,
      actorId: actor.id,
      targetId: target.id,
    };
    const oneThird = 1 / 3;
    return getContextDecisions(context).choose(
      decisionKey,
      isActorInMeleeRange(actor, target)
        ? [
            {
              value: "magic",
              weight: oneThird,
            },
            {
              value: "range",
              weight: oneThird,
            },
            {
              value: "melee",
              weight: oneThird,
            },
          ]
        : [
            {
              value: "magic",
              weight: 0.5,
            },
            {
              value: "range",
              weight: 0.5,
            },
          ],
    );
  },
  prayerCheckAtRelease: "launch",
  rangedMagicPeriod: 8,
  profiles: {
    magic: {
      windupTicks: 3,
      attack: {
        formulaStyle: "magic",
        damageType: "magic",
        attackKind: "magic_fire",
        impactDelayTicks: 0,
        projectile: {
          delay: 2,
          lengthAdjustment: 0,
          stepMultiplier: 8,
          progress: 32,
        },
        maxHit: 113,
      },
    },
    range: {
      windupTicks: 3,
      attack: {
        formulaStyle: "ranged",
        damageType: "range",
        attackKind: "range_arrow",
        impactDelayTicks: 2,
        maxHit: 113,
      },
    },
    melee: {
      windupTicks: 0,
      attack: {
        formulaStyle: "melee_stab",
        damageType: "melee",
        attackKind: "melee_stab",
        impactDelayTicks: 0,
        maxHit: 113,
      },
    },
  },
};
// Not registered as an execution: every Jad runs on jadExecution
// (registerWaveNpcs in InfernoEncounter.js). waveMonsters.js reads these
// timings as defaults for a wave's Jad.
var waveJadExecution = {
  ...jadExecution,
  initialDelayTicks: 4,
  rangedMagicPeriod: 8,
};
var jadNpcDefinition = defineNpc({
  id: "inferno-jad",
  deathPolicy: "queued",
  onDamageResolved: ({
    actor: actor,
    damage: damage,
    config: config,
    context: context,
  }) => {
    emitZukHit({
      actor: actor,
      damage: damage,
      context: context,
    });
    if (
      damage.sourceId === "player" &&
      !(damage.effectiveDamage <= 0) &&
      !(damage.hpAfter <= 0)
    ) {
      if (
        !actor.state.healersSpawned &&
        damage.hpAfter <= actor.vitals.maxHp / 2
      ) {
        actor.state.healersSpawned = true;
        config.spawnHealers(actor.id, context);
      }
    }
  },
  onDefeated: ({ actor: actor, defeat: defeat }) => {
    actor.state.removeAt = (actor.deathAnimationTick ?? defeat.tick) + 6;
  },
  onDeathStarted: ({ actor: actor }) => {
    actor.state.pendingAttack = null;
  },
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "jad",
      position: actor.position,
    }),
  onDespawn: ({ actor: actor, context: context }) => {
    actor.state.pendingAttack = null;
    for (const npc of context.world.getNpcs()) {
      if (jadHealerNpcDefinition.getState(npc)?.parentId === actor.id) {
        context.despawnNpc(npc.id);
      }
    }
  },
  tick: ({ actor: actor, context: context, config: config }) => {
    if (!canNpcActAtTick(actor, context.tick) || context.tick < (actor.spawnTick ?? 0)) {
      return {
        environmentalDamages: [],
      };
    }
    const actionDue = isCombatActionDue(actor.combat, context.tick);
    const execution = config.execution;
    if (!execution) {
      return {
        environmentalDamages: [],
      };
    }
    const initialDelayTicks =
      actor.state.initialDelayTicks ?? execution.initialDelayTicks ?? 0;
    if (context.tick < (actor.spawnTick ?? 0) + initialDelayTicks) {
      return {
        environmentalDamages: [],
      };
    }
    actor.combat.attackRange = execution.attackRange;
    const pendingTargetId = actor.state.pendingAttack?.targetId;
    const target =
      pendingTargetId !== undefined
        ? (context.world.getPlayers().find((player) => player.id === pendingTargetId) ?? context.world.getNpc(pendingTargetId))
        : actionDue
          ? resolveMonsterTarget(actor, context.world)
          : null;
    if (!actor.state.pendingAttack && actionDue && target && isActorAlive(target)) {
      const style = execution.selectStyle({
        actor: actor,
        target: target,
        context: context,
      });
      if (style === null) {
        return {
          environmentalDamages: [],
        };
      }
      const profile = execution.profiles[style];
      if (!canNpcAttackWithPlan(actor, target, profile.attack)) {
        return {
          environmentalDamages: [],
        };
      }
      actor.state.pendingAttack = {
        style: style,
        targetId: target.id,
        releaseTick: context.tick + profile.windupTicks,
      };
      actor.combat.attackStyle = style;
      actor.combat.attackSpeed =
        style === "melee"
          ? 4
          : (actor.state.rangedMagicPeriod ??
            execution.rangedMagicPeriod ??
            8);
      scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
      emitInfernoVisual(context.tickEvents, {
        animations: [
          {
            actorId: actor.id,
            clipId: style,
            delayCycles: 0,
          },
        ],
        projectiles: [],
        graphics: [],
      });
      context.tickEvents.emit({
        type: "zuk_jad_cue",
        sourceId: actor.id,
        style: style,
      });
    }
    const pendingAttack = actor.state.pendingAttack;
    if (!pendingAttack || context.tick < pendingAttack.releaseTick) {
      return {
        environmentalDamages: [],
      };
    }
    actor.state.pendingAttack = null;
    if (!target || !isActorAlive(target) || target.id !== pendingAttack.targetId) {
      return {
        environmentalDamages: [],
      };
    }
    const attack = execution.profiles[pendingAttack.style].attack;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: target,
      random: context.random,
      labelled: buildLabelledDecisions(context),
      plan: {
        ...attack,
        prayerCheckAt: execution.prayerCheckAtRelease,
        sourceDeathPolicy: "persist",
      },
    });
    if (!npcAttack) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    if (pendingAttack.style === "magic") {
      const magicVisual = buildJadAttackVisual(actor, target, "magic");
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        graphics: [],
        projectiles: magicVisual.projectiles.map((projectile) => ({
          ...projectile,
          startDelayCycles: projectile.startDelayCycles - 90,
          endDelayCycles: projectile.endDelayCycles - 90,
        })),
      });
    }
    if (pendingAttack.style === "range") {
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        projectiles: [],
        graphics: [
          {
            spotAnimId: 451,
            target: {
              kind: "tile",
              position: [...target.position],
            },
            height: 92,
            delayCycles: 0,
          },
        ],
      });
    }
    const impactDelayTicks = npcAttack.impactDelayTicks;
    actor.combat.lastAttackTick = context.tick;
    emitZukAttack(context, {
      attack: `jad_${pendingAttack.style}`,
      sourceId: actor.id,
      targetId: target.id,
      sourcePosition: actor.position,
      targetPosition: target.position,
      launchTick: context.tick,
      impactTick: context.tick + impactDelayTicks,
      ...(pendingAttack.style === "magic"
        ? {
            projectileArrivalCycles: 2 + getDistanceFromNpcCentre(actor, target) * 8,
          }
        : {}),
    });
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  },
});
function removeJadIfDue(npc, context) {
  const jadState = jadNpcDefinition.getState(npc);
  if (jadState?.removeAt == null || context.tick < jadState.removeAt) {
    return false;
  }
  context.despawnNpc(npc.id);
  return true;
}
function createJad(jadSetup) {
  const baseActor = createInfernoActor(
    {
      kind: "jad",
      variant: jadSetup.variant ?? "zuk",
    },
    jadSetup.id,
    jadSetup.position,
  );
  baseActor.spawnTick = jadSetup.spawnTick;
  baseActor.combat.attackSpeed = jadSetup.rangedMagicPeriod ?? 8;
  baseActor.combat.targetId = jadSetup.targetId;
  baseActor.combat.retaliation = {
    mode: "retarget",
    pending: [],
    lastIncomingAttackTick: null,
  };
  return jadNpcDefinition.createActor(baseActor, {
    healersSpawned: false,
    removeAt: null,
    pendingAttack: null,
    ...(jadSetup.initialDelayTicks === undefined
      ? {}
      : {
          initialDelayTicks: jadSetup.initialDelayTicks,
        }),
    ...(jadSetup.rangedMagicPeriod === undefined
      ? {}
      : {
          rangedMagicPeriod: jadSetup.rangedMagicPeriod,
        }),
  });
}
export { buildJadAttackVisual, jadHealerNpcDefinition, createJadHealer, jadExecution, waveJadExecution, jadNpcDefinition, removeJadIfDue, createJad };
