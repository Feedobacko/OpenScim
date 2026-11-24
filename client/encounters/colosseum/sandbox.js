// The Colosseum's monsters in the sandbox (client/encounters/sandbox/): their
// catalog entries, in the format sandbox/catalog.js describes. Each says how
// the sandbox's one NPC behaviour fights with the monster; the Colosseum's
// own fight never reads this file.
import {
  colosseumMonsters,
  shamanSpotAnimIds,
  javelinProjectileSpotAnimId,
  manticoreOrbSpotAnimIds,
  shockwaveProjectileSpotAnimId,
} from "./constants.js";

// shockwave.js: leaves after 50 cycles, 26 and 8 a tile more.
const shockwaveProjectile = { spotAnimId: shockwaveProjectileSpotAnimId, timing: { delay: 50, lengthAdjustment: 26, stepMultiplier: 8, progress: 40 }, slope: 0, startHeight: 158, endHeight: 100 };
// manticore.js: an orb flies 30 cycles and lands a tick later.
const manticoreOrb = (spotAnimId) => ({ spotAnimId, startDelayCycles: 0, endDelayCycles: 30, slope: 127, startOffset: 0, startHeight: 400, endHeight: 50 });
// WIKI: the most each orb hits for.
const manticoreOrbMaxHits = { range: 36, magic: 31, melee: 31 };
const manticoreOrbPart = (style) => ({ style, maxHit: manticoreOrbMaxHits[style], flight: manticoreOrb(manticoreOrbSpotAnimIds[style]) });
// shaman.js (OBS: leaves after 67 cycles, lands 3 ticks after the cast) and
// javelin.js (OBS: 58 to 90 cycles, lands after 3 ticks).
const shamanFlight = { spotAnimId: shamanSpotAnimIds.projectile, startDelayCycles: 67, endDelayCycles: 90, slope: 14, startOffset: 32, startHeight: 172, endHeight: 146 };
const javelinFlight = { spotAnimId: javelinProjectileSpotAnimId, startDelayCycles: 58, endDelayCycles: 90, slope: 16, startOffset: 0, startHeight: 200, endHeight: 138 };

const monster = (key, attack) => {
  const entry = colosseumMonsters[key];
  return {
    id: `colosseum.${key}`,
    name: entry.name,
    group: "Fortis Colosseum",
    npcTypeId: entry.npcTypeId,
    size: entry.size,
    attackSpeed: entry.attackSpeed,
    attacks: [{ style: entry.attackStyle, range: entry.attackRange, ...attack }],
    idleSeqId: entry.idleSeqId,
    deathSeqId: entry.deathSeqId,
    clips: entry.clips,
  };
};

// The waves of the Colosseum: constants.js, one module each.
export const colosseumSandboxEntries = [
  monster("shaman", { clip: "attack", maxHit: 28, flight: shamanFlight }), // shaman.js
  // jaguar.js: three claws at once, each rolled on its own, up to 47 each (WIKI, SIM).
  monster("jaguar", { clip: "attack", hits: 3, maxHit: 47 }),
  monster("javelin", { clip: "attack", maxHit: 48, flight: javelinFlight }), // javelin.js
  // manticore.js: a volley of three orbs, one a tick, ranged and magic in
  // either order and melee last, each with its hitsplat a tick after it
  // leaves; a volley every 10 ticks (its charge is not drawn here).
  {
    ...monster("manticore", { clip: "throw" }),
    attacks: [
      { style: "range", range: 15, clip: "throw", volley: [manticoreOrbPart("range"), manticoreOrbPart("magic"), manticoreOrbPart("melee")] },
      { style: "magic", range: 15, clip: "throw", volley: [manticoreOrbPart("magic"), manticoreOrbPart("range"), manticoreOrbPart("melee")] },
    ],
  },
  monster("shockwave", { clip: "attack", projectile: shockwaveProjectile }),
  monster("minotaur", { clip: "attack" }),
];
