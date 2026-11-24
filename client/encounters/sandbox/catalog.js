// The NPCs a sandbox scenario can place: monsters whose models and
// sequences the trimmed game cache already holds, because another encounter
// draws them. Hitpoints and combat stats come from the monster table
// (TABLE, client/data/monsters.js) by NPC type id; what an entry says here
// is how the sandbox's one NPC behaviour (brawler.js) fights with it.
//
// Every entry:
//   id            the name a scenario file uses ("inferno.meleer"); never
//                 change one, scenarios that were shared name it
//   name, group   what the editor lists
//   npcTypeId     CACHE, and the key into TABLE
//   size          CACHE, TABLE
//   attackSpeed   ticks between attacks
//   attacks       one or more { style, range, clip, maxHit?, windupTicks?,
//                 projectile?, flight?, parts?, targetGraphic? }: `style` is
//                 "melee", "range" or "magic"; of the attacks that reach, one
//                 is drawn at random. `projectile` is a timed projectile
//                 ({ spotAnimId, timing, slope, startHeight, endHeight }: the
//                 hit lands when it arrives), `flight` one of fixed cycles
//                 (the hit lands on the tick it ends), `parts` a projectile
//                 of several spot animations on one timing (Jad's magic),
//                 `targetGraphic` a spot animation on the target's tile;
//                 `windupTicks` delays all of it and the hit (Jad's three)
//   immobile      true: never moves (TzKal-Zuk)
//   idleSeqId, walkSeqId?, deathSeqId, clips   the sequences the scene loads
//
// The sources of each number are named where the number is copied from:
// the encounter modules cited for each group. Where an encounter's own
// monster does something the sandbox does not (Jad's prayer switch, the
// manticore's charge, the healers), the entry is the plain version, and its
// speed or reach is "inferred" from the original.
import { infernoNpcTypeIds } from "../inferno/constants.js";
import { colosseumMonsters, shamanSpotAnimIds, javelinProjectileSpotAnimId } from "../colosseum/constants.js";
import {
  colosseumSeqIds,
  warbandProjectileFlights,
  warbandArcherNpcTypeId,
  warbandSeerNpcTypeId,
  warbandBerserkerNpcTypeId,
  solHereditNpcTypeId,
} from "../sol-heredit/constants.js";
import { ids as vardorvisIds, seqs as vardorvisSeqs } from "../vardorvis/encounter.js";
import { npcTypeIds as doomNpcTypeIds, seqIds as doomSeqIds, spotAnims as doomSpotAnims } from "../doom-of-mokhaiotl/delves.js";
import { yamaNpcTypeId } from "../yama/constants.js";

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
// inferno/jad.js: the magic projectile in three parts, on the timing of
// Jad's magic profile, and the range attack's graphic on the target's tile.
const jadMagicParts = {
  timing: { delay: 2, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 },
  spotAnims: [{ spotAnimId: 448, start: 2, end: 2 }, { spotAnimId: 449, start: 6, end: 6 }, { spotAnimId: 450, start: 10, end: 12 }],
  slope: 16, startOffset: 32, startHeight: 512, endHeight: 124,
};
// inferno/zuk.js: 16 cycles and 10 a tile.
const zukProjectile = { spotAnimId: 1375, timing: { delay: 16, lengthAdjustment: 0, stepMultiplier: 10, progress: 128 }, slope: 0, startHeight: 390, endHeight: 124 };
// doom-of-mokhaiotl/encounter.js: an orb leaves after 55 cycles; it lands
// after four ticks (inferred: the Doom's own lands by the distance).
const doomOrb = (spotAnimId) => ({ spotAnimId, startDelayCycles: 55, endDelayCycles: 120, slope: 30, startOffset: 0, startHeight: 200, endHeight: 100 });
// inferno/bat.js, inferno/mager.js (the mager's and the ranger's timings).
const batProjectile = { spotAnimId: 1382, timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 128 }, slope: 16, startHeight: 200, endHeight: 124 };
const magerProjectile = { spotAnimId: 1376, timing: { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 }, slope: 0, startHeight: 400, endHeight: 124 };
const rangerProjectile = { spotAnimId: 1377, timing: { delay: 60, lengthAdjustment: -14, stepMultiplier: 8, progress: 0 }, slope: 16, startHeight: 256, endHeight: 124 };
// colosseum/shaman.js (OBS: leaves after 67 cycles, lands 3 ticks after the
// cast) and colosseum/javelin.js (OBS: 58 to 90 cycles, lands after 3 ticks).
const shamanFlight = { spotAnimId: shamanSpotAnimIds.projectile, startDelayCycles: 67, endDelayCycles: 90, slope: 14, startOffset: 32, startHeight: 172, endHeight: 146 };
const javelinFlight = { spotAnimId: javelinProjectileSpotAnimId, startDelayCycles: 58, endDelayCycles: 90, slope: 16, startOffset: 0, startHeight: 200, endHeight: 138 };

