var zukNpcTypeId = 7706;
var zukMagerNpcTypeId = 7703;
var zukRangerNpcTypeId = 7702;
var zukJadNpcTypeId = 7704;
var zukJadHealerNpcTypeId = 7705;
var zukHealerNpcTypeId = 7708;
var infernoNpcTypeIds = {
  nibbler: 7691,
  bat: 7692,
  blob: 7693,
  blob_mage: 7694,
  blob_range: 7695,
  blob_melee: 7696,
  meleer: 7697,
  ranger: 7698,
  mager: 7699,
  jad: 7700,
  jad_healer: 7701,
  pillar: 7709,
  pillarCollapse: 7710,
};
var infernoArenaBounds = {
  minX: 17,
  maxX: 45,
  minY: 17,
  maxY: 46,
};
var infernoMapSquare = {
  x: 35,
  y: 83,
};
var infernoMapSquareOffsets = [
  {
    dx: 0,
    dy: 0,
  },
  {
    dx: 0,
    dy: 1,
  },
  {
    dx: 1,
    dy: 0,
  },
  {
    dx: 0,
    dy: -1,
  },
  {
    dx: -1,
    dy: 0,
  },
];
var zukPlayerStart = [31, 44];
var zukIntroStartTickOffset = -12;
var zukIntroTeleportTickOffset = -10;
var zukIntroSpawnTickOffset = -8;
var zukGlyphIntroMoveStartTickOffset = -6;
var zukGlyphIntroMoveEndTickOffset = -4;
var zukRiseClipId = "rise";
var zukCavernShakeMessage = "A great power is starting to shake the cavern...";
var tzhaarKetKehName = "Tzhaar-Ket-Keh";
var zukPrisonBreakingMessage =
  "No! TzKal-Zuk's prison is breaking down. There's nothing I can do for you now, JalYt!";
var zukGlyphIntroPosition = [30, 51];
var infernoExcludedStaticLocIds = new Set([30338]);
var infernoEncounterKind = "inferno";
var infernoPlayerStart = [30, 32];
var infernoDefaultStartTile = [34, 44];
var infernoWaveMessageColor = "#ef1020";
var infernoSpawnTiles = [
  [18, 41],
  [20, 35],
  [18, 18],
  [22, 23],
  [32, 18],
  [40, 21],
  [33, 29],
  [40, 34],
  [39, 41],
];
var nibblerSpawnMinX = 25;
var nibblerSpawnMaxX = 27;
var nibblerSpawnMinY = 33;
var nibblerSpawnMaxY = 35;
var infernoJadSpawnTile = [25, 35];
var infernoTripleJadSpawnTiles = [
  [34, 34],
  [25, 35],
  [28, 23],
];
var jadHealerSpawnDistanceRange = {
  min: 4,
  max: 8,
};
export {
  zukNpcTypeId,
  zukMagerNpcTypeId,
  zukRangerNpcTypeId,
  zukJadNpcTypeId,
  zukJadHealerNpcTypeId,
  zukHealerNpcTypeId,
  infernoNpcTypeIds,
  infernoArenaBounds,
  infernoMapSquare,
  infernoMapSquareOffsets,
  zukPlayerStart,
  zukIntroStartTickOffset,
  zukIntroTeleportTickOffset,
  zukIntroSpawnTickOffset,
  zukGlyphIntroMoveStartTickOffset,
  zukGlyphIntroMoveEndTickOffset,
  zukRiseClipId,
  zukCavernShakeMessage,
  tzhaarKetKehName,
  zukPrisonBreakingMessage,
  zukGlyphIntroPosition,
  infernoExcludedStaticLocIds,
  infernoEncounterKind,
  infernoPlayerStart,
  infernoDefaultStartTile,
  infernoWaveMessageColor,
  infernoSpawnTiles,
  nibblerSpawnMinX,
  nibblerSpawnMaxX,
  nibblerSpawnMinY,
  nibblerSpawnMaxY,
  infernoJadSpawnTile,
  infernoTripleJadSpawnTiles,
  jadHealerSpawnDistanceRange,
};
