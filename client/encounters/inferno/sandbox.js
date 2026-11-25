// The Inferno's monsters in the sandbox (client/encounters/sandbox/): their
// catalog entries, in the format sandbox/catalog.js describes. Each says how
// the sandbox's one NPC behaviour fights with the monster; the Inferno's own
// fight never reads this file.
import { infernoNpcTypeIds } from "./constants.js";

// The Inferno's sequences: the table of its render config in
// client/assets/rendering.js (CACHE), as docs/ADDING-AN-ENCOUNTER.md,
// section 7, copies four of them.
const infernoSeqs = {
  nibbler: { idle: 7573, walk: 7572, attack: 7574, death: 7576 },
  bat: { idle: 7577, walk: 7577, attack: 7578, death: 7580 },
  blob: { idle: 7586, walk: 7587, magic: 7581, melee: 7582, range: 7583, death: 7584 },
  meleer: { idle: 7595, walk: 7596, attack: 7597, death: 7599 },
  ranger: { idle: 7602, walk: 7603, melee: 7604, range: 7605, death: 7606 },
  mager: { idle: 7609, walk: 7608, magic: 7610, melee: 7612, death: 7613 },
  jad: { idle: 7589, walk: 7588, magic: 7592, range: 7593, melee: 7590, death: 7594 },
  jadHealer: { idle: 2636, walk: 2634, attack: 2637, death: 2638 },
  zuk: { idle: 7564, attack: 7566, death: 7562 },
};
// jad.js: the magic projectile in three parts, on the timing of Jad's magic
// profile, and the range attack's graphic on the target's tile.
const jadMagicParts = {
  timing: { delay: 2, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 },
  spotAnims: [{ spotAnimId: 448, start: 2, end: 2 }, { spotAnimId: 449, start: 6, end: 6 }, { spotAnimId: 450, start: 10, end: 12 }],
  slope: 16, startOffset: 32, startHeight: 512, endHeight: 124,
};
// blob.js: the blob's two projectiles.
const blobProjectile = (spotAnimId, timing) => ({ spotAnimId, timing, slope: 16, startHeight: 160, endHeight: 124 });
// zuk.js: 16 cycles and 10 a tile.
const zukProjectile = { spotAnimId: 1375, timing: { delay: 16, lengthAdjustment: 0, stepMultiplier: 10, progress: 128 }, slope: 0, startHeight: 390, endHeight: 124 };
// bat.js, mager.js (the mager's and the ranger's timings).
const batProjectile = { spotAnimId: 1382, timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 128 }, slope: 16, startHeight: 200, endHeight: 124 };
const magerProjectile = { spotAnimId: 1376, timing: { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }, slope: 0, startHeight: 400, endHeight: 124 };
const rangerProjectile = { spotAnimId: 1377, timing: { delay: 60, lengthAdjustment: -14, stepMultiplier: 8, progress: 0 }, slope: 16, startHeight: 256, endHeight: 124 };

