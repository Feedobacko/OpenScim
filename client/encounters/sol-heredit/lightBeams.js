import { defineNpc } from "../shared/npcDefinitions.js";
import { beamCooldownTickRange, relentlessMaxHitBonuses, colosseumSpotAnimIds } from "./constants.js";
import { isSolEnragePhase } from "./phases.js";
var beamGraphicsByDirection = {
  south: {
    charge: colosseumSpotAnimIds.crystalCharge[0],
    fire: colosseumSpotAnimIds.crystalFire[0],
    dx: 0,
    dy: -1,
  },
  west: {
    charge: colosseumSpotAnimIds.crystalCharge[1],
    fire: colosseumSpotAnimIds.crystalFire[1],
    dx: -1,
    dy: 0,
  },
  north: {
    charge: colosseumSpotAnimIds.crystalCharge[2],
    fire: colosseumSpotAnimIds.crystalFire[2],
    dx: 0,
    dy: 1,
  },
  east: {
    charge: colosseumSpotAnimIds.crystalCharge[3],
    fire: colosseumSpotAnimIds.crystalFire[3],
    dx: 1,
    dy: 0,
  },
};
function buildLightBeamGraphics(direction, tiles, stage) {
  const beamVisual = beamGraphicsByDirection[direction];
  const graphics = tiles.map(([x, y], index) => ({
    spotAnimId: beamVisual[stage],
    position: [x, y],
    delayCycles: (index + 1) * 3,
    height: 128,
  }));
  const lastTile = tiles.at(-1);
  if (stage === "fire" && lastTile) {
    graphics.push({
      spotAnimId: colosseumSpotAnimIds.crystalImpact,
      position: [lastTile[0] + beamVisual.dx, lastTile[1] + beamVisual.dy],
      delayCycles: tiles.length * 3,
      height: 128,
    });
  }
  return graphics;
}
var beamCrystalEdges = [
  {
    edge: "north",
    fixed: 41,
    from: 27,
    to: 38,
    step: [0, -1],
    direction: "south",
    spawn: 29,
  },
  {
    edge: "east",
    fixed: 39,
    from: 29,
    to: 40,
    step: [-1, 0],
    direction: "west",
    spawn: 31,
  },
  {
    edge: "south",
    fixed: 28,
    from: 27,
    to: 38,
    step: [0, 1],
    direction: "north",
    spawn: 28,
  },
  {
    edge: "west",
    fixed: 26,
    from: 29,
    to: 40,
    step: [1, 0],
    direction: "east",
    spawn: 31,
  },
];
var beamCrystalNpcDefinition = defineNpc({
  id: "colosseum-beam-crystal",
  move: ({ actor: actor, context: context }) => {
    const state = actor.state;
    if (!actor.alive || state.charging || context.tick < state.nextStepTick) {
      return [];
    }
    const crystalEdge = beamCrystalEdges[state.index];
    const currentAlong =
      crystalEdge.edge === "north" || crystalEdge.edge === "south"
        ? actor.position[0]
        : actor.position[1];
    // `state.direction` is the crystal's travel along its edge, +1 or -1. The
    // `direction` of an edge record is the compass direction its beam points in.
    let nextAlong = currentAlong + state.direction;
    if (nextAlong < crystalEdge.from || nextAlong > crystalEdge.to) {
      state.direction = state.direction === 1 ? -1 : 1;
      nextAlong = currentAlong + state.direction;
    }
    if (!state.firstStepTaken) {
      state.firstStepTaken = true;
      state.direction = 1;
    }
    state.nextStepTick = context.tick + 2;
    return [
      {
        npcId: actor.id,
        path: [getBeamCrystalEdgeTile(state.index, nextAlong)],
      },
    ];
  },
});
function getBeamCrystalEdgeTile(crystalIndex, along) {
  const crystalEdge = beamCrystalEdges[crystalIndex];
  if (crystalEdge.edge === "north" || crystalEdge.edge === "south") {
    return [along, crystalEdge.fixed];
  } else {
    return [crystalEdge.fixed, along];
  }
}
// A round of beams is prepared 3 ticks before its crystals start to charge.
var beamPrepareLeadTicks = 3;
function getBeamLineTiles(crystalIndex, crystalTile) {
  const crystalEdge = beamCrystalEdges[crystalIndex];
  return Array.from(
    {
      length: 13, // a beam is 13 tiles long, from the tile next to its crystal
    },
    (unusedElement, index) => [crystalTile[0] + crystalEdge.step[0] * (index + 1), crystalTile[1] + crystalEdge.step[1] * (index + 1)],
  );
}
function getBeamCrystalDirection(crystalIndex) {
  return beamCrystalEdges[crystalIndex].direction;
}
var LightBeamRuntime = class {
  round = null;
  prepared = null;
  readyTick = null;
  fired = null;
  hitTick = null;
  reset() {
    this.round = null;
    this.prepared = null;
    this.readyTick = null;
    this.fired = null;
    this.hitTick = null;
  }
  hasActiveRound() {
    return this.round !== null || this.prepared !== null;
  }
  getBeamTiles() {
    return this.round?.lines.flatMap((line) => [...line.tiles]) ?? [];
  }
  getFiredBeamTiles(tick) {
    if (this.fired?.tick === tick) {
      return this.fired.round.lines.flatMap((line) => [...line.tiles]);
    } else {
      return [];
    }
  }
  ensureReadyTick(tick) {
    this.readyTick ??= tick;
  }
  isReady(crystals, tick) {
    return (
      crystals.length > 0 &&
      !this.hasActiveRound() &&
      this.readyTick !== null &&
      tick >= this.readyTick
    );
  }
  markCrystalsCharging(crystals) {
    for (const crystal of crystals) {
      crystal.state.charging = true;
    }
  }
  prepare(crystals, tick, enraged) {
    if (!this.isReady(crystals, tick)) {
      return null;
    }
    const chargeTicks = enraged ? 3 : 4;
    this.prepared = {
      chargeTick: tick + beamPrepareLeadTicks,
      chargeTicks: chargeTicks,
    };
    this.readyTick = null;
    this.markCrystalsCharging(crystals);
    return beamPrepareLeadTicks + chargeTicks;
  }
  startRoundCharge(crystals, tick) {
    const prepared = this.prepared;
    if (crystals.length === 0 || prepared === null || tick < prepared.chargeTick) {
      return null;
    } else {
      this.round = {
        chargeTick: tick,
        fireTick: tick + prepared.chargeTicks,
        // A charge of 3 ticks is the enraged round (see prepare).
        resumeAfterFireTicks: prepared.chargeTicks === 3 ? 2 : 3,
        lines: crystals.map((crystal) => ({
          actorId: crystal.id,
          index: crystal.state.index,
          tiles: getBeamLineTiles(crystal.state.index, crystal.position),
        })),
      };
      this.markCrystalsCharging(crystals);
      this.prepared = null;
      return this.round;
    }
  }
  cancelActiveRound(crystals) {
    const fireTick = this.round?.fireTick ?? null;
    if (this.round !== null) {
      this.readyTick = this.round.fireTick;
    } else if (this.prepared !== null) {
      this.readyTick = this.prepared.chargeTick - beamPrepareLeadTicks;
    }
    this.round = null;
    this.prepared = null;
    this.fired = null;
    this.hitTick = null;
    for (const crystal of crystals) {
      crystal.state.charging = false;
      if (fireTick !== null) {
        crystal.state.nextStepTick = fireTick;
      }
    }
  }
  capReadyTick(tick) {
    if (!this.hasActiveRound() && this.readyTick !== null) {
      this.readyTick = Math.min(this.readyTick, tick);
    }
  }
  fireRound(crystals, tickInfo) {
    const round = this.round;
    if (round === null || tickInfo.tick !== round.fireTick) {
      return null;
    }
    this.round = null;
    this.fired = {
      tick: tickInfo.tick,
      round: round,
    };
    this.readyTick = tickInfo.tick + this.rollCooldownTicks(tickInfo.phase, tickInfo.random);
    for (const crystal of crystals) {
      crystal.state.charging = false;
      crystal.state.nextStepTick = tickInfo.tick + round.resumeAfterFireTicks;
    }
    if (
      round.lines.some((line) =>
        line.tiles.some(([x, y]) => x === tickInfo.playerPos[0] && y === tickInfo.playerPos[1]),
      )
    ) {
      this.hitTick = tickInfo.tick + 1;
    }
    return {
      round: round,
    };
  }
  resolveBeamHit(tick, playerPos, damageOptions) {
    if (this.hitTick === null || tick < this.hitTick) {
      return [];
    }
    this.hitTick = null;
    const maxHit = 75 + relentlessMaxHitBonuses[damageOptions.relentless];
    const rollDamage = () => 40 + Math.floor(damageOptions.random() * (maxHit - 40 + 1));
    return [
      {
        baseDamage: Math.max(rollDamage(), rollDamage()),
        attackType: "typeless",
        source: "SolLightBeam",
        playerPosition: [...playerPos],
      },
    ];
  }
  rollCooldownTicks(phase, random) {
    const cooldownRoll = random();
    if (isSolEnragePhase(phase)) {
      return 5;
    }
    const [minCooldownTicks, maxCooldownTicks] = beamCooldownTickRange;
    return minCooldownTicks + Math.floor(cooldownRoll * (maxCooldownTicks - minCooldownTicks + 1));
  }
};
export { buildLightBeamGraphics, beamCrystalEdges, beamCrystalNpcDefinition, getBeamCrystalEdgeTile, getBeamCrystalDirection, LightBeamRuntime };
