import { isNpcBoundAtTick, canNpcActAtTick, reviveNpc } from "../../engine/npcState.js";
import { getTicksFromCycles } from "../../engine/projectiles.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { canFootprintStepInArena, isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { buildActorVisualTarget, getProjectileSourcePosition } from "../shared/npcHelpers.js";
import { isTileInFootprint, findNpcRouteToMeleeRange, findNpcRoute } from "../shared/npcRoutes.js";
import { relentlessMaxHitBonuses, relentlessDefenceBypassPercents, warbandArcherNpcTypeId, warbandSeerNpcTypeId, warbandBerserkerNpcTypeId, colosseumSeqIds, colosseumSpotAnimIds, warbandProjectileFlights, emitColosseumVisual } from "./constants.js";
function isValidMinionRouteRequest(pathRequest) {
  return (
    pathRequest.source.every(Number.isInteger) &&
    pathRequest.destination.every(Number.isInteger) &&
    Number.isInteger(pathRequest.size) &&
    pathRequest.size >= 1 &&
    pathRequest.canOccupy(pathRequest.destination, pathRequest.size)
  );
}
function findMinionRouteToTile(pathRequest) {
  if (isValidMinionRouteRequest(pathRequest)) {
    return findNpcRoute(pathRequest, "tile");
  } else {
    return {
      kind: "failed",
    };
  }
}
// `formation` here and below: the route options buildWarbanderRouteOptions
// builds.
function findMinionSlotRoute(sourceTile, targetTile, formation) {
  const { size: size, canOccupy: canOccupy } = formation;
  for (const offset of [formation.slotOffset, ...formation.fallbackOffsets]) {
    const slotPath = findMinionRouteToTile({
      source: sourceTile,
      destination: [targetTile[0] + offset[0], targetTile[1] + offset[1]],
      size: size,
      canOccupy: canOccupy,
    });
    if (slotPath.kind === "exact") {
      return slotPath;
    }
  }
  if (formation.unreachable === "hold") {
    return null;
  }
  const adjacentPath = findNpcRouteToMeleeRange({
    source: sourceTile,
    destination: [...targetTile],
    size: size,
    canOccupy: canOccupy,
    moveNear: true,
  });
  if (adjacentPath.kind === "failed") {
    return null;
  } else {
    return adjacentPath;
  }
}
function getUsableRemainingSteps(sourceTile, route, formation) {
  const nextStep = route.remainingSteps[0];
  if (
    nextStep !== undefined &&
    formation.canOccupy(nextStep, formation.size) &&
    canFootprintStepInArena(sourceTile, nextStep, {
      width: formation.size,
      height: formation.size,
    })
  ) {
    return route.remainingSteps;
  } else {
    return [];
  }
}
function takeMinionRouteSteps(actorTile, targetTile, formation, route) {
  const sourceTile = [actorTile[0], actorTile[1]];
  const foundSteps = findMinionSlotRoute(sourceTile, targetTile, formation)?.steps ?? [];
  const plannedSteps =
    foundSteps.length > 0
      ? foundSteps
      : getUsableRemainingSteps(sourceTile, route, formation);
  const path = plannedSteps.slice(0, Math.max(0, formation.maxSteps));
  route.remainingSteps = plannedSteps.slice(path.length);
  return path;
}
var warbanderRoles = ["berserker", "archer", "seer"];
var warbanderSlotOffsets = {
  berserker: [0, 1],
  archer: [-1, 0],
  seer: [1, 0],
  quartet: [0, -1],
};
var defaultWarbanderFallbackOffsets = [[0, -1]];
// `attackPhase`: the ticks from a warbander's spawn to its first attack. It
// attacks every 6 ticks from then (isWarbanderAttackTick).
var warbanderRoleConfigs = {
  berserker: {
    npcTypeId: warbandBerserkerNpcTypeId,
    attackPhase: 3,
    plan: {
      formulaStyle: "melee_stab",
      damageType: "melee",
      attackKind: "melee_stab",
      impactDelayTicks: 1,
      maxHit: 29,
      sourceDeathPolicy: "cancel-before-impact",
    },
    weakness: "magic",
    seqs: colosseumSeqIds.warband.berserker,
  },
  archer: {
    npcTypeId: warbandArcherNpcTypeId,
    attackPhase: 5,
    plan: {
      formulaStyle: "ranged",
      damageType: "range",
      attackKind: "range_arrow",
      impactDelayTicks: getTicksFromCycles(warbandProjectileFlights.archer.endDelayCycles),
      maxHit: 14,
      sourceDeathPolicy: "persist",
    },
    weakness: "melee",
    seqs: colosseumSeqIds.warband.archer,
    projectile: {
      flight: warbandProjectileFlights.archer,
    },
  },
  seer: {
    npcTypeId: warbandSeerNpcTypeId,
    attackPhase: 4,
    plan: {
      formulaStyle: "magic",
      damageType: "magic",
      attackKind: "magic_fire",
      impactDelayTicks: getTicksFromCycles(warbandProjectileFlights.seer.endDelayCycles),
      maxHit: 12,
      sourceDeathPolicy: "persist",
    },
    weakness: "range",
    seqs: colosseumSeqIds.warband.seer,
    projectile: {
      flight: warbandProjectileFlights.seer,
      impact: {
        spotAnimId: colosseumSpotAnimIds.fireblastImpact,
        height: 124,
      },
    },
  },
};
function applyRelentlessToPlan(basePlan, relentlessTier) {
  return {
    ...basePlan,
    maxHit: basePlan.maxHit + relentlessMaxHitBonuses[relentlessTier],
    ...(relentlessTier === 3
      ? {
          alwaysHits: true,
        }
      : {}),
  };
}
function applyRelentlessDefenceBypass(player, relentlessTier) {
  const defence = player.stats.defence;
  const bypassedDefence = Math.floor((defence.current * relentlessDefenceBypassPercents[relentlessTier]) / 100);
  return {
    ...player,
    stats: {
      ...player.stats,
      defence: {
        ...defence,
        current: defence.current - bypassedDefence,
      },
    },
  };
}
function getWarbanderSpawnTick(actor) {
  return actor.spawnTick ?? 0;
}
function getNextWarbanderAttackTick(actor, tick) {
  const firstAttackTick = getWarbanderSpawnTick(actor) + warbanderRoleConfigs[actor.state.role].attackPhase;
  if (tick <= firstAttackTick) {
    return firstAttackTick;
  } else {
    return firstAttackTick + Math.ceil((tick - firstAttackTick) / 6) * 6;
  }
}
function buildWarbanderRouteOptions(slotOffset, fallbackOffsets) {
  return {
    size: 1,
    maxSteps: 2,
    slotOffset: slotOffset,
    fallbackOffsets: fallbackOffsets,
    canOccupy: isArenaFootprintWalkable,
    unreachable: "nearest-adjacent",
  };
}
function isAtExactMinionSlot(actorTile, targetTile, formation) {
  const slotPath = findMinionSlotRoute([actorTile[0], actorTile[1]], targetTile, formation);
  return slotPath?.kind === "exact" && slotPath.steps.length === 0;
}
function isWarbanderInAttackSlot(actorTile, targetTile, slotOffset, fallbackOffsets) {
  return (
    Math.abs(actorTile[0] - targetTile[0]) + Math.abs(actorTile[1] - targetTile[1]) === 1 &&
    isAtExactMinionSlot(actorTile, targetTile, buildWarbanderRouteOptions(slotOffset, fallbackOffsets))
  );
}
function getMinionRouteMoves(actor, targetTile, formation, route) {
  const path = takeMinionRouteSteps(actor.position, targetTile, formation, route);
  if (path.length === 0) {
    return [];
  } else {
    return [
      {
        npcId: actor.id,
        path: path,
      },
    ];
  }
}
function isWarbanderAttackTick(actor, tick) {
  const ticksSinceFirstAttack = tick - getWarbanderSpawnTick(actor) - warbanderRoleConfigs[actor.state.role].attackPhase;
  return ticksSinceFirstAttack >= 0 && ticksSinceFirstAttack % 6 == 0;
}
var warbanderNpcDefinition = defineNpc({
  id: "colosseum-warbander",
  deathPolicy: "queued",
  move: ({ actor: actor, context: context }) => {
    const player = context.world.getPlayer();
    if (!canNpcActAtTick(actor, context.tick) || !player?.alive || context.tick < getWarbanderSpawnTick(actor) + 2) {
      return [];
    } else if (isNpcBoundAtTick(actor, context.tick)) {
      actor.state.route.remainingSteps = [];
      return [];
    } else {
      return getMinionRouteMoves(
        actor,
        player.position,
        buildWarbanderRouteOptions(actor.state.slotOffset, actor.state.fallbackOffsets),
        actor.state.route,
      );
    }
  },
  tick: ({ actor: actor, context: context }) => {
    const noAttack = {
      environmentalDamages: [],
    };
    const player = context.world.getPlayer();
    if (
      !canNpcActAtTick(actor, context.tick) ||
      !player?.alive ||
      !isWarbanderAttackTick(actor, context.tick)
    ) {
      return noAttack;
    }
    const previousPosition = actor.previousPosition;
    if (
      !isWarbanderInAttackSlot(
        previousPosition,
        player.position,
        actor.state.slotOffset,
        actor.state.fallbackOffsets,
      )
    ) {
      return noAttack;
    }
    const roleProfile = warbanderRoleConfigs[actor.state.role];
    const { relentless: relentless } = actor.state;
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: relentless === 0 ? player : applyRelentlessDefenceBypass(player, relentless),
      plan:
        relentless === 0
          ? roleProfile.plan
          : applyRelentlessToPlan(roleProfile.plan, relentless),
      random: context.random,
    });
    if (npcAttack === null) {
      throw new TypeError(`Missing formula stats for ${actor.id}`);
    }
    const { projectile: projectile } = roleProfile;
    const impactGraphic = projectile?.impact;
    emitColosseumVisual(context.tickEvents, {
      animations: [
        {
          actorId: actor.id,
          clipId: "attack",
          delayCycles: 0,
        },
      ],
      graphics: impactGraphic
        ? [
            {
              ...impactGraphic,
              actorId: player.id,
              delayCycles: projectile.flight.endDelayCycles,
            },
          ]
        : [],
      ...(projectile && {
        projectiles: [
          {
            ...projectile.flight,
            sourcePosition: getProjectileSourcePosition({
              size: actor.size,
              position: previousPosition,
            }),
            target: buildActorVisualTarget(player),
          },
        ],
      }),
    });
    return {
      environmentalDamages: [],
      npcAttacks: [npcAttack],
    };
  },
  onDamageResolved: ({ actor: actor, damage: damage, context: context }) => {
    if (
      !(damage.effectiveDamage < 0) &&
      !(damage.hpAfter <= 0) &&
      !(damage.hpAfter > damage.hpBefore)
    ) {
      emitColosseumVisual(context.tickEvents, {
        animations: [
          {
            actorId: actor.id,
            clipId: "defend",
            delayCycles: 0,
          },
        ],
        graphics: [],
      });
    }
  },
  onDeathStarted: ({ actor: actor }) => {
    actor.state.route.remainingSteps = [];
  },
  attackTimer: ({ actor: actor, context: context }) =>
    canNpcActAtTick(actor, context.tick)
      ? {
          nextAttackTick: getNextWarbanderAttackTick(actor, context.tick),
          attackSpeed: 6,
        }
      : null,
});
var beeSwarmSpawnTiles = [
  [26, 30],
  [34, 32],
  [31, 39],
  [37, 34],
  [38, 32],
  [38, 36],
  [34, 38],
  [37, 32],
  [36, 38],
];
var canBeeSwarmOccupy = isArenaFootprintWalkable;
function pickBeeSwarmDestination(playerTile, size, random) {
  const candidateTiles = [];
  for (let dx = -6; dx <= 6; dx++) {
    for (let dy = -6; dy <= 6; dy++) {
      const tile = [playerTile[0] + dx, playerTile[1] + dy];
      if (canBeeSwarmOccupy(tile, size)) {
        candidateTiles.push(tile);
      }
    }
  }
  if (candidateTiles.length === 0) {
    return null;
  } else {
    return candidateTiles[Math.floor(random() * candidateTiles.length)];
  }
}
function findDirectMinionPath(pathRequest) {
  if (!isValidMinionRouteRequest(pathRequest)) {
    return {
      kind: "failed",
    };
  }
  const steps = [];
  let currentTile = pathRequest.source;
  while (currentTile[0] !== pathRequest.destination[0] || currentTile[1] !== pathRequest.destination[1]) {
    const nextTile = [
      currentTile[0] + Math.sign(pathRequest.destination[0] - currentTile[0]),
      currentTile[1] + Math.sign(pathRequest.destination[1] - currentTile[1]),
    ];
    if (
      !pathRequest.canOccupy(nextTile, pathRequest.size) ||
      !canFootprintStepInArena(currentTile, nextTile, {
        width: pathRequest.size,
        height: pathRequest.size,
      }) ||
      pathRequest.canStep?.(currentTile, nextTile, pathRequest.size) === false
    ) {
      return findNpcRoute(pathRequest, "tile");
    }
    steps.push(nextTile);
    currentTile = nextTile;
  }
  return {
    kind: "exact",
    steps: steps,
  };
}
var beeSwarmNpcDefinition = defineNpc({
  id: "colosseum-bees",
  onDefeated: ({ actor: actor, defeat: defeat }) => {
    actor.state.teleportAt = defeat.tick + 5;
    actor.state.defeatedTick = defeat.tick;
    actor.state.resumeAt = null;
    actor.state.destination = null;
  },
  move: ({ actor: actor, context: context }) => {
    const player = context.world.getPlayer();
    if (!actor.alive || !player?.alive) {
      return [];
    }
    const state = actor.state;
    // A window is the 12 ticks after which the swarm picks a new destination.
    if (context.tick >= state.nextWindowTick) {
      const windowStartTick =
        state.nextWindowTick +
        Math.floor((context.tick - state.nextWindowTick) / 12) * 12;
      state.nextWindowTick = windowStartTick + 12;
      state.nextStepTick = windowStartTick;
      state.destination = pickBeeSwarmDestination(player.position, actor.size, context.random);
    }
    if (
      context.tick < state.nextStepTick ||
      (context.tick - state.nextStepTick) % 2 != 0
    ) {
      return [];
    }
    state.nextStepTick = context.tick + 2;
    if (!state.destination) {
      return [];
    }
    const pathToDestination = findDirectMinionPath({
      source: actor.position,
      destination: state.destination,
      size: actor.size,
      canOccupy: canBeeSwarmOccupy,
      moveNear: false,
    });
    const nextStep = pathToDestination.kind === "exact" ? pathToDestination.steps[0] : undefined;
    if (nextStep) {
      return [
        {
          npcId: actor.id,
          path: [nextStep],
        },
      ];
    } else {
      return [];
    }
  },
  resolveLocalEffects: ({ actor: actor, context: context }) => {
    const player = context.world.getPlayer();
    const defeatedLastTick = !actor.alive && actor.state.defeatedTick === context.tick - 1;
    if ((!actor.alive && !defeatedLastTick) || !player?.alive || actor.spawnTick === context.tick) {
      return [];
    }
    if (
      !isTileInFootprint(
        actor.alive ? actor.previousPosition : actor.position,
        actor.size,
        player.position,
      )
    ) {
      return [];
    }
    emitColosseumVisual(context.tickEvents, {
      animations: [
        {
          actorId: actor.id,
          clipId: "attack",
          delayCycles: 0,
        },
      ],
      graphics: [],
    });
    const poisonImmune = player.poisonState.poisonVarp < 0;
    return [
      {
        baseDamage: poisonImmune ? [5, 10] : [10, 20],
        attackType: "typeless",
        source: "Bees",
        playerPosition: [...player.position],
        ...(poisonImmune
          ? {}
          : {
              applyPoison: 5, // a poison severity
            }),
      },
    ];
  },
});
function advanceBeeSwarmRespawn(actor, tick) {
  const state = actor.state;
  if (state.teleportAt !== null && tick >= state.teleportAt) {
    actor.position = [...state.spawnPosition];
    actor.previousPosition = [...state.spawnPosition];
    actor.movementPath = [];
    state.resumeAt = state.teleportAt + 55;
    state.teleportAt = null;
  }
  if (state.resumeAt !== null && tick >= state.resumeAt) {
    reviveNpc(actor);
    state.defeatedTick = null;
    actor.vitals.hp = actor.vitals.maxHp;
    actor.despawnTick = undefined;
    actor.debuffs = undefined;
    state.nextStepTick = state.resumeAt;
    state.nextWindowTick = state.resumeAt;
    state.destination = null;
    state.resumeAt = null;
  }
}
export {
  warbanderRoles,
  warbanderSlotOffsets,
  defaultWarbanderFallbackOffsets,
  warbanderRoleConfigs,
  warbanderNpcDefinition,
  beeSwarmSpawnTiles,
  beeSwarmNpcDefinition,
  advanceBeeSwarmRespawn,
  applyRelentlessToPlan,
  applyRelentlessDefenceBypass,
};
