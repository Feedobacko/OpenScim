// The jaguar warrior: two tiles wide, it walks up to the player and claws
// every five ticks, three hits at once. It comes as a reinforcement in waves
// 1 to 6.
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack } from "../inferno/events.js";
import { colosseumMonsters } from "./constants.js";
import { canWaveMonsterAttack, moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

const clawPlan = {
  formulaStyle: "melee_slash",
  damageType: "melee",
  attackKind: "melee_slash",
  maxHit: 47, // WIKI and SIM: each of the three hits
  impactDelayTicks: 0, // SIM: melee lands on the tick of the attack
  sourceDeathPolicy: "persist",
};
// WIKI and SIM: one attack is three hits, each with an accuracy roll and a
// damage roll of its own.
const clawHitCount = 3;

export const jaguarNpcDefinition = defineNpc({
  id: "colosseum-jaguar-warrior",
  move: moveWaveMonster,
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!canWaveMonsterAttack(actor, player, context.tick)) {
      return idle;
    }
    const npcAttacks = Array.from({ length: clawHitCount }, (unusedElement, hitIndex) => {
      const npcAttack = rollWaveMonsterAttack(actor, player, clawPlan, context, config);
      // The engine announces an attack once: the second and third hit continue the first.
      return hitIndex === 0 ? npcAttack : { ...npcAttack, isContinuation: true };
    });
    emitInfernoNpcAttack(context, { actor, target: player, clipId: "attack", kind: "colosseum_jaguar_claws", impactDelayTicks: 0 });
    scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.jaguar.attackSpeed);
    return { environmentalDamages: [], npcAttacks };
  },
});
