import { Prayer } from "../../engine/prayerTables.js";
import { createOccupancyStepCheck } from "../../engine/occupancy.js";
import { isNpcHeldInPlace } from "../../engine/npcState.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { isTileUnderFootprint, getBossPursuitMoves } from "../shared/npcRoutes.js";
import { relentlessMaxHitBonuses, solHereditName, colosseumSpotAnimIds, emitColosseumVisual, solMessageColors, isSolArenaTile } from "./constants.js";
import { getGroundAttackDelayCycles, buildGroundAttackArea, isSolAttackDue, getForcedSpecialAttack, scheduleSolAttack, scheduleSolSpecialAttack, clearSolAttackState } from "./bossAttacks.js";
import { grappleTargets } from "./grapple.js";
var solEagerPrayerMessage = [
  {
    text: `${solHereditName} doesn't take kindly to your eager prayer.`,
    color: solMessageColors.red,
  },
];
function createSolPursuitMovement(arena, context) {
  const isStepUnblocked = createOccupancyStepCheck(context.world.occupancy);
  return {
    size: 5,
    maxSpeed: 2,
    canOccupy: ([x, y], size) => {
      for (let dx = 0; dx < size; dx++) {
        for (let dy = 0; dy < size; dy++) {
          if (!isSolArenaTile([x + dx, y + dy], arena)) {
            return false;
          }
        }
      }
      return true;
    },
    canStep: (fromTile, toTile, size) => isStepUnblocked(fromTile, toTile, size),
    underFootprint: "random-cardinal",
    unreachable: "hold",
  };
}
function takeDueGroundAttack(scheduler, tick, geometry) {
  if (scheduler.pendingGround?.resolveTick !== tick) {
    return null;
  }
  const groundAttack = buildGroundAttackArea(scheduler.pendingGround, geometry);
  scheduler.pendingGround = null;
  return groundAttack;
}
function takeDueTripleHit(scheduler, tick) {
  const hitThisTick = scheduler.pendingTriple.find((hit) => hit.tick === tick) ?? null;
  scheduler.pendingTriple = scheduler.pendingTriple.filter((hit) => hit.tick !== tick);
  return hitThisTick;
}
var solNpcDefinition = defineNpc({
  id: "colosseum-sol-heredit",
  onDefeated: ({ actor: actor }) => clearSolAttackState(actor),
  onDespawn: ({ actor: actor }) => clearSolAttackState(actor),
  move: ({ actor: actor, config: config, context: context }) => {
    const target =
      actor.combat.targetId === null
        ? undefined
        : context.world.actors.get(actor.combat.targetId);
    if (
      !actor.alive ||
      !target?.alive ||
      context.world.actors.get(actor.id) !== actor ||
      context.tick < actor.state.immobileUntilTick ||
      isNpcHeldInPlace(actor, context.world.getPlayer(), context.tick) ||
      (isInSolMeleeRange(actor.position, target.position) && !isTileUnderFootprint(actor.position, 5, target.position))
    ) {
      return [];
    } else {
      return getBossPursuitMoves(
        actor,
        target.position,
        context.random,
        createSolPursuitMovement(config.arena, context),
      );
    }
  },
  resolveLocalEffects: ({ actor: actor, config: config, context: context }) => {
    const player = context.world.getPlayer();
    if (!actor.alive || !player?.alive || actor.combat.targetId !== player.id) {
      clearSolAttackState(actor);
      return [];
    }
    const damages = [];
    const groundAttack = takeDueGroundAttack(actor.state.scheduler, context.tick, {
      position: actor.position,
      target: player.position,
      arena: config.arena,
    });
    if (groundAttack) {
      emitColosseumVisual(context.tickEvents, {
        animations: [],
        graphics: groundAttack.tiles.map((tile, index) => ({
          spotAnimId: colosseumSpotAnimIds.solMelee[index % colosseumSpotAnimIds.solMelee.length],
          position: [tile[0], tile[1]],
          delayCycles: getGroundAttackDelayCycles(tile, groundAttack.centre),
        })),
      });
      if (groundAttack.tiles.some(([x, y]) => x === player.position[0] && y === player.position[1])) {
        const rollDamage = () => Math.floor(context.random() * 45);
        damages.push({
          baseDamage: Math.max(rollDamage(), rollDamage()),
          attackType: "typeless",
          source: groundAttack.style === "spear" ? "SolSpear" : "SolShield",
          playerPosition: [...player.position],
        });
      }
    }
    const pendingTriple = actor.state.scheduler.pendingTriple;
    const hitNextTick = pendingTriple.find((hit) => hit.tick === context.tick + 1);
    if (player.activePrayer === Prayer.ProtectMelee && hitNextTick) {
      context.setProtectionPrayer?.(null);
      context.tickEvents.emit({
        type: "game_message",
        kind: "spam",
        segments: solEagerPrayerMessage,
      });
      const followingHit = pendingTriple
        .filter((hit) => hit.tick > hitNextTick.tick)
        .sort((hitA, hitB) => hitA.tick - hitB.tick)[0];
      context.disableProtectionPrayersUntil?.((followingHit ?? hitNextTick).tick + 1);
    }
    const hitThisTick = takeDueTripleHit(actor.state.scheduler, context.tick);
    const activatedProtectMeleeThisTick =
      player.activePrayer === Prayer.ProtectMelee &&
      player.prayerState.prayerActivationTicks[Prayer.ProtectMelee] === context.tick;
    if (hitThisTick) {
      damages.push({
        baseDamage: activatedProtectMeleeThisTick ? 0 : hitThisTick.damage + relentlessMaxHitBonuses[actor.state.relentless],
        attackType: "typeless",
        source: "SolTripleAttack",
        ...(activatedProtectMeleeThisTick
          ? {}
          : {
              disablesProtectionPrayersForTicks: 1,
            }),
        playerPosition: [...player.position],
      });
    }
    return damages;
  },
});
function canSolLaunchAttackFrom(boss, context, bossTile) {
  const target =
    boss.combat.targetId === null
      ? undefined
      : context.world.actors.get(boss.combat.targetId);
  return (
    boss.alive &&
    target?.alive === true &&
    boss.state.grapple.pending === null &&
    isSolAttackDue(boss.state.scheduler, context.tick) &&
    isInSolMeleeRange(bossTile, target.position)
  );
}
function startGrapple(grapple, startTick, random) {
  const grappleTarget = {
    ...grappleTargets[Math.floor(random() * grappleTargets.length)],
  };
  grapple.pending = {
    target: grappleTarget,
    startTick: startTick,
    defendedTick: null,
  };
  return grappleTarget;
}
function tryLaunchSolAttack(boss, context, launchOptions) {
  if (!canSolLaunchAttackFrom(boss, context, context.npcMovements?.get(boss.id)?.from ?? boss.position)) {
    return {
      launched: false,
      taunt: null,
    };
  }
  const scheduler = boss.state.scheduler;
  const launchConditions = {
    tick: context.tick,
    phase: launchOptions.phase,
    random: launchOptions.random,
    grappleAvailable: context.tick >= boss.state.grappleReadyTick,
    stylePin: launchOptions.stylePin,
  };
  let launch;
  if (launchOptions.enabled) {
    launch = scheduleSolAttack(scheduler, launchConditions);
  } else {
    const forcedSpecial = getForcedSpecialAttack(scheduler, launchConditions.grappleAvailable);
    if (forcedSpecial === null) {
      return {
        launched: false,
        taunt: null,
      };
    }
    launch = scheduleSolSpecialAttack(scheduler, forcedSpecial, launchConditions);
  }
  let clipId;
  let immobileTicks = 1;
  let delayCycles = 0;
  const graphics = [];
  let taunt = null;
  switch (launch.kind) {
    case "regular":
      immobileTicks = launch.style === "spear" ? 6 : 4;
      clipId = launch.style;
      break;
    case "grapple":
      immobileTicks = 5;
      taunt = startGrapple(boss.state.grapple, context.tick, launchOptions.random).taunt;
      // From this tick a grapple may be chosen again (`grappleAvailable`). The
      // next attack is 7 ticks away, so it always may.
      boss.state.grappleReadyTick = context.tick + 1;
      clipId = "grapple";
      delayCycles = 30; // one tick: a tick is 30 client cycles
      break;
    case "triple":
      clipId = launch.long ? "triple" : "tripleShort";
      graphics.push({
        actorId: boss.id,
        spotAnimId: launch.long ? colosseumSpotAnimIds.tripleTelegraphLong : colosseumSpotAnimIds.tripleTelegraphShort,
        delayCycles: 0,
      });
      break;
    default:
      return (function (unknownLaunch) {
        throw new TypeError(`Unknown Sol launch: ${JSON.stringify(unknownLaunch)}`);
      })(launch);
  }
  boss.state.immobileUntilTick = Math.max(boss.state.immobileUntilTick, context.tick + immobileTicks);
  emitColosseumVisual(context.tickEvents, {
    animations: [
      {
        actorId: boss.id,
        clipId: clipId,
        delayCycles: delayCycles,
      },
    ],
    graphics: graphics,
  });
  return {
    launched: true,
    taunt: taunt,
  };
}
function isInSolMeleeRange(bossTile, targetTile) {
  const xWithinFootprint = targetTile[0] >= bossTile[0] && targetTile[0] <= bossTile[0] + 4;
  const yWithinFootprint = targetTile[1] >= bossTile[1] && targetTile[1] <= bossTile[1] + 4;
  return (
    (xWithinFootprint && yWithinFootprint) ||
    (xWithinFootprint && (targetTile[1] === bossTile[1] - 1 || targetTile[1] === bossTile[1] + 5)) ||
    (yWithinFootprint && (targetTile[0] === bossTile[0] - 1 || targetTile[0] === bossTile[0] + 5))
  );
}
export { solNpcDefinition, canSolLaunchAttackFrom, tryLaunchSolAttack };
