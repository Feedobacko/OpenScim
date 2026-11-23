import { Prayer } from "../../engine/prayerTables.js";
import { canNpcActAtTick, isActorAlive } from "../../engine/npcState.js";
import { isFootprintInAttackRange } from "../../engine/attackRange.js";
import { getContextDecisions } from "../../engine/decisions.js";
import { getProjectileFlightCycles, getTicksFromCycles } from "../../engine/projectiles.js";
import { getDistanceFromNpcCentre, rollNpcAttack } from "../shared/npcAttack.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { emitZukAttack, emitInfernoVisual, emitInfernoNpcAttack } from "./events.js";
import { scheduleNextActionTick, buildNpcProjectileVisual } from "../shared/npcHelpers.js";
import { buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, isCombatActionDue, emitZukHit, resolveMonsterTarget } from "./monsterHelpers.js";
function buildBlobRangeAttack(projectile, maxHit) {
  return {
    clipId: "range",
    sound: "blob_range",
    projectile: projectile,
    plan: {
      formulaStyle: "ranged",
      damageType: "range",
      attackKind: "range_arrow",
      impactDelayTicks: 0,
      projectile: projectile.timing,
      maxHit: maxHit,
      sourceDeathPolicy: "persist",
    },
  };
}
function buildBlobMagicAttack(projectile, maxHit) {
  return {
    clipId: "magic",
    sound: "blob_magic",
    projectile: projectile,
    plan: {
      formulaStyle: "magic",
      damageType: "magic",
      attackKind: "magic_fire",
      impactDelayTicks: 0,
      projectile: projectile.timing,
      maxHit: maxHit,
      sourceDeathPolicy: "persist",
    },
  };
}
function buildBlobMeleeAttack(maxHit) {
  return {
    clipId: "melee",
    sound: "blob_melee",
    plan: {
      formulaStyle: "melee_crush",
      damageType: "melee",
      attackKind: "melee_crush",
      impactDelayTicks: 0,
      maxHit: maxHit,
      sourceDeathPolicy: "cancel-before-impact",
    },
  };
}
var blobAttacksByStyle = {
  magic: buildBlobMagicAttack(
    {
      spotAnimId: 1380,
      timing: {
        delay: 28,
        lengthAdjustment: 0,
        stepMultiplier: 8,
        progress: 32,
      },
      slope: 16,
      startHeight: 160,
      endHeight: 124,
    },
    29,
  ),
  range: buildBlobRangeAttack(
    {
      spotAnimId: 1378,
      timing: {
        delay: 10,
        lengthAdjustment: 22,
        stepMultiplier: 8,
        progress: 32,
      },
      slope: 16,
      startHeight: 160,
      endHeight: 124,
    },
    29,
  ),
  melee: buildBlobMeleeAttack(29),
};
function selectBlobAttackStyle(actor, target, context) {
  const activePrayer = target.kind === "player" ? target.activePrayer : null;
  if (activePrayer === Prayer.ProtectMagic) {
    return "range";
  }
  if (activePrayer === Prayer.ProtectRange) {
    return "magic";
  }
  const decisionKey = {
    site: "inferno.blob.style",
    tick: context.tick,
    actorId: actor.id,
    targetId: target.id,
  };
  if (getContextDecisions(context).chance(decisionKey, 0.5)) {
    return "range";
  } else {
    return "magic";
  }
}
function getAliveCombatTarget(actor, context) {
  const targetId = actor.combat.targetId;
  if (targetId === null) {
    return null;
  }
  const target =
    context.world.getPlayers().find((player) => player.id === targetId) ?? context.world.getNpc(targetId);
  if (target && isActorAlive(target)) {
    return target;
  } else {
    return null;
  }
}
function releaseBlobAttack(actor, style, context, duringDeathAnimation = false) {
  const noAttack = {
    environmentalDamages: [],
  };
  const target = duringDeathAnimation
    ? getAliveCombatTarget(actor, context)
    : resolveMonsterTarget(actor, context.world);
  if (!target) {
    return noAttack;
  }
  const projectileSource = {
    position: actor.previousPosition,
    size: actor.size,
  };
  if (
    !isFootprintInAttackRange(
      {
        southWest: projectileSource.position,
        width: projectileSource.size,
        height: projectileSource.size,
      },
      {
        southWest: target.position,
        width: target.size,
        height: target.size,
      },
      {
        attackRange: 15,
        checkCollision: false,
      },
    )
  ) {
    return noAttack;
  }
  const attackProfile = blobAttacksByStyle[style];
  const projectile = attackProfile.projectile;
  if (!projectile) {
    throw new TypeError(`Jal-Ak ${style} has no projectile`);
  }
  const halfSize = Math.floor(projectileSource.size / 2);
  const distance = Math.max(
    Math.abs(projectileSource.position[0] + halfSize - target.position[0]),
    Math.abs(projectileSource.position[1] + halfSize - target.position[1]),
  );
  const projectileArrivalCycles = getProjectileFlightCycles(projectile.timing, distance);
  const { projectile: projectileTiming, ...planWithoutProjectile } = attackProfile.plan;
  const npcAttack = rollNpcAttack({
    attacker: actor,
    target: target,
    plan: {
      ...planWithoutProjectile,
      impactDelayTicks: getTicksFromCycles(projectileArrivalCycles),
    },
    random: context.random,
    labelled: buildLabelledDecisions(context),
  });
  if (!npcAttack) {
    throw new TypeError(`Missing formula stats for ${actor.id} or ${target.id}`);
  }
  const projectileVisual = buildNpcProjectileVisual(actor, target, projectile, projectileArrivalCycles, projectileSource);
  if (duringDeathAnimation) {
    emitInfernoVisual(context.tickEvents, {
      animations: [],
      projectiles: [projectileVisual],
      graphics: [],
    });
    emitZukAttack(context, {
      attack: attackProfile.sound,
      sourceId: actor.id,
      targetId: target.id,
      sourcePosition: actor.position,
      targetPosition: target.position,
      launchTick: context.tick,
      impactTick: context.tick + npcAttack.impactDelayTicks,
      projectileArrivalCycles: projectileArrivalCycles,
    });
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  } else {
    emitInfernoNpcAttack(context, {
      actor: actor,
      target: target,
      clipId: attackProfile.clipId,
      kind: attackProfile.sound,
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: [projectileVisual],
    });
    actor.combat.attackStyle = attackProfile.plan.damageType;
    actor.combat.lastAttackTick = context.tick;
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  }
}
function processBlobTick(actor, context) {
  const noAttack = {
    environmentalDamages: [],
  };
  const state = actor.state;
  const pendingRelease = state.pendingRelease;
  if (pendingRelease) {
    if (context.tick < pendingRelease.releaseTick) {
      return noAttack;
    } else {
      state.pendingRelease = null;
      state.nextDecisionTick = pendingRelease.releaseTick + 3;
      return releaseBlobAttack(actor, pendingRelease.style, context);
    }
  }
  if (context.tick < state.nextDecisionTick) {
    return noAttack;
  }
  const target = resolveMonsterTarget(actor, context.world);
  if (!target || !canNpcAttackWithPlan(actor, target, blobAttacksByStyle.range.plan)) {
    return noAttack;
  }
  if (
    (target.kind !== "player" || target.activePrayer !== Prayer.ProtectMelee) &&
    canNpcAttackWithPlan(actor, target, blobAttacksByStyle.melee.plan) &&
    getContextDecisions(context).chance(
      {
        site: "inferno.blob.melee",
        tick: context.tick,
        actorId: actor.id,
        targetId: target.id,
      },
      0.5,
    )
  ) {
    state.nextDecisionTick = context.tick + 6;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: target,
      plan: blobAttacksByStyle.melee.plan,
      random: context.random,
      labelled: buildLabelledDecisions(context),
    });
    if (!npcAttack) {
      throw new TypeError(
        `Missing formula stats for ${actor.id} or ${target.id}`,
      );
    }
    emitInfernoNpcAttack(context, {
      actor: actor,
      target: target,
      clipId: "melee",
      kind: "blob_melee",
      impactDelayTicks: 0,
    });
    actor.combat.attackStyle = "melee";
    actor.combat.lastAttackTick = context.tick;
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  }
  state.pendingRelease = {
    style: selectBlobAttackStyle(actor, target, context),
    releaseTick: context.tick + 3,
  };
  return noAttack;
}
var blobNpcDefinition = defineNpc({
  id: "inferno-jal-ak",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "blob",
      position: actor.position,
    }),
  releaseOnDeathAnimation: ({ actor: actor, context: context }) => {
    const pendingRelease = actor.state.pendingRelease;
    actor.state.pendingRelease = null;
    if (pendingRelease?.releaseTick !== context.tick) {
      return [];
    } else {
      return releaseBlobAttack(actor, pendingRelease.style, context, true).npcAttacks ?? [];
    }
  },
  tick: ({ actor: actor, context: context }) =>
    canNpcActAtTick(actor, context.tick)
      ? processBlobTick(actor, context)
      : {
          environmentalDamages: [],
        },
  attackTimer: ({ actor: actor }) =>
    actor.alive && actor.state.pendingRelease
      ? {
          nextAttackTick: actor.state.pendingRelease.releaseTick,
          attackSpeed: 3,
        }
      : null,
});
var blobChildAttacksBySpecies = {
  blob_mage: buildBlobMagicAttack(
    {
      spotAnimId: 1381,
      timing: {
        delay: 28,
        lengthAdjustment: 0,
        stepMultiplier: 8,
        progress: 32,
      },
      slope: 16,
      startHeight: 80,
      endHeight: 124,
    },
    18,
  ),
  blob_range: buildBlobRangeAttack(
    {
      spotAnimId: 1379,
      timing: {
        delay: 10,
        lengthAdjustment: 22,
        stepMultiplier: 8,
        progress: 32,
      },
      slope: 16,
      startHeight: 80,
      endHeight: 124,
    },
    18,
  ),
  blob_melee: buildBlobMeleeAttack(18),
};
function performBlobChildAttack(actor, target, attackProfile, context, attackSpeed) {
  const npcAttack = rollNpcAttack({
    attacker: actor,
    target: target,
    plan: attackProfile.plan,
    random: context.random,
    labelled: buildLabelledDecisions(context),
  });
  if (!npcAttack) {
    throw new TypeError(`Missing formula stats for ${actor.id} or ${target.id}`);
  }
  const projectiles = attackProfile.projectile
    ? [buildNpcProjectileVisual(actor, target, attackProfile.projectile, getProjectileFlightCycles(attackProfile.projectile.timing, getDistanceFromNpcCentre(actor, target)))]
    : [];
  emitInfernoNpcAttack(context, {
    actor: actor,
    target: target,
    clipId: attackProfile.clipId,
    kind: attackProfile.sound,
    impactDelayTicks: npcAttack.impactDelayTicks,
    projectiles: projectiles,
  });
  actor.combat.attackStyle = attackProfile.plan.damageType;
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, attackSpeed);
  return {
    environmentalDamages: [],
    npcAttacks: [npcAttack],
  };
}
var blobChildNpcDefinition = defineNpc({
  id: "inferno-jal-akrek",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "blob_child",
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
    const attackProfile = blobChildAttacksBySpecies[actor.state.species];
    if (canNpcAttackWithPlan(actor, target, attackProfile.plan)) {
      return performBlobChildAttack(actor, target, attackProfile, context, 4);
    } else {
      return noAttack;
    }
  },
});
var blobSplitSpawns = [
  {
    species: "blob_range",
    offset: [1, 1],
  },
  {
    species: "blob_melee",
    offset: [0, 0],
  },
  {
    species: "blob_mage",
    offset: [2, 2],
  },
];
export { blobNpcDefinition, blobChildAttacksBySpecies, blobChildNpcDefinition, blobSplitSpawns };
