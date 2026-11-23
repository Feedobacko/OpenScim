import { faceActorToward } from "../shared/npcHelpers.js";
function copyTilePosition(position) {
  return [position[0], position[1]];
}
// Not Zuk's alone, despite the name: the monsters of the waves and Jad attack
// through this too (emitInfernoNpcAttack below). The same goes for emitZukHit
// and emitZukDeath in monsterHelpers.js; Zuk himself never emits "zuk_death".
// The event types "zuk_attack", "zuk_hit", "zuk_death" and "zuk_jad_cue" are
// what the scene knows, and the functions are named after them.
function emitZukAttack(context, event) {
  context.tickEvents.emit({
    type: "zuk_attack",
    ...event,
    sourcePosition: copyTilePosition(event.sourcePosition),
    targetPosition: copyTilePosition(event.targetPosition),
  });
}
function emitInfernoVisual(tickEvents, visual) {
  tickEvents.emit({
    type: "inferno_visual",
    ...structuredClone(visual),
  });
}
function isOutsideZukShieldCoverage(shieldX, playerPosition) {
  const [playerX, playerY] = playerPosition;
  return playerY < 44 || playerX < shieldX - 1 || playerX > shieldX + 3;
}
function emitInfernoNpcAttack(context, attack) {
  const { actor: actor, target: target, projectiles: projectiles = [] } = attack;
  faceActorToward(actor, target);
  emitInfernoVisual(context.tickEvents, {
    animations: [
      {
        actorId: actor.id,
        clipId: attack.clipId,
        delayCycles: 0,
      },
    ],
    projectiles: projectiles,
    graphics: [],
  });
  const projectileArrivalCycles = projectiles[0]?.endDelayCycles;
  emitZukAttack(context, {
    attack: attack.kind,
    sourceId: actor.id,
    targetId: target.id,
    sourcePosition: actor.position,
    targetPosition: target.position,
    launchTick: context.tick,
    impactTick: context.tick + attack.impactDelayTicks,
    // Whether the attack's accuracy roll succeeded, for an attack that says
    // so: the game sends some sounds with those that did (colosseum/audio.js).
    ...(attack.accurate === undefined ? {} : { accurate: attack.accurate }),
    ...(projectileArrivalCycles === undefined
      ? {}
      : {
          projectileArrivalCycles: projectileArrivalCycles,
        }),
  });
}
export {
  copyTilePosition,
  emitZukAttack,
  emitInfernoVisual,
  isOutsideZukShieldCoverage,
  emitInfernoNpcAttack,
};