const colosseum = (key, attack) => {
  const monster = colosseumMonsters[key];
  return {
    id: `colosseum.${key}`,
    name: monster.name,
    group: "Fortis Colosseum",
    npcTypeId: monster.npcTypeId,
    size: monster.size,
    attackSpeed: monster.attackSpeed,
    attacks: [{ style: monster.attackStyle, range: monster.attackRange, ...attack }],
    idleSeqId: monster.idleSeqId,
    deathSeqId: monster.deathSeqId,
    clips: monster.clips,
  };
};
const warband = (key, npcTypeId, style, range, flight) => ({
  id: `warband.${key}`,
  name: `Fremennik ${key}`,
  group: "Fortis Colosseum",
  npcTypeId,
  size: 1, // CACHE, TABLE
  attackSpeed: 4, // inferred: sol-heredit/minions.js
  attacks: [{ style, range, clip: "attack", ...(flight ? { flight } : {}) }],
  idleSeqId: colosseumSeqIds.warband[key].idle,
  deathSeqId: colosseumSeqIds.warband[key].death,
  clips: { attack: colosseumSeqIds.warband[key].attack },
});

export const sandboxNpcCatalog = [
  // The Inferno: inferno/actors.js, waveMonsters.js and each monster's module.
  {
    id: "inferno.nibbler", name: "Jal-Nib (nibbler)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.nibbler, size: 1, attackSpeed: 4,
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 4 }], // inferno/nibbler.js: 0 to 4
    idleSeqId: infernoSeqs.nibbler.idle, walkSeqId: infernoSeqs.nibbler.walk, deathSeqId: infernoSeqs.nibbler.death, clips: { attack: infernoSeqs.nibbler.attack },
  },
  {
    id: "inferno.bat", name: "Jal-MejRah (bat)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.bat, size: 2, attackSpeed: 3,
    attacks: [{ style: "range", range: 4, clip: "attack", maxHit: 19, projectile: batProjectile }], // inferno/bat.js; range inferred
    idleSeqId: infernoSeqs.bat.idle, walkSeqId: infernoSeqs.bat.walk, deathSeqId: infernoSeqs.bat.death, clips: { attack: infernoSeqs.bat.attack },
  },
  {
    id: "inferno.blob", name: "Jal-Ak (blob)", group: "The Inferno", npcTypeId: infernoNpcTypeIds.blob, size: 3, attackSpeed: 6,
    attacks: [
      { style: "melee", range: 1, clip: "melee" },
      { style: "range", range: 15, clip: "range", impactDelayTicks: 2 }, // inferred
      { style: "magic", range: 15, clip: "magic", impactDelayTicks: 2 }, // inferred
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
      { style: "range", range: 15, clip: "range", projectile: rangerProjectile }, // inferno/actors.js: range 15
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
    // inferno/jad.js: three ticks from the animation to the release; max hit 113.
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
  // The waves of the Colosseum: colosseum/constants.js, one module each.
  colosseum("shaman", { clip: "attack", maxHit: 28, flight: shamanFlight }), // colosseum/shaman.js
  colosseum("jaguar", { clip: "attack" }),
  colosseum("javelin", { clip: "attack", maxHit: 48, flight: javelinFlight }), // colosseum/javelin.js
  { ...colosseum("manticore", { clip: "throw", impactDelayTicks: 3 }), attackSpeed: 5 }, // inferred: the plain throw, without the charge
  colosseum("shockwave", { clip: "attack", impactDelayTicks: 2 }), // inferred
  colosseum("minotaur", { clip: "attack" }),
  // Sol Heredit's warband: sol-heredit/constants.js.
  warband("berserker", warbandBerserkerNpcTypeId, "melee", 1),
  warband("archer", warbandArcherNpcTypeId, "range", 10, warbandProjectileFlights.archer),
  warband("seer", warbandSeerNpcTypeId, "magic", 10, warbandProjectileFlights.seer),
  {
    id: "sol_heredit", name: "Sol Heredit", group: "Bosses", npcTypeId: solHereditNpcTypeId, size: 5, attackSpeed: 7, // inferred
    attacks: [{ style: "melee", range: 1, clip: "attack" }],
    idleSeqId: colosseumSeqIds.sol.idle, walkSeqId: colosseumSeqIds.sol.walk, deathSeqId: colosseumSeqIds.sol.death,
    clips: { attack: colosseumSeqIds.sol.spearTelegraph },
  },
  // Vardorvis: vardorvis/encounter.js.
  {
    id: "vardorvis", name: "Vardorvis", group: "Bosses", npcTypeId: vardorvisIds.boss, size: 2, attackSpeed: 5, // WIKI
    attacks: [{ style: "melee", range: 1, clip: "attack", maxHit: 35 }], // inferred: TABLE gives him strength 0
    idleSeqId: vardorvisSeqs.idle, walkSeqId: vardorvisSeqs.walk, deathSeqId: vardorvisSeqs.death, clips: { attack: vardorvisSeqs.melee },
  },
  // The Doom of Mokhaiotl: doom-of-mokhaiotl/delves.js. His larvae are not in
  // TABLE, so they are left out.
  {
    id: "doom", name: "Doom of Mokhaiotl", group: "Bosses", npcTypeId: doomNpcTypeIds.doom, size: 5, attackSpeed: 6, // inferred
    attacks: [
      { style: "melee", range: 1, clip: "tongue" },
      { style: "magic", range: 20, clip: "orb", flight: doomOrb(doomSpotAnims.orb.magic) },
      { style: "range", range: 20, clip: "orb", flight: doomOrb(doomSpotAnims.orb.range) },
    ],
    idleSeqId: doomSeqIds.idle, deathSeqId: doomSeqIds.despawn, clips: { tongue: doomSeqIds.tongue, orb: doomSeqIds.orb },
  },
  // Yama: the NPC type's own stand and walk; attack and death sequences from
  // his render config in client/assets/rendering.js (CACHE). His own fight's
  // beats, fireballs and flares are the arena's host's (encounter.js).
  {
    id: "yama", name: "Yama", group: "Bosses", npcTypeId: yamaNpcTypeId, size: 5, attackSpeed: 7, // inferred: a beat
    attacks: [
      { style: "melee", range: 1, clip: "default" },
      { style: "magic", range: 15, clip: "secondary", windupTicks: 3, impactDelayTicks: 1 }, // yama/boss.js: a windup of 3
      { style: "range", range: 15, clip: "secondary", windupTicks: 3, impactDelayTicks: 1 },
    ],
    deathSeqId: 12161, clips: { default: 12144, secondary: 12146 },
  },
  // TzKal-Zuk: inferno/zuk.js. He does not move in his fight, nor here.
  {
    id: "inferno.zuk", name: "TzKal-Zuk", group: "Bosses", npcTypeId: 7706, size: 7, attackSpeed: 10, immobile: true, // inferred from zukSetClock.js
    attacks: [{ style: "magic", range: 64, clip: "attack", projectile: zukProjectile }],
    idleSeqId: infernoSeqs.zuk.idle, deathSeqId: infernoSeqs.zuk.death, clips: { attack: infernoSeqs.zuk.attack },
  },
];

const catalogById = new Map(sandboxNpcCatalog.map((entry) => [entry.id, entry]));
export const getSandboxNpcEntry = (id) => catalogById.get(id);

// What the scene loads for every entry (a render config's preloadNpcTypes).
export const sandboxPreloadNpcTypes = sandboxNpcCatalog.map((entry) => ({
  npcTypeId: entry.npcTypeId,
  ...(entry.idleSeqId === undefined ? {} : { idleSeqId: entry.idleSeqId }),
  ...(entry.walkSeqId === undefined ? {} : { walkSeqId: entry.walkSeqId }),
  attackClips: entry.clips,
  deathSeqId: entry.deathSeqId,
}));
export const sandboxSpotAnimIds = [
  ...new Set(
    sandboxNpcCatalog.flatMap((entry) =>
      entry.attacks.flatMap((attack) => [attack.projectile?.spotAnimId, attack.flight?.spotAnimId, attack.targetGraphic?.spotAnimId, ...(attack.parts?.spotAnims.map((part) => part.spotAnimId) ?? [])]).filter((id) => id !== undefined),
    ),
  ),
];
