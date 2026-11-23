import { defineNpc } from "../shared/npcDefinitions.js";
import { infernoRangerVariants, createInfernoActor } from "./actors.js";
import { emitZukDeath, emitZukHit } from "./monsterHelpers.js";
import { rangerProjectileTiming, processMagerRangerTick, getMagerRangerMoves, initializeMagerRangerActor } from "./mager.js";
var rangerAttackChoices = [
  {
    attack: "ranger_melee",
    weight: 1,
    plan: {
      formulaStyle: "melee_crush",
      damageType: "melee",
      attackKind: "melee_crush",
      impactDelayTicks: 0,
      sourceDeathPolicy: "cancel-before-impact",
    },
  },
  {
    attack: "ranger_range",
    weight: 1,
    plan: {
      formulaStyle: "ranged",
      damageType: "range",
      attackKind: "range_arrow",
      impactDelayTicks: 0,
      projectile: rangerProjectileTiming,
      sourceDeathPolicy: "persist",
    },
  },
];
var rangerNpcDefinition = defineNpc({
  id: "inferno-jal-xil",
  deathPolicy: "queued",
  onDamageResolved: emitZukHit,
  onDeathAnimation: ({ actor: actor, context: context }) =>
    emitZukDeath(context, {
      actorId: actor.id,
      npcKind: "ranger",
      position: actor.position,
    }),
  move: getMagerRangerMoves,
  tick: (hook) => processMagerRangerTick(hook, rangerAttackChoices),
});
function createRanger(spawn) {
  const variantProfile = infernoRangerVariants[spawn.variant];
  const baseActor = initializeMagerRangerActor(
    createInfernoActor(
      {
        kind: "ranger",
        variant: spawn.variant,
      },
      spawn.id,
      spawn.position,
    ),
    spawn,
  );
  baseActor.combat.attackSpeed = variantProfile.attackSpeed;
  baseActor.combat.attackRange = variantProfile.attackRange;
  baseActor.combat.attackStyle = "range";
  return rangerNpcDefinition.createActor(baseActor, {
    firstActionTick: spawn.spawnTick + spawn.initialDelayTicks,
  });
}
export { rangerNpcDefinition, createRanger };
