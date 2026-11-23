// The shockwave colossus: three tiles wide, a mage with a reach of 15 tiles
// that claps every five ticks. It has few hitpoints and hits the hardest of
// the monsters that attack from afar. It is in waves 7, 8 and 11.
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick, getProjectileSourcePosition, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { colosseumMonsters, shockwaveProjectileSpotAnimId, shockwaveImpactSpotAnimId } from "./constants.js";
import { canWaveMonsterAttack, getStepsToPlayer, moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

const shockwavePlan = {
  formulaStyle: "magic",
  damageType: "magic",
  attackKind: "magic_fire",
  maxHit: 56, // WIKI, and SIM (a spell of 42 with 35 % magic damage)
  sourceDeathPolicy: "persist", // SIM
};
// SIM, "as observed by testing at each range": the hit lands
// floor((2 x steps + 4) / 7) + 2 ticks after the clap, the steps counted
// between the nearest tiles of the two. OBS agrees at 3, 4 and 5 steps.
const getShockwaveImpactDelayTicks = (steps) => Math.floor((2 * steps + 4) / 7) + 2;
// OBS, 14 claps at 3 to 5 steps: the projectile leaves 50 client cycles
// after the clap and flies 26 + 8 cycles a step (58, 66, 74); its slope,
// its start offset and its heights. It arrives before the hit lands.
const shockwaveFlight = { startDelayCycles: 50, slope: 0, startOffset: 40, startHeight: 158, endHeight: 100 };
const getShockwaveFlightCycles = (steps) => 26 + 8 * steps;
// OBS: the effect on the player as the projectile arrives, 64 high, came
// with 10 of the 14 claps; the 4 without were prayed against and hit 0, as
// were most of the 10. Inferred, as for the shaman: it is drawn for a clap
// whose accuracy roll succeeds.
const impactGraphicHeight = 64;

export const shockwaveNpcDefinition = defineNpc({
  id: "colosseum-shockwave-colossus",
  move: moveWaveMonster,
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!canWaveMonsterAttack(actor, player, context.tick)) {
      return idle;
    }
    const steps = getStepsToPlayer(actor, player);
    const impactDelayTicks = getShockwaveImpactDelayTicks(steps);
    const npcAttack = rollWaveMonsterAttack(actor, player, { ...shockwavePlan, impactDelayTicks }, context, config);
    const endDelayCycles = shockwaveFlight.startDelayCycles + getShockwaveFlightCycles(steps);
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "colosseum_shockwave_clap",
      accurate: npcAttack.accuracySucceeded,
      impactDelayTicks,
      projectiles: [{ ...shockwaveFlight, spotAnimId: shockwaveProjectileSpotAnimId, endDelayCycles, sourcePosition: getProjectileSourcePosition(actor), target: buildActorVisualTarget(player) }],
    });
    if (npcAttack.accuracySucceeded) {
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        projectiles: [],
        graphics: [{ spotAnimId: shockwaveImpactSpotAnimId, target: buildActorVisualTarget(player), height: impactGraphicHeight, delayCycles: endDelayCycles }],
      });
    }
    scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.shockwave.attackSpeed);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});
