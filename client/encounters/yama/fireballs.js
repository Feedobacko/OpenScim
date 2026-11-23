import { logger } from "../../util/logger.js";
import { LogEventType } from "../../engine/logEventTypes.js";
import { getFireballPhase, getFireballImpactTiles, getFireballExplosionTiles, fireballLifetimeTicks } from "./fireballGeometry.js";
import { fireballBurstTickOffsets, isDuoSide, isFireballBurstVertical, getFireballAngle, getFireballInstanceId, getScheduledFireballs, isFireballPerfectDodgeTile } from "./fireballBursts.js";
function resolveFireballHazards(fireballs, resolution) {
  if (resolution.activeFireballs.length === 0) {
    return;
  }
  const player = resolution.ctx.world.getPlayer();
  if (!player) {
    return;
  }
  const playerPosition = player.position;
  const pushDamage = () => {
    resolution.damages.push({
      baseDamage: resolution.damage,
      attackType: "typeless",
      source: "Fireball",
      playerPosition: [...playerPosition],
    });
  };
  for (const fireball of resolution.activeFireballs) {
    if (!player.alive) {
      break;
    }
    const center = fireballs.startPositions.get(fireball.instanceId);
    // No centre: the fireball is in the schedule but its burst never started (a
    // planned melee cancelled it, or the toggle was off on its beat).
    if (!center) {
      continue;
    }
    const { phase: phase } = getFireballPhase(fireball.startTick, resolution.ctx.tick);
    if (phase === "impact") {
      if (!fireballs.impactEmitted.has(fireball.instanceId)) {
        fireballs.impactEmitted.add(fireball.instanceId);
        resolution.ctx.tickEvents.emit({
          type: "fireball_impact",
          sourceId: resolution.sourceActorId,
          targetPosition: center,
          fireballIndex: fireball.instanceId, // the fireball's id, not an index
        });
      }
      if (!fireballs.impactDealt.has(fireball.instanceId)) {
        if (
          getFireballImpactTiles(center, fireball.angle).some(
            (impactTile) => impactTile[0] === playerPosition[0] && impactTile[1] === playerPosition[1],
          )
        ) {
          pushDamage();
          fireballs.impactDealt.add(fireball.instanceId);
        }
      }
    }
    if (phase !== "explosion" || fireballs.explosionDealt.has(fireball.instanceId)) {
      continue;
    }
    if (
      getFireballExplosionTiles(center, fireball.angle).some(
        (explosionTile) => explosionTile[0] === playerPosition[0] && explosionTile[1] === playerPosition[1],
      )
    ) {
      pushDamage();
      fireballs.explosionDealt.add(fireball.instanceId);
      continue;
    }
    if (fireballs.perfectDodgeTriggered.has(fireball.instanceId)) {
      continue;
    }
    if (
      player.combatTimers.markOfDarknessActiveTicks <= 0 ||
      !isFireballPerfectDodgeTile(playerPosition, center, fireball.angle)
    ) {
      continue;
    }
    const queuedDamage = resolution.damages.reduce(
      (total, damage) =>
        total +
        (typeof damage.baseDamage == "number" ? damage.baseDamage : damage.baseDamage[0]),
      0,
    );
    if (!(player.vitals.hp <= queuedDamage)) {
      fireballs.perfectDodgeTriggered.add(fireball.instanceId);
      fireballs.shadowWaveImmunityTick = resolution.ctx.tick + 1;
      resolution.ctx.grantNextAttackSpeedup(player.id, 1);
      resolution.ctx.tickEvents.emit({
        type: "yama_perfect_dodge",
        fireballIndex: fireball.instanceId, // the fireball's id, not an index
        playerPosition: [...playerPosition],
        fireballCenter: [...center],
        angle: fireball.angle,
      });
      logger.info(
        "PerfectDodge",
        `🛡️ tick ${resolution.ctx.tick}: player at [${playerPosition[0]}, ${playerPosition[1]}] dodged fireball #${fireball.instanceId} centered [${center[0]}, ${center[1]}] (${fireball.angle}) with Mark of Darkness — granting +1 tick to the next attack.`,
      );
    }
  }
}
var FireballRuntime = class {
  sourceActorId;
  attackPattern;
  damage;
  allowDuoSide;
  constructor(sourceActorId, attackPattern, damage, allowDuoSide) {
    this.sourceActorId = sourceActorId;
    this.attackPattern = attackPattern;
    this.damage = damage;
    this.allowDuoSide = allowDuoSide;
  }
  spawnManualBurst(fireballs, spawnRequest) {
    const configuredShape = this.getBurstShapeFromMechanics(spawnRequest.mechanics);
    const burstIndex = fireballs.manualBurstCount++;
    for (let indexInBurst = 0; indexInBurst < fireballBurstTickOffsets.length; indexInBurst++) {
      const startTick = spawnRequest.tick + 2 + fireballBurstTickOffsets[indexInBurst];
      const angle = getFireballAngle(burstIndex, indexInBurst, fireballs.seed, configuredShape.start, configuredShape.side);
      const instanceId = -++fireballs.manualNextId;
      fireballs.manual.set(instanceId, {
        startTick: startTick,
        angle: angle,
      });
      fireballs.registeredIds.add(instanceId);
    }
  }
  processPostTick(fireballs, context, tickInfo) {
    const scheduledEnabled = tickInfo.mechanics.fireballs === true;
    const startsBurst =
      scheduledEnabled &&
      tickInfo.beatInfo.isBeat &&
      tickInfo.beatInfo.isFireballBeat &&
      !tickInfo.didPlanMelee;
    if (startsBurst) {
      this.registerScheduledBurst(fireballs, tickInfo.beatInfo, this.getBurstShapeFromMechanics(tickInfo.mechanics));
    }
    this.emitPendingSpawnEvents(fireballs, context);
    if (scheduledEnabled || fireballs.manual.size > 0) {
      this.recordStartPositions(fireballs, context, {
        tick: context.tick + 1,
        scheduledEnabled: scheduledEnabled,
        shapeForBurst: this.createBurstShapeLookup(fireballs, tickInfo.mechanics),
      });
    }
    this.removeExpiredManualFireballs(fireballs, context.tick);
    // True when a snap burst started: the encounter then records "fireball"
    // as Yama's latest attack.
    return startsBurst && tickInfo.beatInfo.fireballBeatKind === "snap";
  }
  resolveHazards(fireballs, context, hazards) {
    resolveFireballHazards(fireballs, {
      ctx: context,
      activeFireballs: this.getActiveFireballs(fireballs, {
        tick: context.tick,
        scheduledEnabled: hazards.mechanics.fireballs === true,
        shapeForBurst: this.createBurstShapeLookup(fireballs, hazards.mechanics),
      }),
      sourceActorId: this.sourceActorId,
      damage: this.damage,
      damages: hazards.damages,
    });
  }
  buildVisuals(fireballs, snapshotRequest) {
    if (snapshotRequest.defeated) {
      return this.buildInactiveVisuals();
    }
    const fireballStates = this.getActiveFireballs(fireballs, {
      tick: snapshotRequest.tick,
      scheduledEnabled: snapshotRequest.mechanics.fireballs === true,
      shapeForBurst: this.createBurstShapeLookup(fireballs, snapshotRequest.mechanics),
    }).flatMap((fireball) => {
      const center = fireballs.startPositions.get(fireball.instanceId);
      if (center) {
        return [
          {
            active: true,
            // The scene's names: `phaseIndex` is the fireball's id and
            // `ticksIntoPhase` its age in ticks.
            phaseIndex: fireball.instanceId,
            centerPosition: center,
            angle: fireball.angle,
            ticksIntoPhase: snapshotRequest.tick - fireball.startTick,
          },
        ];
      } else {
        return [];
      }
    });
    return {
      fireballState: fireballStates[0] ?? this.buildInactiveVisuals().fireballState,
      fireballStates: fireballStates,
    };
  }
  clearFireballs(fireballs) {
    fireballs.startPositions.clear();
    fireballs.pendingSpawnEvents.length = 0;
    fireballs.impactDealt.clear();
    fireballs.impactEmitted.clear();
    fireballs.explosionDealt.clear();
    fireballs.registeredIds.clear();
    fireballs.burstShapes.clear();
    fireballs.perfectDodgeTriggered.clear();
    fireballs.shadowWaveImmunityTick = null;
    fireballs.manual.clear();
    fireballs.manualNextId = 0;
    fireballs.manualBurstCount = 0;
  }
  getBurstShapeFromMechanics(mechanics) {
    const fireballStart = mechanics.fireballStart;
    return {
      start:
        fireballStart === "random" || fireballStart === "vertical" || fireballStart === "horizontal"
          ? mechanics.fireballStart
          : "random",
      side: this.allowDuoSide && isDuoSide(mechanics.duoSide) ? mechanics.duoSide : "player1",
    };
  }
  createBurstShapeLookup(fireballs, mechanics) {
    const configuredShape = this.getBurstShapeFromMechanics(mechanics);
    return (burstIndex) => fireballs.burstShapes.get(burstIndex) ?? configuredShape;
  }
  getActiveFireballs(fireballs, query) {
    return [
      ...(query.scheduledEnabled
        ? getScheduledFireballs(query.tick, fireballs.seed, this.attackPattern, query.shapeForBurst)
        : []),
      ...this.getActiveManualFireballs(fireballs, query.tick),
    ];
  }
  getActiveManualFireballs(fireballs, tick) {
    const activeFireballs = [];
    for (const [instanceId, manualFireball] of fireballs.manual) {
      const endTick = manualFireball.startTick + fireballLifetimeTicks - 1;
      if (tick >= manualFireball.startTick && tick <= endTick) {
        activeFireballs.push({
          startTick: manualFireball.startTick,
          endTick: endTick,
          angle: manualFireball.angle,
          instanceId: instanceId,
        });
      }
    }
    return activeFireballs;
  }
  registerScheduledBurst(fireballs, beatInfo, configuredShape) {
    const fireballBeats = this.attackPattern.fireballBeats;
    const cycleIndex = Math.floor(
      beatInfo.globalBeatOrdinal / this.attackPattern.beatsPerCycle,
    );
    if (cycleIndex < 0) {
      return;
    }
    const beatSlot = fireballBeats.indexOf(beatInfo.beatIndex);
    if (beatSlot === -1) {
      return;
    }
    const burstIndex = cycleIndex * fireballBeats.length + beatSlot;
    // The shapes of the last six bursts are kept: two cycles of three.
    for (const storedBurstIndex of fireballs.burstShapes.keys()) {
      if (storedBurstIndex <= burstIndex - 6) {
        fireballs.burstShapes.delete(storedBurstIndex);
      }
    }
    fireballs.burstShapes.set(burstIndex, {
      start: isFireballBurstVertical(burstIndex, fireballs.seed, configuredShape.start) ? "vertical" : "horizontal",
      side: configuredShape.side,
    });
    for (let indexInBurst = 0; indexInBurst < fireballBurstTickOffsets.length; indexInBurst++) {
      fireballs.registeredIds.add(getFireballInstanceId(cycleIndex, beatSlot, indexInBurst));
    }
  }
  recordStartPositions(fireballs, context, query) {
    for (const fireball of this.getActiveFireballs(fireballs, query)) {
      if (fireball.startTick !== query.tick || fireballs.startPositions.has(fireball.instanceId)) {
        continue;
      }
      if (!fireballs.registeredIds.has(fireball.instanceId)) {
        continue;
      }
      const center = [...context.playerPos];
      // Despite the key's name, the centre of the impact: the player's tile in
      // the post-tick before the fireball's start tick.
      fireballs.startPositions.set(fireball.instanceId, center);
      context.logEvent({
        tick: fireball.startTick,
        type: LogEventType.FIREBALL_SPAWN,
        phaseIndex: fireball.instanceId, // the log's name for the fireball's id
        centerPosition: center,
        angle: fireball.angle,
      });
      fireballs.pendingSpawnEvents.push({
        startTick: fireball.startTick,
        instanceId: fireball.instanceId,
        center: center,
      });
    }
  }
  emitPendingSpawnEvents(fireballs, context) {
    if (fireballs.pendingSpawnEvents.length === 0) {
      return;
    }
    const pendingSpawnEvents = fireballs.pendingSpawnEvents;
    fireballs.pendingSpawnEvents = pendingSpawnEvents.filter(
      (pendingSpawnEvent) => pendingSpawnEvent.startTick > context.tick,
    );
    for (const pendingSpawnEvent of pendingSpawnEvents) {
      if (pendingSpawnEvent.startTick === context.tick) {
        context.tickEvents.emit({
          type: "fireball_spawned",
          sourceId: this.sourceActorId,
          targetPosition: pendingSpawnEvent.center,
          fireballIndex: pendingSpawnEvent.instanceId,
        });
      }
    }
  }
  removeExpiredManualFireballs(fireballs, tick) {
    for (const [instanceId, manualFireball] of fireballs.manual) {
      if (!(tick <= manualFireball.startTick + fireballLifetimeTicks - 1)) {
        fireballs.manual.delete(instanceId);
        fireballs.startPositions.delete(instanceId);
        fireballs.impactDealt.delete(instanceId);
        fireballs.impactEmitted.delete(instanceId);
        fireballs.explosionDealt.delete(instanceId);
        fireballs.perfectDodgeTriggered.delete(instanceId);
        fireballs.registeredIds.delete(instanceId);
      }
    }
  }
  buildInactiveVisuals() {
    return {
      fireballState: {
        active: false,
        phaseIndex: null,
        centerPosition: null,
        angle: null,
        ticksIntoPhase: 0,
      },
      fireballStates: [],
    };
  }
};
function isValidSeed(seed) {
  return (
    typeof seed == "number" && Number.isInteger(seed) && seed >= 0 && seed <= 4294967295
  );
}
export { FireballRuntime, isValidSeed };
