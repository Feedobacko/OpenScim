// The Colosseum's monsters in the sandbox (client/encounters/sandbox/): their
// catalog entries, in the format sandbox/catalog.js describes. Each says how
// the sandbox's one NPC behaviour fights with the monster; the Colosseum's
// own fight never reads this file.
import {
  colosseumMonsters,
  shamanSpotAnimIds,
  javelinProjectileSpotAnimId,
  manticoreOrbSpotAnimIds,
  manticoreOrbImpactSpotAnimIds,
  shockwaveProjectileSpotAnimId,
  highJavelinSpotAnimIds,
} from "./constants.js";

// shockwave.js: leaves after 50 cycles, 26 and 8 a tile more.
const shockwaveProjectile = { spotAnimId: shockwaveProjectileSpotAnimId, timing: { delay: 50, lengthAdjustment: 26, stepMultiplier: 8, progress: 40 }, slope: 0, startHeight: 158, endHeight: 100 };
// The manticore's charge and volley, as manticore.js makes them (its numbers
// and their sources are there): the order of its three orbs chosen once,
// ranged and magic in either order and melee last (WIKI, SIM); a charge of
// 10 ticks (its attack speed), the charge animation when 6 are left and an
// orb held over it when 5, 4 and 3 are left, 300, 400 and 500 high, drawn
// every second tick (OBS, CACHE); then one orb a tick, flying 30 cycles to
// 50 high with slope 127, the first with a start offset of 50 (OBS), its
// hitsplat a tick after it leaves (OBS, SIM), and its impact drawn 100 high
// on a target that does not pray against it (OBS). The most each hits for:
// WIKI. The sandbox's brawler.js plays it (chargedVolley); the
// Colosseum's modifiers (Mantimayhem) and the copying of another
// manticore's order are its fight's only.
const manticoreOrbMaxHits = { range: 36, magic: 31, melee: 31 };
const manticoreChargedVolley = {
  orders: [["range", "magic", "melee"], ["magic", "range", "melee"]],
  orbs: Object.fromEntries(["range", "magic", "melee"].map((style) => [style, {
    style,
    maxHit: manticoreOrbMaxHits[style],
    spotAnimId: manticoreOrbSpotAnimIds[style],
    impactSpotAnimId: manticoreOrbImpactSpotAnimIds[style],
  }])),
  heights: [300, 400, 500],
  startOffsets: [50, 0, 0],
  flight: { startDelayCycles: 0, endDelayCycles: 30, slope: 127, endHeight: 50 },
  impactDelayTicks: 1,
  impactHeight: 100,
  chargeClip: "charge",
  chargeClipTicksLeft: 6,
  firstOrbShownTicksLeft: 5,
  heldOrbGraphicTicks: 2,
};
// shaman.js (OBS: leaves after 67 cycles, lands 3 ticks after the cast) and
// javelin.js (OBS: 58 to 90 cycles, lands after 3 ticks).
const shamanFlight = { spotAnimId: shamanSpotAnimIds.projectile, startDelayCycles: 67, endDelayCycles: 90, slope: 14, startOffset: 32, startHeight: 172, endHeight: 146 };
const javelinFlight = { spotAnimId: javelinProjectileSpotAnimId, startDelayCycles: 58, endDelayCycles: 90, slope: 16, startOffset: 0, startHeight: 200, endHeight: 138 };

// javelin.js: every fifth attack is a javelin thrown high, which comes down
// 6 ticks later on the tile its target stood on when it was thrown (OBS);
// it ignores prayer (WIKI) and deals 0 to 40 (WIKI's strategy page; the
// least inferred). Its effects: on the colossus at 60 cycles, the shadow and
// the falling javelin on the tile at 120, the blast at 180 (OBS). A sandbox
// `special` (sandbox/brawler.js starts it, sandbox/encounter.js lands it).
const highJavelinDamage = [0, 40];
export const javelinHighThrow = {
  id: "colosseum.javelin_high",
  spotAnimIds: Object.values(highJavelinSpotAnimIds),
  start({ target }) {
    const tile = [target.position[0], target.position[1]];
    return {
      clipId: "throwHigh",
      landsInTicks: 6,
      data: { tile },
      holdTicks: 0,
      nextActionTicks: colosseumMonsters.javelin.attackSpeed,
      graphics: [
        { spotAnimId: highJavelinSpotAnimIds.launch, on: "self", height: 0, delayCycles: 60 },
        { spotAnimId: highJavelinSpotAnimIds.shadow, tile, height: 0, delayCycles: 120 },
        { spotAnimId: highJavelinSpotAnimIds.falling, tile, height: 0, delayCycles: 120 },
        { spotAnimId: highJavelinSpotAnimIds.blast, tile, height: 0, delayCycles: 180 },
      ],
    };
  },
  land({ data, target, targetAlive, random }) {
    const [x, y] = data.tile;
    const size = target?.size ?? 1;
    const struck = target && targetAlive && x >= target.position[0] && x < target.position[0] + size && y >= target.position[1] && y < target.position[1] + size;
    if (!struck) return { stomps: [], damage: null };
    const [least, most] = highJavelinDamage;
    return { stomps: [], damage: least + Math.floor(random() * (most - least + 1)) };
  },
};

// minotaur.js: while its target is not beside it, it heals instead, on its
// attack timer, a monster below 75 % of its hitpoints whose centre is in
// sight of its own and no more than 7 tiles away (WIKI), to full; the
// healed one draws spot animation 444 128 high (OBS, CACHE: tzhaar_heal).
// In the sandbox it heals the monsters of its own side only.
const minotaurHeal = { belowFraction: 0.75, range: 7, clip: "heal", graphic: { spotAnimId: 444, height: 128 } };

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
  // javelin.js: its javelin, and every fifth attack one thrown high (javelinHighThrow).
  {
    ...monster("javelin", { clip: "attack", maxHit: 48, flight: javelinFlight }),
    attacks: [
      { style: "range", range: colosseumMonsters.javelin.attackRange, clip: "attack", maxHit: 48, flight: javelinFlight },
      { style: "range", range: colosseumMonsters.javelin.attackRange, clip: "throwHigh", special: javelinHighThrow, everyNth: 5 },
    ],
  },
  // manticore.js: it charges, shows its three orbs in the order it will
  // throw them, and throws them one a tick (manticoreChargedVolley above).
  monster("manticore", { clip: "throw", chargedVolley: manticoreChargedVolley }),
  monster("shockwave", { clip: "attack", projectile: shockwaveProjectile }),
  // minotaur.js: its smash (WIKI: up to 74, a tick after the swing), and its heal.
  { ...monster("minotaur", { clip: "attack", maxHit: 74, impactDelayTicks: 1 }), heal: minotaurHeal },
];
