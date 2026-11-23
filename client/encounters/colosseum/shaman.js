// The serpent shaman: a mage of one tile that casts at the player from up to
// ten tiles away, every five ticks. It is in waves 1 to 6, and among the
// reinforcements of waves 4 to 6, 10 and 11.
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick, getProjectileSourcePosition, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { colosseumMonsters, shamanSpotAnimIds } from "./constants.js";
import { canWaveMonsterAttack, getStepsToPlayer, moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

// OBS, the spell as the game sent it at 1, 2, 4, 5, 8 and 9 tiles: the
// projectile leaves 67 client cycles after the cast and flies 4 cycles a
// tile, 13 at the least; its slope, its start offset and its heights. (SIM
// had it leave after 20 cycles.)
const shamanProjectile = { startDelayCycles: 67, cyclesPerTile: 4, leastFlightCycles: 13, slope: 14, startOffset: 32, startHeight: 172, endHeight: 146 };
// OBS: the heights of the two effects, on the shaman and on the player.
const castGraphicHeight = 92;
const impactGraphicHeight = 124;
// OBS: the hit lands 3 ticks after the cast at 1, 2, 4, 5 and 8 tiles and 4
// ticks after it at 9. That the tiles between follow their neighbours, and
// 10 follows 9, is inferred. (SIM: floor((1 + tiles) / 3), one to three
// ticks sooner.)
const getShamanImpactDelayTicks = (steps) => (steps >= 9 ? 4 : 3);
const shamanPlan = {
  formulaStyle: "magic",
  damageType: "magic",
  attackKind: "magic_fire",
  // WIKI, and SIM (a spell of 25 with 15 % magic damage). The wiki's strategy
  // page says 27.
  maxHit: 28,
  // SIM: a hit that was cast lands though the caster has died since.
  sourceDeathPolicy: "persist",
};

export const shamanNpcDefinition = defineNpc({
  id: "colosseum-serpent-shaman",
  move: moveWaveMonster,
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!canWaveMonsterAttack(actor, player, context.tick)) {
      return idle;
    }
    const steps = getStepsToPlayer(actor, player);
    const impactDelayTicks = getShamanImpactDelayTicks(steps);
    const npcAttack = rollWaveMonsterAttack(actor, player, { ...shamanPlan, impactDelayTicks }, context, config);
    const { startDelayCycles, cyclesPerTile, leastFlightCycles, ...flight } = shamanProjectile;
    const endDelayCycles = startDelayCycles + Math.max(leastFlightCycles, cyclesPerTile * steps);
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "colosseum_shaman_spell",
      accurate: npcAttack.accuracySucceeded,
      impactDelayTicks,
      projectiles: [{ ...flight, spotAnimId: shamanSpotAnimIds.projectile, startDelayCycles, endDelayCycles, sourcePosition: getProjectileSourcePosition(actor), target: buildActorVisualTarget(player) }],
    });
    emitInfernoVisual(context.tickEvents, {
      animations: [],
      projectiles: [],
      graphics: [
        { spotAnimId: shamanSpotAnimIds.cast, target: buildActorVisualTarget(actor), height: castGraphicHeight, delayCycles: 0 },
        // OBS, 64 casts: the effect on the player came with 50 and not with
        // 14, all 14 prayed against and hitting 0; the two casts that were
        // not prayed against had it and hurt. Inferred: it is drawn for a
        // cast whose accuracy roll succeeds, prayed against or not.
        ...(npcAttack.accuracySucceeded ? [{ spotAnimId: shamanSpotAnimIds.impact, target: buildActorVisualTarget(player), height: impactGraphicHeight, delayCycles: endDelayCycles }] : []),
      ],
    });
    scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.shaman.attackSpeed);
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});
