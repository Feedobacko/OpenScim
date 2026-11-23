import { canNpcActAtTick, isActorAlive, isNpcAlive, canNpcBeHealed } from "../../engine/npcState.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import {
  buildActorVisualTarget,
  getProjectileSourcePosition,
  scheduleNextActionTick,
  faceActorToward,
  healNpc,
} from "../shared/npcHelpers.js";
import { emitInfernoVisual } from "./events.js";
import { emitZukDeath, isCombatActionDue, emitZukHit } from "./monsterHelpers.js";
function buildZukHealVisual(healers, target) {
  for (const healer of healers) {
    faceActorToward(healer, target);
  }
  return {
    animations: healers.map((healer) => ({
      actorId: healer.id,
      clipId: "heal",
      delayCycles: 0,
    })),
    projectiles: healers.map((healer) => ({
      spotAnimId: 660,
      sourcePosition: getProjectileSourcePosition(healer),
      target: buildActorVisualTarget(target),
      startDelayCycles: 0,
      endDelayCycles: 90,
      slope: 16,
      startOffset: 64,
      startHeight: 70,
      endHeight: 128,
    })),
    graphics: [
      {
        spotAnimId: 444,
        target: buildActorVisualTarget(target),
        delayCycles: 120,
        height: 256,
      },
    ],
  };
}
var zukHealerNpcDefinition = defineNpc({
  id: "inferno-healer",
  deathPolicy: "queued",
  move: false,
  onDamageResolved: emitZukHit,
  onDefeated: ({ actor: actor }) => {
    actor.state.pendingHeals = [];
  },
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "healer",
      position: actor.position,
    }),
  onDespawn: ({ actor: actor }) => {
    actor.state.pendingHeals = [];
  },
  resolveLocalEffects: ({ actor: actor, context: context, config: config }) => {
    const pendingHeals = actor.state.pendingHeals;
    actor.state.pendingHeals = [];
    if (!isNpcAlive(actor)) {
      return [];
    }
    for (const pendingHeal of pendingHeals) {
      if (context.tick < pendingHeal.applyTick) {
        actor.state.pendingHeals.push(pendingHeal);
      } else {
        const target = context.world.getNpc(pendingHeal.targetId);
        if (!target || !canNpcBeHealed(target)) {
          continue;
        }
        healNpc(target, pendingHeal.amount, context.tickEvents);
        config?.presentHeal?.(target, context);
      }
    }
    return [];
  },
  tick: ({ actor: actor, context: context, config: config }) => {
    if (!canNpcActAtTick(actor, context.tick) || context.tick < (actor.spawnTick ?? 0)) {
      return {
        environmentalDamages: [],
      };
    }
    const lastIncomingAttackTick = actor.combat.retaliation?.lastIncomingAttackTick;
    if (actor.state.firstEngagementTick === null && lastIncomingAttackTick != null) {
      actor.state.firstEngagementTick = lastIncomingAttackTick;
      actor.attackBlockedUntilTick = lastIncomingAttackTick + 1;
    }
    if (
      actor.combat.targetId === null &&
      context.tick < (actor.spawnTick ?? 0) + 4
    ) {
      return {
        environmentalDamages: [],
      };
    }
    if (!isCombatActionDue(actor.combat, context.tick)) {
      return {
        environmentalDamages: [],
      };
    }
    if (actor.combat.targetId !== null) {
      const target =
        context.world.getPlayers().find((player) => player.id === actor.combat.targetId) ??
        context.world.getNpc(actor.combat.targetId);
      if (!target || !isActorAlive(target)) {
        return {
          environmentalDamages: [],
        };
      }
      emitInfernoVisual(context.tickEvents, {
        animations: [
          {
            actorId: actor.id,
            clipId: "attack",
            delayCycles: 0,
          },
        ],
        projectiles: [],
        graphics: [],
      });
      actor.combat.lastAttackTick = context.tick;
      context.tickEvents.emit({
        type: "zuk_healer_cast",
        sourceId: actor.id,
        targetId: target.id,
        sourcePosition: [...actor.position],
      });
      config?.castSparks?.({
        actor: actor,
        target: target,
        context: context,
      });
    } else {
      const supportTarget = context.world.getNpc(actor.state.supportTargetId);
      if (!isNpcAlive(actor) || !supportTarget || !canNpcBeHealed(supportTarget)) {
        return {
          environmentalDamages: [],
        };
      }
      const { animations: animations, projectiles: projectiles } = buildZukHealVisual(
        [actor],
        supportTarget,
      );
      emitInfernoVisual(context.tickEvents, {
        animations: animations,
        projectiles: projectiles,
        graphics: [],
      });
      context.tickEvents.emit({
        type: "zuk_healer_cast",
        sourceId: actor.id,
        targetId: supportTarget.id,
        sourcePosition: [...actor.position],
      });
      if (config?.sampleHeal) {
        actor.state.pendingHeals.push({
          targetId: supportTarget.id,
          amount: config.sampleHeal({
            actor: actor,
            target: supportTarget,
            context: context,
          }),
          applyTick: context.tick + 4,
        });
      }
    }
    scheduleNextActionTick(actor.combat, context.tick, 3);
    return {
      environmentalDamages: [],
    };
  },
});
function rollZukSparkVolley({ source: sourceTile, player: playerTile, random: random }) {
  const dx = playerTile[0] - sourceTile[0];
  const columnShift = dx <= -3 ? -2 : dx >= 3 ? 2 : 0;
  const centreX = sourceTile[0] + columnShift;
  let playerTargeted = false;
  const createSpark = (columnX) => {
    const targetsPlayer =
      !playerTargeted &&
      Math.abs(playerTile[0] - columnX) <= 1 &&
      playerTile[1] >= sourceTile[1] - 8 &&
      playerTile[1] <= sourceTile[1] - 5;
    const landingTile = targetsPlayer
      ? [playerTile[0], playerTile[1]]
      : [
          columnX - 1 + Math.floor(random() * 3),
          sourceTile[1] - 8 + Math.floor(random() * 4),
        ];
    playerTargeted ||= targetsPlayer;
    const damageAmount = 5 + Math.floor(random() * 6);
    const slope = 40 + Math.floor(random() * 11);
    const landingDelayCycles = Math.floor(random() * 6);
    const sourcePosition = [sourceTile[0] + 0.5, sourceTile[1] + 0.5];
    Object.freeze(landingTile);
    Object.freeze(sourcePosition);
    return {
      position: landingTile,
      amount: damageAmount,
      projectile: {
        sourcePosition: sourcePosition,
        startDelayCycles: 0,
        endDelayCycles: 90,
        slope: slope,
        startOffset: 0,
        startHeight: 70,
        endHeight: 0,
      },
      landing: {
        height: 0,
        delayCycles: landingDelayCycles,
      },
    };
  };
  return [createSpark(centreX + 2), createSpark(centreX), createSpark(centreX - 2)];
}
var ZukSparks = class {
  pending = [];
  emit(sparkVolley, tick) {
    const sparks = structuredClone(sparkVolley.sparks);
    this.pending.push(
      ...sparks.map((spark) => ({
        tick: tick + 3,
        spark: spark,
      })),
    );
    const projectiles = sparks.flatMap((spark) =>
      spark.projectile
        ? [
            {
              ...spark.projectile,
              spotAnimId: 660,
              target: {
                kind: "tile",
                position: spark.position,
              },
            },
          ]
        : [],
    );
    if (projectiles.length > 0) {
      return {
        animations: [],
        projectiles: projectiles,
        graphics: [],
      };
    } else {
      return undefined;
    }
  }
  resolve(context) {
    const dueSparks = this.pending.filter((pendingSpark) => pendingSpark.tick === context.tick);
    this.pending = this.pending.filter((pendingSpark) => pendingSpark.tick > context.tick);
    const landingGraphics = dueSparks.flatMap(({ spark: spark }) =>
      spark.landing
        ? [
            {
              ...spark.landing,
              spotAnimId: 659,
              target: {
                kind: "tile",
                position: spark.position,
              },
            },
          ]
        : [],
    );
    if (landingGraphics.length > 0) {
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        projectiles: [],
        graphics: landingGraphics,
      });
    }
    return dueSparks.flatMap(({ spark: spark }) =>
      Math.abs(context.playerPos[0] - spark.position[0]) <= 1 &&
      Math.abs(context.playerPos[1] - spark.position[1]) <= 1
        ? [
            {
              baseDamage: spark.amount,
              attackType: "typeless",
              source: "ZukSpark",
              playerPosition: [...context.playerPos],
            },
          ]
        : [],
    );
  }
  clear() {
    this.pending = [];
  }
};
export { buildZukHealVisual, zukHealerNpcDefinition, rollZukSparkVolley, ZukSparks };
