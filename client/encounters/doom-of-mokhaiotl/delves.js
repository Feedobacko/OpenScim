// What the delve changes, and the game's ids. Sources: the wiki ("Doom of
// Mokhaiotl" and its strategy guide) and, where the wiki is silent or
// garbled, the timings of live captures written up by the TSPS project
// (github.com/RSPSApp/tsps, docs/doom-of-mokhaiotl.md, BSD-2), checked
// against the wiki where both speak. A number from neither is marked a guess.
import { monsterByNpcTypeIdAndVersion } from "../../data/monsters.js";

export const npcTypeIds = {
  doom: 14707,
  larva: 14710,
  rangedLarva: 14711,
  magicLarva: 14712,
  meleeLarva: 14713,
  volatileEarth: 14714,
  earthenShield: 14715,
};
export const locIds = { acid: 57283, rock: 57286 };

export const seqIds = {
  idle: 12405, orb: 12406, rockThrow: 12407,
  beamCharge: 12408, beamLoop: 12409, beamCancel: 12410, beamFire: 12411,
  areaCharge: 12412, areaLoop: 12413, areaSlam: 12414, areaReturn: 12415,
  tongue: 12416, emerge: 12418, despawn: 12422,
  earthIdle: 12431, earthSpawn: 12432, earthDeath: 12433, earthPop: 12434,
  shieldIdle: 12435, shieldSpawn: 12436, shieldDeath: 12437,
  larvaCrawl: 12456, larvaSpawn: 12458, larvaDeath: 12459,
};

export const spotAnims = {
  orb: { melee: 3378, magic: 3379, range: 3380 },
  // The burst of an orb that lands unprayed (captured: VFX_LEVIATHAN_01_PROJECTILE_IMPACT_*, at height 100).
  orbImpact: { melee: 2491, magic: 2492, range: 2490 },
  emerge: 3372,
  rockLaunch: { range: 3384, magic: 3385 },
  rockSplit: { range: 3386, magic: 3387 },
  debris: [3388, 3389, 3390, 3391, 3392, 3393, 3394, 3395],
  debrisShadow: 2380,
  debrisImpact: 3404,
  areaSlam: 3370,
  floorSlam: [3405, 3406, 3407],
  beamHead: 3409, beamMiddle: 3410, beamEnd: 3411, beamCharge: 3412, beamImpact: 3413,
  larvaSpawn: 3417, larvaBlast: 3374, larvaImpact: 3426,
  acidBlob: 3445, acidSplat: [3429, 3430, 3431, 3432],
  despawn: 3377,
  holyWater: 192, holyWaterShadow: 1446, holyWaterSplash: 68,
};

// The room's floor (local tiles of map square 20,149).
export const floor = { minX: 19, maxX: 43, minY: 23, maxY: 49 };
export const bossStart = [29, 35];
export const bossSize = 5;

// Captured: the 39 tiles volatile earth comes up on.
export const earthPool = [
  [21, 47], [22, 29], [22, 34], [22, 45], [23, 40], [24, 37], [25, 32], [25, 43], [25, 47], [26, 28],
  [27, 35], [27, 39], [28, 45], [29, 31], [29, 38], [29, 42], [29, 49], [30, 27], [31, 40], [31, 47],
  [32, 32], [32, 44], [33, 29], [33, 37], [34, 35], [35, 27], [35, 41], [36, 33], [36, 38], [36, 44],
  [38, 29], [38, 36], [39, 32], [39, 42], [39, 48], [40, 35], [40, 38], [40, 45], [40, 49],
];

// Orbs fly from cycle 55 to this one, whatever the distance (captured to delve 5).
const orbEndCycles = [205, 205, 175, 175, 145, 115, 115, 115];
// Pieces a thrown rock bursts into, the player's tile one of them (captured to delve 5; then a guess).
const rockPieces = [8, 12, 15, 17, 18, 19, 20, 21];

export function delveRules(delve) {
  const stats = monsterByNpcTypeIdAndVersion.get(`${npcTypeIds.doom}:Delve ${delve}`);
  return {
    delve,
    hitpoints: stats.levels.hitpoints,
    attackSpeed: stats.attackSpeed,
    // The wiki's infobox gives 47 and 65; the captures fill in the rest.
    orbMaxHit: [47, 50, 50, 50, 53, 53, 57, 65][delve - 1],
    orbStyles: delve >= 2 ? ["range", "magic", "melee"] : ["range", "magic"],
    orbEndCycles: orbEndCycles[delve - 1],
    rocks: delve >= 8 ? 2 : 1,
    rockPieces: rockPieces[delve - 1],
    rockOrbs: delve >= 4 ? 3 : delve >= 2 ? 2 : 1,
    rockBurstTicks: delve >= 5 ? 6 : 7,
    // Cycle the rock's first orb lands, after leaving the debris: captured at
    // delves 1 (90) and 2 (150); the wiki has them 2 ticks after the debris from 7.
    rockOrbFirstCycles: delve >= 7 ? 60 : delve === 2 ? 150 : 90,
    beamMaxHit: delve >= 6 ? 99 : delve >= 4 ? 80 : 60,
    punishDelayTicks: delve >= 7 ? 6 : delve >= 3 ? 7 : 8,
    shockwaves: [1, 1, 2, 2, 3, 3, 4, 5][delve - 1],
    // The earthen shield steps every 2 ticks at delves 1-2 ("half speed"), then every tick.
    earthenShieldStepTicks: delve >= 3 ? 1 : 2,
    // One attack in three drops a larva at delve 1, one in six deeper (captured).
    larvaChance: delve === 1 ? 0.3 : 0.15,
    acid: delve >= 3,
    acidExtraBlobs: delve >= 8 ? 3 : delve >= 4 ? 2 : 1,
    demonicShield: delve >= 3,
  };
}

export const tongueMaxHit = 40;
export const debrisMaxHit = 21;
export const larvaBlastMaxHit = 21;
export const shockwaveDamage = [26, 42]; // wiki 30-42; 26-33 captured
export const acidDamage = [3, 7];
