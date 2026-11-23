var solArenaBounds = {
  minX: 26,
  maxX: 39,
  minY: 28,
  maxY: 41,
};
var solBasePosition = [31, 36];
var solPlayerStart = [33, 31];
var solMapSquare = {
  x: 28,
  y: 48,
};
var enrageSandDelayTickRange = [6, 8];
var solBeamPreparedEventType = "sol_beam_prepared";
var beamCooldownTickRange = [22, 29];
var quartetSpawnTiles = [
  [34, 37],
  [30, 36],
  [31, 35],
  [35, 36],
  [31, 32],
];
var solarflareRouteCorners = [
  [
    [34, 36],
    [34, 40],
    [38, 40],
    [38, 36],
  ],
  [
    [34, 33],
    [38, 33],
    [38, 29],
    [34, 29],
  ],
  [
    [31, 36],
    [27, 36],
    [27, 40],
    [31, 40],
  ],
  [
    [31, 33],
    [31, 29],
    [27, 29],
    [27, 33],
  ],
];
var solHereditNpcTypeId = 12821;
var tripleShortHitTickOffsets = [3, 6, 9];
var tripleLongHitTickOffsets = [3, 6, 10];
var tripleShortHitDamages = [15, 25, 35];
var tripleLongHitDamages = [15, 30, 45];
// An undefended grapple is resolved 4 ticks after it starts. A click on the
// right slot up to that tick defends it, and it is then resolved on the tick
// of the click; a click on that very tick is a perfect parry.
var grappleWindowTicks = 4;
var relentlessMaxHitBonuses = [0, 1, 3, 6];
var relentlessDefenceBypassPercents = [0, 33, 66, 100];
var healingTotemNpcTypeId = 12825;
var warbandArcherNpcTypeId = 12814;
var warbandSeerNpcTypeId = 12815;
var warbandBerserkerNpcTypeId = 12816;
var solHereditActorId = "sol_heredit";
var solHereditName = "Sol Heredit";
var colosseumSeqIds = {
  sol: {
    idle: 10874,
    walk: 10878,
    arenaJump: 10876,
    arenaLand: 10877,
    spearTelegraph: 10883,
    shieldTelegraph: 10885,
    grappleTelegraph: 10884,
    tripleShort: 10887,
    tripleLong: 10886,
    death: 10888,
  },
  crystal: {
    spawn: 10798,
    idle: 10799,
    despawn: 10800,
    charge: 10801,
    attack: 10802,
  },
  solarflare: {
    idle: 10817,
  },
  bees: {
    spawn: 10821,
    idle: 10822,
    attack: 10823,
    despawn: 10824,
  },
  totem: {
    idle: 10827,
    attack: 10828,
  },
  warband: {
    spawn: 10861,
    archer: {
      idle: 808,
      attack: 10850,
      defend: 10851,
      death: 10852,
    },
    seer: {
      idle: 813,
      attack: 10853,
      defend: 10854,
      death: 10855,
    },
    berserker: {
      idle: 808,
      attack: 10856,
      defend: 10857,
      death: 10858,
    },
  },
};
var colosseumSpotAnimIds = {
  solMelee: [2669, 2670, 2671],
  solLand: 2666,
  solDeath: 2680,
  tripleTelegraphShort: 2668,
  tripleTelegraphLong: 2667,
  crystalCharge: [2689, 2690, 2691, 2692],
  crystalFire: [2693, 2694, 2695, 2696],
  crystalImpact: 2697,
  sunfireLightning: 2698,
  finalBossExplosion: 2724,
  fireblastImpact: 131,
  warbandArrow: 9,
  warbandFireblast: 130,
  totemProjectile: 2687,
  totemImpact: 2688,
};
var totemProjectileFlight = {
  spotAnimId: colosseumSpotAnimIds.totemProjectile,
  startDelayCycles: 90,
  endDelayCycles: 180,
  slope: 0,
  startOffset: 0,
  startHeight: 220,
  endHeight: 138,
};
var warbandProjectileFlights = {
  archer: {
    spotAnimId: colosseumSpotAnimIds.warbandArrow,
    startDelayCycles: 10,
    endDelayCycles: 30,
    slope: 15,
    startOffset: 64,
    startHeight: 163,
    endHeight: 146,
  },
  seer: {
    spotAnimId: colosseumSpotAnimIds.warbandFireblast,
    startDelayCycles: 10,
    endDelayCycles: 30,
    slope: 16,
    startOffset: 64,
    startHeight: 172,
    endHeight: 124,
  },
};
// Animations, graphics and projectiles for the scene, as one event. A
// `clipId` names an animation of the actor; the scene (in
// client/assets/rendering.js) holds the clips.
function emitColosseumVisual(tickEvents, visual) {
  if (
    visual.animations.length !== 0 ||
    visual.graphics.length !== 0 ||
    (visual.projectiles?.length ?? 0) !== 0
  ) {
    tickEvents.emit({
      type: "colosseum_visual",
      ...structuredClone(visual),
    });
  }
}
var solMessageColors = {
  red: "#ff3045",
  green: "#229628",
};
function isSolArenaTile(tile, bounds) {
  const [x, y] = tile;
  if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
    return false;
  }
  const onEastWestEdge = x === bounds.minX || x === bounds.maxX;
  const onNorthSouthEdge = y === bounds.minY || y === bounds.maxY;
  return !onEastWestEdge || !onNorthSouthEdge;
}
export {
  grappleWindowTicks,
  solArenaBounds,
  solBasePosition,
  solPlayerStart,
  solMapSquare,
  enrageSandDelayTickRange,
  solBeamPreparedEventType,
  beamCooldownTickRange,
  quartetSpawnTiles,
  solarflareRouteCorners,
  solHereditNpcTypeId,
  tripleShortHitTickOffsets,
  tripleLongHitTickOffsets,
  tripleShortHitDamages,
  tripleLongHitDamages,
  relentlessMaxHitBonuses,
  relentlessDefenceBypassPercents,
  healingTotemNpcTypeId,
  warbandArcherNpcTypeId,
  warbandSeerNpcTypeId,
  warbandBerserkerNpcTypeId,
  solHereditActorId,
  solHereditName,
  colosseumSeqIds,
  colosseumSpotAnimIds,
  totemProjectileFlight,
  warbandProjectileFlights,
  emitColosseumVisual,
  solMessageColors,
  isSolArenaTile,
};