// actors.js, waveMonsters.js and each monster's module.
export const infernoSandboxEntries = [
  {
    id: "inferno.nibbler", name: "Jal-Nib (nibbler)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.nibbler, size: 1, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 4 }], // nibbler.js: 0 to 4
    idleSeqId: infernoSeqs.nibbler.idle, walkSeqId: infernoSeqs.nibbler.walk, deathSeqId: infernoSeqs.nibbler.death, clips: { attack: infernoSeqs.nibbler.attack },
  },
  {
    id: "inferno.bat", name: "Jal-MejRah (bat)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.bat, size: 2, attackSpeed: 3,
    attacks: [{ style: "range", range: 4, clip: "attack", maxHit: 19, projectile: batProjectile }], // bat.js; range inferred
    idleSeqId: infernoSeqs.bat.idle, walkSeqId: infernoSeqs.bat.walk, deathSeqId: infernoSeqs.bat.death, clips: { attack: infernoSeqs.bat.attack },
  },
  {
    id: "inferno.blob", name: "Jal-Ak (blob)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.blob, size: 3, attackSpeed: 6,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "range", range: 15, clip: "range", projectile: blobProjectile(1378, { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 32 }) },
      { style: "magic", range: 15, clip: "magic", projectile: blobProjectile(1380, { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }) },
    ],
    idleSeqId: infernoSeqs.blob.idle, walkSeqId: infernoSeqs.blob.walk, deathSeqId: infernoSeqs.blob.death,
    clips: { melee: infernoSeqs.blob.melee, range: infernoSeqs.blob.range, magic: infernoSeqs.blob.magic },
  },
  {
    id: "inferno.meleer", name: "Jal-ImKot (meleer)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.meleer, size: 4, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack" }],
    idleSeqId: infernoSeqs.meleer.idle, walkSeqId: infernoSeqs.meleer.walk, deathSeqId: infernoSeqs.meleer.death, clips: { attack: infernoSeqs.meleer.attack },
  },
  {
    id: "inferno.ranger", name: "Jal-Xil (ranger)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.ranger, size: 3, attackSpeed: 4,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "range", range: 15, clip: "range", projectile: rangerProjectile }, // actors.js: range 15
    ],
    idleSeqId: infernoSeqs.ranger.idle, walkSeqId: infernoSeqs.ranger.walk, deathSeqId: infernoSeqs.ranger.death,
    clips: { melee: infernoSeqs.ranger.melee, range: infernoSeqs.ranger.range },
  },
  {
    id: "inferno.mager", name: "Jal-Zek (mager)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.mager, size: 4, attackSpeed: 4,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "magic", range: 15, clip: "magic", projectile: magerProjectile },
    ],
    idleSeqId: infernoSeqs.mager.idle, walkSeqId: infernoSeqs.mager.walk, deathSeqId: infernoSeqs.mager.death,
    clips: { melee: infernoSeqs.mager.melee, magic: infernoSeqs.mager.magic },
  },
  {
    id: "inferno.jad", name: "JalTok-Jad", group: "Bosses", npcTypeId: infernoNpcTypeIds.jad, size: 5, attackSpeed: 8, // WIKI
    // jad.js: three ticks from the animation to the release; max hit 113.
    attacks: [
      { style: "melee", range: 1, clip: "melee", maxHit: 113 },
      { style: "range", range: 50, clip: "range", maxHit: 113, windupTicks: 3, impactDelayTicks: 2, targetGraphic: { spotAnimId: 451, height: 92 } },
      { style: "magic", range: 50, clip: "magic", maxHit: 113, windupTicks: 3, parts: jadMagicParts },
    ],
    idleSeqId: infernoSeqs.jad.idle, walkSeqId: infernoSeqs.jad.walk, deathSeqId: infernoSeqs.jad.death,
    clips: { melee: infernoSeqs.jad.melee, range: infernoSeqs.jad.range, magic: infernoSeqs.jad.magic },
  },
  {
    id: "inferno.jad_healer", name: "Yt-HurKot (healer)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.jad_healer, size: 1, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack" }],
    idleSeqId: infernoSeqs.jadHealer.idle, walkSeqId: infernoSeqs.jadHealer.walk, deathSeqId: infernoSeqs.jadHealer.death, clips: { attack: infernoSeqs.jadHealer.attack },
  },
  // zuk.js. He does not move in his fight, nor in the sandbox.
  {
    id: "inferno.zuk", name: "TzKal-Zuk", group: "Bosses", npcTypeId: 7706, size: 7, attackSpeed: 10, immobile: true, // inferred from zukSetClock.js
    attacks: [{ style: "magic", range: 64, clip: "attack", projectile: zukProjectile }],
    idleSeqId: infernoSeqs.zuk.idle, deathSeqId: infernoSeqs.zuk.death, clips: { attack: infernoSeqs.zuk.attack },
  },
];
