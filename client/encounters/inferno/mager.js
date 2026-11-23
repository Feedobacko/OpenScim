import { canNpcActAtTick, isActorAlive, isNpcAlive } from "../../engine/npcState.js";
import { createRandomDecisions, weightEqually, getContextDecisions } from "../../engine/decisions.js";
import { areFootprintsOverlapping } from "../../engine/attackRange.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getDistanceFromNpcCentre, rollNpcAttack } from "../shared/npcAttack.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { buildActorVisualTarget, getProjectileSourcePosition, scheduleNextActionTick, faceActorToward } from "../shared/npcHelpers.js";
import { emitZukAttack, emitInfernoVisual } from "./events.js";
import { buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, emitInfernoAbility, isCombatActionDue, emitZukHit, resolveMonsterTarget, isOpenFloorFootprint } from "./monsterHelpers.js";
import { getInfernoActorTemplate, createInfernoActor, createRetaliationState } from "./actors.js";
// The mager, and what the mager and the ranger share: the ranger's turn is
// processMagerRangerTick here. ranger.js holds the ranger's attack table and
// its definition.
var magerProjectileTiming = {
  delay: 28,
  lengthAdjustment: 0,
  stepMultiplier: 8,
  progress: 32,
};
var rangerProjectileTiming = {
  delay: 60,
  lengthAdjustment: -14,
  stepMultiplier: 8,
  progress: 0,
};
var isMagerNpc = (npc) => npc.npcTypeId === 7703 || npc.npcTypeId === 7699;
var isRangerNpc = (npc) => npc.npcTypeId === 7702 || npc.npcTypeId === 7698;
function buildMagerRangerAttackVisual(attackers, target) {
  for (const attacker of attackers) {
    faceActorToward(attacker, target);
  }
  const magerProjectiles = attackers.filter(isMagerNpc).map((mager) => ({
    spotAnimId: 1376,
    sourcePosition: getProjectileSourcePosition(mager),
    target: buildActorVisualTarget(target),
    startDelayCycles: magerProjectileTiming.delay,
    endDelayCycles: getProjectileFlightCycles(magerProjectileTiming, getDistanceFromNpcCentre(mager, target)),
    slope: 0,
    startOffset: magerProjectileTiming.progress,
    startHeight: 400,
    endHeight: 124,
  }));
  const rangerProjectiles = attackers.filter(isRangerNpc).flatMap((ranger) => {
    const facingRadians = Math.round(ranger.facing / 256) * (Math.PI / 4);
    const facingDx = -Math.round(Math.sin(facingRadians));
    const facingDy = -Math.round(Math.cos(facingRadians));
    const forwardTiles = facingDx === 0 || facingDy === 0 ? 2 : 1;
    const rangerCentre = getProjectileSourcePosition(ranger);
    const endDelayCycles = getProjectileFlightCycles(rangerProjectileTiming, getDistanceFromNpcCentre(ranger, target));
    return [-1, 1].map((side) => ({
      spotAnimId: 1377,
      sourcePosition: [rangerCentre[0] + forwardTiles * facingDx + side * facingDy, rangerCentre[1] + forwardTiles * facingDy - side * facingDx],
      target: buildActorVisualTarget(target),
      startDelayCycles: Math.min(rangerProjectileTiming.delay, endDelayCycles),
      endDelayCycles: endDelayCycles,
      slope: 16,
      startOffset: rangerProjectileTiming.progress,
      startHeight: 256,
      endHeight: 124,
    }));
  });
  return {
    animations: attackers.map((attacker) => ({
      actorId: attacker.id,
      clipId: isMagerNpc(attacker) ? "magic" : "range",
      delayCycles: 0,
    })),
    projectiles: [...magerProjectiles, ...rangerProjectiles],
    graphics: magerProjectiles.map((projectile) => ({
      spotAnimId: 131,
      target: projectile.target,
      delayCycles: projectile.endDelayCycles,
      height: 124,
    })),
  };
}
var magerResurrectionMinX = 31;
var magerResurrectionMaxX = 37;
var magerResurrectionMinY = 28;
var magerResurrectionMaxY = 34;
function isMagerResurrectionTileFree(world, tile, size) {
  if (!isOpenFloorFootprint(tile, size)) {
    return false;
  }
  const footprint = {
    position: tile,
    size: size,
  };
  const player = world.getPlayer();
  return (
    (!player || !areFootprintsOverlapping(footprint, player)) &&
    !world.getNpcs().some((npc) => npc.blocksNpcMovement !== false && !isNpcAlive(npc) && areFootprintsOverlapping(footprint, npc))
  );
}
function getFreeResurrectionTiles(context, size) {
  const reviveTiles = [];
  for (let y = magerResurrectionMinY; y <= magerResurrectionMaxY; y++) {
    for (let x = magerResurrectionMinX; x <= magerResurrectionMaxX; x++) {
      if (isMagerResurrectionTileFree(context.world, [x, y], size)) {
        reviveTiles.push([x, y]);
      }
    }
  }
  return reviveTiles;
}
function tryMagerResurrection(actor, resurrection, context) {
  const corpses = resurrection.eligibleCorpses(context);
  if (corpses.length === 0) {
    return false;
  }
  const decisions = getContextDecisions(context);
  const decisionKey = {
    tick: context.tick,
    actorId: actor.id,
  };
  if (
    !decisions.chance(
      {
        ...decisionKey,
        site: "inferno.mager.rez",
      },
      0.1,
    )
  ) {
    return false;
  }
  const corpse = decisions.choose(
    {
      ...decisionKey,
      site: "inferno.mager.rez.corpse",
    },
    weightEqually(corpses),
  );
  const size = getInfernoActorTemplate(corpse.species).size;
  const reviveTiles = getFreeResurrectionTiles(context, size);
  if (reviveTiles.length === 0) {
    return false;
  }
  const reviveTile = decisions.choose(
    {
      ...decisionKey,
      site: "inferno.mager.rez.tile",
    },
    weightEqually(reviveTiles),
  );
  const graphicTile = [reviveTile[0] + size - 2, reviveTile[1] + size - 2];
  faceActorToward(actor, {
    position: reviveTile,
    size: 1,
  });
  resurrection.revive(corpse, reviveTile, context);
  emitInfernoVisual(context.tickEvents, {
    animations: [
      {
        actorId: actor.id,
        clipId: "resurrect",
        delayCycles: 0,
      },
    ],
    projectiles: [],
    graphics: [
      {
        spotAnimId: 444,
        target: {
          kind: "tile",
          position: graphicTile,
        },
        delayCycles: 0,
        height: 150,
      },
    ],
  });
  emitInfernoAbility(context, {
    ability: "mager_resurrect",
    actorId: actor.id,
    position: actor.position,
  });
  context.tickEvents.emit({
    type: "game_message",
    kind: "spam",
    segments: [
      {
        text: "Jal-Zek uses his power to trigger the rebirth of a fallen foe.",
      },
    ],
  });
  scheduleNextActionTick(actor.combat, context.tick, 8);
  return true;
}
var magerAttackChoices = [
  {
    attack: "mager_melee",
    weight: 1,
    plan: {
      formulaStyle: "melee_stab",
      damageType: "melee",
      attackKind: "melee_stab",
      impactDelayTicks: 0,
      sourceDeathPolicy: "cancel-before-impact",
    },
  },
  {
    attack: "mager_magic",
    weight: 1,
    plan: {
      formulaStyle: "magic",
      damageType: "magic",
      attackKind: "magic_fire",
      impactDelayTicks: 0,
      projectile: magerProjectileTiming,
      maxHit: 70,
      sourceDeathPolicy: "persist",
    },
  },
];
function chooseWeightedAttack(selection) {
  const {
    attacker: attacker,
    target: target,
    choices: choices,
    random: random,
  } = selection;
  if (!canNpcActAtTick(attacker, selection.tick) || !isActorAlive(target)) {
    return null;
  }
  const usableChoices = choices.filter(
    (choice) => choice.weight > 0 && canNpcAttackWithPlan(attacker, target, choice.plan),
  );
  if (usableChoices.length <= 1) {
    return usableChoices[0] ?? null;
  } else {
    return (selection.decisions ?? createRandomDecisions(random)).choose(
      {
        site: "npc.attack.select",
        tick: selection.tick,
        actorId: attacker.id,
        targetId: target.id,
      },
      usableChoices.map((choice) => ({
        value: choice,
        weight: choice.weight,
      })),
    );
  }
}
function processMagerRangerTick({ actor: actor, context: context }, attackChoices, resurrection) {
  const noAttack = {
    environmentalDamages: [],
  };
  if (
    !canNpcActAtTick(actor, context.tick) ||
    context.tick < actor.state.firstActionTick ||
    !isCombatActionDue(actor.combat, context.tick)
  ) {
    return noAttack;
  }
  const target = resolveMonsterTarget(actor, context.world);
  if (!target) {
    return noAttack;
  }
  const chosenAttack = chooseWeightedAttack({
    attacker: actor,
    target: target,
    choices: attackChoices,
    random: context.random,
    decisions: getContextDecisions(context),
    tick: context.tick,
  });
  if (!chosenAttack) {
    return noAttack;
  }
  if (resurrection && tryMagerResurrection(actor, resurrection, context)) {
    actor.state.stillUntilTick = context.tick + 7;
    return noAttack;
  }
  const { plan: plan } = chosenAttack;
  if (!actor.formulaStats) {
    throw new TypeError(`Missing formula stats for ${actor.id}`);
  }
  const npcAttack = rollNpcAttack({
    attacker: actor,
    target: target,
    plan: plan,
    random: context.random,
    labelled: buildLabelledDecisions(context),
  });
  if (npcAttack === null) {
    throw new TypeError(`Missing target formula stats for ${target.id}`);
  }
  if (plan.damageType === "melee") {
    faceActorToward(actor, target);
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
  } else {
    emitInfernoVisual(context.tickEvents, buildMagerRangerAttackVisual([actor], target));
  }
  const projectileArrivalCycles = plan.projectile ? getProjectileFlightCycles(plan.projectile, getDistanceFromNpcCentre(actor, target)) : undefined;
  emitZukAttack(context, {
    attack: chosenAttack.attack,
    sourceId: actor.id,
    targetId: target.id,
    sourcePosition: [
      actor.position[0] + Math.floor(actor.size / 2),
      actor.position[1] + Math.floor(actor.size / 2),
    ],
    targetPosition: target.position,
    launchTick: context.tick,
    impactTick: context.tick + npcAttack.impactDelayTicks,
    ...(projectileArrivalCycles === undefined
      ? {}
      : {
          projectileArrivalCycles: projectileArrivalCycles,
        }),
  });
  scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
  return {
    environmentalDamages: [],
    npcAttacks: [npcAttack],
  };
}
function getMagerRangerMoves({ actor: actor, context: context }) {
  if (context.tick < (actor.state.stillUntilTick ?? Number.NEGATIVE_INFINITY)) {
    return [];
  } else {
    return getNpcPursuitMoves(actor, context);
  }
}
var magerNpcDefinition = defineNpc({
  id: "inferno-jal-zek",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "mager",
      position: actor.position,
    }),
  move: getMagerRangerMoves,
  tick: (hook) => processMagerRangerTick(hook, magerAttackChoices, hook.config?.resurrection),
});
function initializeMagerRangerActor(baseActor, spawn) {
  baseActor.spawnTick = spawn.spawnTick;
  baseActor.combat.targetId = spawn.initialTargetId;
  baseActor.combat.retaliation = createRetaliationState();
  baseActor.combat.meleeReach = "diagonal";
  return baseActor;
}
function createMager(spawn) {
  const baseActor = initializeMagerRangerActor(
    createInfernoActor(
      {
        kind: "mager",
        variant: spawn.variant ?? "zuk",
      },
      spawn.id,
      spawn.position,
    ),
    spawn,
  );
  baseActor.combat.attackSpeed = 4;
  baseActor.combat.attackRange = spawn.attackRange;
  baseActor.combat.attackStyle = "magic";
  return magerNpcDefinition.createActor(baseActor, {
    firstActionTick: spawn.spawnTick + spawn.initialDelayTicks,
  });
}
export { rangerProjectileTiming, buildMagerRangerAttackVisual, processMagerRangerTick, getMagerRangerMoves, magerNpcDefinition, initializeMagerRangerActor, createMager };
