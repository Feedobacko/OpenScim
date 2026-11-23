var yamaNpcTypeId = 14176;
var voidFlareNpcTypeId = 14179;
// Yama covers 5 x 5 tiles; an actor's position is its south-west tile.
var yamaSize = 5;
function getYamaAttackKind(style) {
  if (style === "melee") {
    return "melee_crush";
  } else if (style === "range") {
    return "range_shadow";
  } else {
    return "magic_fire";
  }
}
function mixSeed(seed, salt) {
  return (Math.imul(seed, 2654435761) + Math.imul(salt, 340573321)) >>> 0;
}
var voidFlareSpawnTiles = [
  [26, 25],
  [23, 33],
  [35, 25],
  [38, 33],
];
var yamaDefeatOverheadTexts = [
  "Fair is fair.",
  "Your reward, as agreed.",
  "A satisfying warmup. Collect your loot and let us continue.",
  "A passing performance.",
];
var yamaPlayerStartMin = [29, 35];
var yamaPlayerStartMax = [33, 39];
export { yamaNpcTypeId, voidFlareNpcTypeId, yamaSize, getYamaAttackKind, mixSeed, voidFlareSpawnTiles, yamaDefeatOverheadTexts, yamaPlayerStartMin, yamaPlayerStartMax };
