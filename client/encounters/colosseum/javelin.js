// The javelin colossus: three tiles wide, it throws javelins at the player
// from up to 15 tiles away, every five ticks. Every fifth attack is a javelin
// thrown high into the air instead, which comes down on the tile the player
// stood on when it was thrown. It is in waves 2, 3, 5 to 8, 10 and 11.
import { defineNpc } from "../shared/npcDefinitions.js";
import { scheduleNextActionTick, getProjectileSourcePosition, buildActorVisualTarget } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { colosseumMonsters, javelinProjectileSpotAnimId, highJavelinSpotAnimIds } from "./constants.js";
import { canWaveMonsterAttack, moveWaveMonster, rollWaveMonsterAttack } from "./waveMonster.js";

const javelinPlan = {
  formulaStyle: "ranged",
  damageType: "range",
  attackKind: "range_arrow",
  maxHit: 48, // WIKI; the formula gives the same from TABLE's stats
  impactDelayTicks: 3, // OBS at 3 to 9 tiles, and SIM: the same at every distance
  sourceDeathPolicy: "persist", // SIM: a javelin in flight lands though the colossus has died
};
// OBS: the javelin leaves 58 client cycles after the throw and arrives at
// 90, at every distance; its slope, its start offset and its heights.
const javelinFlight = { startDelayCycles: 58, endDelayCycles: 90, slope: 16, startOffset: 0, startHeight: 200, endHeight: 138 };
// WIKI and OBS: every fifth attack is the javelin thrown high.
const attacksPerHighJavelin = 5;
// OBS: its blast is drawn 6 ticks after the throw, on the tile the player
// stood on when it was thrown (he had not moved by the third tick after,
// when the falling javelin is first drawn there: which of the two ticks
// settles the tile is not told apart). A player one tile off took nothing.
// WIKI: it "ignores prayer". Its damage was not seen: up to 40 is the wiki's
// strategy page as the first session's data sheet has it, and the least it
// deals is inferred.
const highJavelinLandingTicks = 6;
/** What the damage of a javelin thrown high names as its source. */
export const highJavelinSource = "Javelin Colossus";
const highJavelinDamage = [0, 40];
// OBS: the effect on the colossus starts 60 client cycles after the throw,
// the shadow and the falling javelin on the tile at 120, the blast at 180.
const highJavelinGraphicCycles = { launch: 60, falling: 120, blast: 180 };

export const javelinNpcDefinition = defineNpc({
  id: "colosseum-javelin-colossus",
  move: moveWaveMonster,
  // `config.throwHigh({ tile, landTick })` hands the encounter a javelin in the air.
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    const player = context.world.getPlayer();
    if (!canWaveMonsterAttack(actor, player, context.tick)) {
      return idle;
    }
    actor.state.attacks += 1;
    scheduleNextActionTick(actor.combat, context.tick, colosseumMonsters.javelin.attackSpeed);
    if (actor.state.attacks % attacksPerHighJavelin === 0) {
      const tile = [player.position[0], player.position[1]];
      config.throwHigh({ tile, landTick: context.tick + highJavelinLandingTicks });
      emitInfernoNpcAttack(context, { actor, target: player, clipId: "throwHigh", kind: "colosseum_javelin_high", impactDelayTicks: highJavelinLandingTicks });
      const onTile = { kind: "tile", position: tile };
      emitInfernoVisual(context.tickEvents, {
        animations: [],
        projectiles: [],
        graphics: [
          { spotAnimId: highJavelinSpotAnimIds.launch, target: buildActorVisualTarget(actor), height: 0, delayCycles: highJavelinGraphicCycles.launch },
          { spotAnimId: highJavelinSpotAnimIds.shadow, target: onTile, height: 0, delayCycles: highJavelinGraphicCycles.falling },
          { spotAnimId: highJavelinSpotAnimIds.falling, target: onTile, height: 0, delayCycles: highJavelinGraphicCycles.falling },
          { spotAnimId: highJavelinSpotAnimIds.blast, target: onTile, height: 0, delayCycles: highJavelinGraphicCycles.blast },
        ],
      });
      return idle;
    }
    const npcAttack = rollWaveMonsterAttack(actor, player, javelinPlan, context, config);
    emitInfernoNpcAttack(context, {
      actor,
      target: player,
      clipId: "attack",
      kind: "colosseum_javelin_throw",
      accurate: npcAttack.accuracySucceeded,
      impactDelayTicks: javelinPlan.impactDelayTicks,
      projectiles: [{ ...javelinFlight, spotAnimId: javelinProjectileSpotAnimId, sourcePosition: getProjectileSourcePosition(actor), target: buildActorVisualTarget(player) }],
    });
    return { environmentalDamages: [], npcAttacks: [npcAttack] };
  },
});

/** The state of a javelin colossus that has not attacked yet. */
export const createJavelinState = () => ({ attacks: 0 });

// For the encounter's resolveHazards: the javelins that come down this tick
// hurt the player if he stands where they land. Returns the javelins still in
// the air, the tiles the others came down on and the damage to apply.
export function landHighJavelins(javelins, context) {
  const [playerX, playerY] = context.playerPos;
  return {
    inTheAir: javelins.filter((javelin) => javelin.landTick > context.tick),
    landedTiles: javelins.filter((javelin) => javelin.landTick <= context.tick).map((javelin) => javelin.tile),
    damages: javelins
      .filter((javelin) => javelin.landTick <= context.tick && javelin.tile[0] === playerX && javelin.tile[1] === playerY)
      .map(() => ({ baseDamage: highJavelinDamage, attackType: "typeless", source: highJavelinSource, playerPosition: [playerX, playerY] })),
  };
}
