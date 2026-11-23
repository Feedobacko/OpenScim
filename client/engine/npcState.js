import { isTileInsideFootprint } from "./attackRange.js";
function isNpcBoundAtTick(npc, tick) {
  const { boundFromTick: boundFromTick, boundUntilTick: boundUntilTick } =
    npc.debuffs ?? {};
  return (
    boundUntilTick !== undefined &&
    tick >= (boundFromTick ?? 0) &&
    tick < boundUntilTick
  );
}
function isNpcBindImmuneAtTick(npc, tick) {
  const boundUntilTick = npc.debuffs?.boundUntilTick;
  return boundUntilTick !== undefined && tick < boundUntilTick + 5;
}
function isNpcTargetableAtTick(npc, tick) {
  return (
    npc.untargetable !== true &&
    (npc.targetableFromTick === undefined || tick >= npc.targetableFromTick)
  );
}
function canNpcShowHealthBarAtTick(npc, tick) {
  return npc.healthBarWhenUntargetable === true || isNpcTargetableAtTick(npc, tick);
}
function isNpcAttackableAtTick(npc, tick) {
  return (
    !!isNpcTargetableAtTick(npc, tick) &&
    (npc.attackBlockedUntilTick === undefined || tick >= npc.attackBlockedUntilTick)
  );
}
function setNpcDefenceDrain(npc, defenceDrain) {
  npc.debuffs ??= {};
  const defenceDrainFloor = npc.defenceDrainFloor;
  npc.debuffs.defenceDrain =
    defenceDrainFloor === undefined
      ? defenceDrain
      : Math.min(
          defenceDrain,
          Math.max(
            0,
            (npc.formulaStats?.levels.defence ?? 1) - defenceDrainFloor,
          ),
        );
}
function clearNpcBurn(actor) {
  actor.burnStacks = [];
  actor.burnNextPulseTick = undefined;
}
function clearNpcPoison(actor) {
  actor.poison = undefined;
}
function getNpcDeathPolicy(npc) {
  return npc.deathPolicy ?? "immediate";
}
function isActorInWorld(world, actor) {
  return world.actors.get(actor.id) === actor;
}
function canNpcActAtTick(npc, tick) {
  if (npc.alive) {
    return true;
  }
  const death = npc.death;
  return (
    death !== undefined &&
    death.status === "pending" &&
    tick < death.processTick
  );
}
function isActorAlive(actor) {
  return actor.alive && (actor.kind !== "npc" || actor.death === undefined);
}
function isActorAliveOrDeathPending(actor) {
  return isActorAlive(actor) || (actor.kind === "npc" && actor.death?.status === "pending");
}
function isNpcAlive(npc) {
  return npc.alive && npc.death === undefined;
}
function canNpcBeHealed(npc) {
  return isNpcAlive(npc);
}
function getActorLifeGeneration(actor) {
  if (actor.kind === "npc") {
    return actor.lifeGeneration ?? 0;
  } else {
    return 0;
  }
}
function recordNpcDeath(npc, killTick, causeStage) {
  if (npc.death !== undefined) {
    throw new Error(`NPC '${npc.id}' already has a death record for this life`);
  }
  const death = {
    status: "pending",
    killTick: killTick,
    processTick: getNpcDeathPolicy(npc) === "queued" && causeStage !== "scripted" ? killTick + 1 : killTick,
    causeStage: causeStage,
  };
  npc.death = death;
  npc.alive = false;
  delete npc.deathAnimationTick;
  clearNpcBurn(npc);
  clearNpcPoison(npc);
  updateNpcDeathAnimationTick(npc);
  return death;
}
function expediteQueuedNpcDeath(npc, tick) {
  const death = npc.death;
  if (
    death?.status === "pending" &&
    death.causeStage === "hit-queue" &&
    death.killTick === tick
  ) {
    if (!(death.processTick <= tick)) {
      death.processTick = tick;
      updateNpcDeathAnimationTick(npc);
    }
  }
}
function isNpcDeathAnimationDueAtTick(npc, tick) {
  return (
    npc.death?.status === "started" &&
    npc.death.animationNotified !== true &&
    getNpcDeathPolicy(npc) === "queued" &&
    npc.deathAnimationTick !== undefined &&
    npc.deathAnimationTick <= tick
  );
}
function markNpcDeathAnimationNotified(npc, tick) {
  const death = npc.death;
  if (death === undefined || !isNpcDeathAnimationDueAtTick(npc, tick)) {
    return false;
  }
  death.animationNotified = true;
  return true;
}
function isNpcDeathAnimationTick(npc, tick) {
  return (
    npc.death?.status === "started" &&
    npc.death.causeStage !== "scripted" &&
    npc.deathAnimationTick === tick
  );
}
function isNpcDeathDueAtTick(npc, tick) {
  return npc.death?.status === "pending" && npc.death.processTick <= tick;
}
function markNpcDeathStarted(npc) {
  const death = npc.death;
  if (death?.status === "pending") {
    death.status = "started";
    if (npc.combat.retaliation) {
      npc.combat.retaliation.pending = [];
      npc.combat.retaliation.lastIncomingAttackTick = null;
    }
    updateNpcDeathAnimationTick(npc);
  }
}
function recordNpcStepTick(npc, tick) {
  npc.lastStepTick = tick;
  updateNpcDeathAnimationTick(npc);
}
function updateNpcDeathAnimationTick(npc) {
  const death = npc.death;
  if (death !== undefined && getNpcDeathPolicy(npc) === "queued") {
    if (death.causeStage === "scripted") {
      npc.deathAnimationTick = death.processTick;
    } else {
      const processTick = death.processTick;
      const lastStepTick = npc.lastStepTick;
      npc.deathAnimationTick = lastStepTick === undefined ? processTick : Math.max(processTick, lastStepTick + 3);
    }
  }
}
function startScriptedNpcDeath(npc, tick) {
  if (npc.death === undefined) {
    recordNpcDeath(npc, tick, "scripted");
  }
  npc.despawnTick ??= tick;
  markNpcDeathStarted(npc);
}
function reviveNpc(npc) {
  if (npc.death !== undefined && npc.despawnTick === npc.death.killTick) {
    npc.despawnTick = undefined;
  }
  npc.alive = true;
  delete npc.death;
  delete npc.deathAnimationTick;
  npc.lifeGeneration = getActorLifeGeneration(npc) + 1;
}
function getNpcDespawnTick(npc) {
  const despawnTick = npc.despawnTick;
  if (
    despawnTick === undefined ||
    npc.death === undefined ||
    getNpcDeathPolicy(npc) !== "queued"
  ) {
    return despawnTick;
  } else {
    return Math.max(despawnTick, npc.deathAnimationTick ?? despawnTick);
  }
}
function isNpcHeldInPlace(npc, player, tick) {
  return (
    isNpcBoundAtTick(npc, tick) ||
    (player !== null &&
      npc.movesWithAttackerUnder !== true &&
      player.attackTarget === npc.id &&
      player.attackInteractionActive &&
      isTileInsideFootprint(player.position, npc.position, npc.size))
  );
}
function scheduleNpcHitpointRegen(npc, tick) {
  npc.hitpointRegenNextTick = tick + 1 + 100;
}
function applyNpcHitpointRegen(npc, tick) {
  if (
    npc.hitpointRegenNextTick !== undefined &&
    !!canNpcBeHealed(npc) &&
    !(tick < npc.hitpointRegenNextTick)
  ) {
    npc.hitpointRegenNextTick += 100;
    if (npc.vitals.hp > 0 && npc.vitals.hp < npc.vitals.maxHp) {
      npc.vitals.hp++;
    }
  }
}
export {
  isNpcBoundAtTick,
  isNpcBindImmuneAtTick,
  isNpcTargetableAtTick,
  canNpcShowHealthBarAtTick,
  isNpcAttackableAtTick,
  setNpcDefenceDrain,
  clearNpcBurn,
  clearNpcPoison,
  isActorInWorld,
  canNpcActAtTick,
  isActorAlive,
  isActorAliveOrDeathPending,
  isNpcAlive,
  canNpcBeHealed,
  getActorLifeGeneration,
  recordNpcDeath,
  expediteQueuedNpcDeath,
  isNpcDeathAnimationDueAtTick,
  markNpcDeathAnimationNotified,
  isNpcDeathAnimationTick,
  isNpcDeathDueAtTick,
  markNpcDeathStarted,
  recordNpcStepTick,
  startScriptedNpcDeath,
  reviveNpc,
  getNpcDespawnTick,
  isNpcHeldInPlace,
  scheduleNpcHitpointRegen,
  applyNpcHitpointRegen,
};
