import { canNpcActAtTick } from "../../engine/npcState.js";
import { getContextDecisions } from "../../engine/decisions.js";
import { rollNpcAttack } from "../shared/npcAttack.js";
import { getNpcPursuitMoves } from "../shared/npcMovement.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { emitInfernoVisual, emitInfernoNpcAttack } from "./events.js";
import { scheduleNextActionTick } from "../shared/npcHelpers.js";
import { buildLabelledDecisions, canNpcAttackWithPlan, emitZukDeath, emitInfernoAbility, isCombatActionDue, emitZukHit, resolveMonsterTarget, isOpenFloorFootprint } from "./monsterHelpers.js";
function clearNpcTargetableFromTick(actor) {
  delete actor.targetableFromTick;
}
var meleerAttackPlan = {
  formulaStyle: "melee_slash",
  damageType: "melee",
  attackKind: "melee_slash",
  impactDelayTicks: 0,
  maxHit: 49,
  sourceDeathPolicy: "cancel-before-impact",
};
var meleerDigUpOffsets = [
  [3, 3],
  [0, 0],
  ...[1, 2, 0, 3]
    .flatMap((dy) => [1, 2, 0, 3].map((dx) => [dx, dy]))
    .filter(([dx, dy]) => (dx !== 3 || dy !== 3) && (dx !== 0 || dy !== 0)),
];
function emitMeleerAnimation(actor, clipId, context) {
  emitInfernoVisual(context.tickEvents, {
    animations: [
      {
        actorId: actor.id,
        clipId: clipId,
        delayCycles: 0,
      },
    ],
    projectiles: [],
    graphics: [],
  });
}
function findMeleerDigUpTile(actor, targetTile) {
  const canDigUpAt = (tile) => isOpenFloorFootprint(tile, 4);
  for (const [dx, dy] of meleerDigUpOffsets) {
    const candidateTile = [targetTile[0] - dx, targetTile[1] - dy];
    if (canDigUpAt(candidateTile)) {
      return candidateTile;
    }
  }
  for (let distance = 1; distance <= 8; distance++) {
    for (let y = targetTile[1] + distance; y >= targetTile[1] - 4 + 1 - distance; y--) {
      for (let x = targetTile[0] - 4 + 1 - distance; x <= targetTile[0] + distance; x++) {
        const gapX = Math.max(x - targetTile[0], 0, targetTile[0] - (x + 4 - 1));
        const gapY = Math.max(y - targetTile[1], 0, targetTile[1] - (y + 4 - 1));
        if (Math.max(gapX, gapY) === distance && canDigUpAt([x, y])) {
          return [x, y];
        }
      }
    }
  }
  return [...actor.position];
}
function rollMeleerDigInterval(actor, tick, context) {
  const decisionKey = {
    site: "inferno.meleer.dig_interval",
    tick: tick,
    actorId: actor.id,
  };
  return 40 + getContextDecisions(context).int(decisionKey, 0, 20);
}
function advanceMeleerDig(actor, context) {
  const state = actor.state;
  const dig = state.dig;
  if (dig !== null) {
    if (context.tick < dig.downTick + 3) {
      return;
    }
    const digUpTile = dig.target
      ? findMeleerDigUpTile(actor, dig.target)
      : [...actor.position];
    actor.position = [digUpTile[0], digUpTile[1]];
    actor.previousPosition = [digUpTile[0], digUpTile[1]];
    actor.movementPath = [];
    state.dig = null;
    clearNpcTargetableFromTick(actor);
    state.walkFromTick = context.tick + 3;
    actor.combat.nextActionTick = Math.max(actor.combat.nextActionTick, context.tick + 9);
    emitMeleerAnimation(actor, "dig_up", context);
    emitInfernoAbility(context, {
      ability: "meleer_dig_up",
      actorId: actor.id,
      position: actor.position,
    });
    return;
  }
  if (context.tick < state.nextDigCheckTick) {
    return;
  }
  const lastAttackTick = actor.combat.lastAttackTick;
  const digIntervalTicks = rollMeleerDigInterval(actor, context.tick, context);
  if (lastAttackTick !== null && context.tick - lastAttackTick <= 19) {
    state.nextDigCheckTick = context.tick + digIntervalTicks;
    return;
  }
  state.nextDigCheckTick = context.tick + 3 + 3 + digIntervalTicks;
  const player = context.world.getPlayer();
  state.dig = {
    downTick: context.tick,
    target: player ? [player.position[0], player.position[1]] : null,
  };
  actor.targetableFromTick = context.tick + 3;
  emitMeleerAnimation(actor, "dig_down", context);
  emitInfernoAbility(context, {
    ability: "meleer_dig_down",
    actorId: actor.id,
    position: actor.position,
  });
}
var meleerNpcDefinition = defineNpc({
  id: "inferno-jal-imkot",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "meleer",
      position: actor.position,
    }),
  onDeathStarted: ({ actor: actor }) => {
    if (actor.state.dig !== null) {
      clearNpcTargetableFromTick(actor);
    }
    actor.state.dig = null;
  },
  move: ({ actor: actor, context: context }) => {
    if (!canNpcActAtTick(actor, context.tick)) {
      return [];
    }
    const wasDugDown = actor.state.dig !== null;
    advanceMeleerDig(actor, context);
    if (
      wasDugDown ||
      actor.state.dig !== null ||
      context.tick < actor.state.walkFromTick
    ) {
      return [];
    } else {
      return getNpcPursuitMoves(actor, context);
    }
  },
  tick: ({ actor: actor, context: context }) => {
    const noAttack = {
      environmentalDamages: [],
    };
    if (!canNpcActAtTick(actor, context.tick) || actor.state.dig !== null) {
      return noAttack;
    }
    if (
      context.tick < actor.state.firstActionTick ||
      !isCombatActionDue(actor.combat, context.tick)
    ) {
      return noAttack;
    }
    const target = resolveMonsterTarget(actor, context.world);
    if (!target || !canNpcAttackWithPlan(actor, target, meleerAttackPlan)) {
      return noAttack;
    }
    const npcAttack = rollNpcAttack({
      attacker: actor,
      target: target,
      plan: meleerAttackPlan,
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
      kind: "meleer_melee",
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
export { meleerNpcDefinition };
