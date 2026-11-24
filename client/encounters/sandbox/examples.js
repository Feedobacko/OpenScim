// The example scenarios the editor offers, each with the gear it is meant to
// be played with. Each is a scenario of the format of scenario.js, checked
// when the module loads (normalizeScenario throws on a mistake). Every
// footprint stands on walkable tiles of its arena, clear of the others and
// of the host boss's NPCs: test/test-sandbox-examples.mjs checks it.
//
// The first ten are the original set; the second ten are harder: the
// arena's real boss with its mechanics and company, full Inferno and
// Colosseum line-ups, teams in a free for all.
import { normalizeScenario } from "./scenario.js";

// Item ids (the game's object ids, as tools/determinism/scenarios/common.mjs has them).
const item = {
  twistedBow: 20997, dragonArrow: 11212, masoriMask: 27235, masoriBody: 27238, masoriChaps: 27241, zaryteVambraces: 26235,
  pegasianBoots: 13237, necklaceOfAnguish: 19547, avasAssembler: 22109, venatorRing: 28310, toxicBlowpipe: 12926,
  osmumtensFang: 26219, avernicDefender: 22322, torvaHelm: 26382, torvaBody: 26384, torvaLegs: 26386,
  infernalCape: 21295, amuletOfRancour: 29801, ferociousGloves: 22981, primordialBoots: 13239, ultorRing: 28307, dragonClaws: 13652,
  tumekensShadow: 27275, ancestralHat: 21018, ancestralTop: 21021, ancestralBottom: 21024, occultNecklace: 12002,
  tormentedBracelet: 19544, eternalBoots: 13235, imbuedSaradominCape: 21791, lightbearer: 25975, kodaiWand: 21006,
  saradominBrew: 6685, superRestore: 3024, anglerfish: 13441, divineSuperCombat: 23685, rangingPotion: 2444,
};
const slots = (...ids) => ids.map((id) => ({ id }));
const repeat = (id, count) => Array.from({ length: count }, () => id);

const rangedGear = {
  name: "Max ranged",
  equipment: {
    weapon: item.twistedBow, head: item.masoriMask, body: item.masoriBody, legs: item.masoriChaps, hands: item.zaryteVambraces,
    boots: item.pegasianBoots, amulet: item.necklaceOfAnguish, cape: item.avasAssembler, ring: item.venatorRing,
  },
  inventory: slots(item.toxicBlowpipe, item.rangingPotion, ...repeat(item.saradominBrew, 10), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: { equippedAmmo: { id: item.dragonArrow } },
};
const meleeGear = {
  name: "Max melee",
  equipment: {
    weapon: item.osmumtensFang, shield: item.avernicDefender, head: item.torvaHelm, body: item.torvaBody, legs: item.torvaLegs,
    hands: item.ferociousGloves, boots: item.primordialBoots, amulet: item.amuletOfRancour, cape: item.infernalCape, ring: item.ultorRing,
  },
  inventory: slots(item.dragonClaws, item.divineSuperCombat, ...repeat(item.saradominBrew, 10), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: {},
};
const mageGear = {
  name: "Max magic",
  equipment: {
    weapon: item.tumekensShadow, head: item.ancestralHat, body: item.ancestralTop, legs: item.ancestralBottom, hands: item.tormentedBracelet,
    boots: item.eternalBoots, amulet: item.occultNecklace, cape: item.imbuedSaradominCape, ring: item.lightbearer,
  },
  inventory: slots(item.kodaiWand, ...repeat(item.saradominBrew, 11), ...repeat(item.superRestore, 8), ...repeat(item.anglerfish, 8)),
  supplies: {},
};

const npc = (id, type, x, y, extra = {}) => ({ id, npc: type, position: [x, y], ...extra });
const example = (key, meta, arena, mode, gear, npcs, options = {}) => ({
  key,
  scenario: normalizeScenario({ format: "openscim-sandbox", version: 1, meta: { author: "OpenScim", ...meta }, arena, mode, options, gear, npcs }),
});

export const sandboxExamples = [
  // The real Sol Heredit, with all his mechanics (the arena's host), and a second one of the sandbox's.
  example("two-suns", { name: "Two Suns", description: "Sol Heredit with all his mechanics, and a second Sol beside him. Good luck." }, "sol_heredit", "versus", meleeGear, [
    npc("sol-twin", "sol_heredit", 26, 29),
  ], { bossMechanics: true }),
  example("inferno-gauntlet", { name: "Inferno Gauntlet", description: "A late Inferno wave without the pillars to hide behind." }, "inferno", "versus", rangedGear, [
    npc("meleer", "inferno.meleer", 29, 40),
    npc("ranger", "inferno.ranger", 20, 42),
    npc("mager", "inferno.mager", 39, 41),
    npc("bat-1", "inferno.bat", 24, 37),
    npc("bat-2", "inferno.bat", 36, 37),
    npc("nibbler-1", "inferno.nibbler", 28, 36),
    npc("nibbler-2", "inferno.nibbler", 31, 36),
    npc("nibbler-3", "inferno.nibbler", 34, 36),
  ]),
  example("colosseum-royale", { name: "Colosseum Royale", description: "The six monsters of the waves, every one for itself. Watch who is left." }, "colosseum", "ffa", mageGear, [
    npc("shaman", "colosseum.shaman", 22, 46),
    npc("jaguar", "colosseum.jaguar", 40, 46),
    npc("javelin", "colosseum.javelin", 20, 24),
    npc("manticore", "colosseum.manticore", 41, 23),
    npc("shockwave", "colosseum.shockwave", 31, 44),
    npc("minotaur", "colosseum.minotaur", 31, 25),
  ], { ffaIncludesPlayer: false }),
  example("warband-stand", { name: "The Warband's Stand", description: "The Fremennik fight at your side against an Inferno wave." }, "colosseum", "ffa", rangedGear, [
    npc("berserker", "warband.berserker", 25, 36, { team: "player" }),
    npc("archer", "warband.archer", 24, 33, { team: "player" }),
    npc("seer", "warband.seer", 24, 39, { team: "player" }),
    npc("meleer", "inferno.meleer", 38, 35, { team: "inferno" }),
    npc("ranger", "inferno.ranger", 42, 42, { team: "inferno" }),
    npc("blob", "inferno.blob", 42, 28, { team: "inferno" }),
  ]),
  example("jad-duel", { name: "Jad in Yama's Room", description: "JalTok-Jad and his two healers, far from home." }, "yama", "versus", rangedGear, [
    npc("jad", "inferno.jad", 29, 24),
    npc("healer-1", "inferno.jad_healer", 25, 27),
    npc("healer-2", "inferno.jad_healer", 37, 27),
  ]),
  example("boss-brawl", { name: "Boss Brawl", description: "Vardorvis, Sol Heredit and the Doom, and you in the middle: everyone fights everyone." }, "doom_deep", "ffa", meleeGear, [
    npc("vardorvis", "vardorvis", 24, 40),
    npc("sol", "sol_heredit", 35, 40),
    npc("doom", "doom", 29, 31),
  ], { playerStart: [31, 46] }),
  example("nibbler-swarm", { name: "Nibbler Swarm", description: "Ten nibblers in Zebak's room. Bring something that hits many." }, "zebak", "versus", mageGear, [
    npc("nib-1", "inferno.nibbler", 25, 38), npc("nib-2", "inferno.nibbler", 27, 38), npc("nib-3", "inferno.nibbler", 29, 38),
    npc("nib-4", "inferno.nibbler", 31, 38), npc("nib-5", "inferno.nibbler", 33, 38), npc("nib-6", "inferno.nibbler", 25, 26),
    npc("nib-7", "inferno.nibbler", 27, 26), npc("nib-8", "inferno.nibbler", 29, 26), npc("nib-9", "inferno.nibbler", 31, 26),
    npc("nib-10", "inferno.nibbler", 33, 26),
  ]),
  example("clearing-skirmish", { name: "Red against Blue", description: "Two teams in Vardorvis' clearing; the player only watches." }, "vardorvis", "ffa", mageGear, [
    npc("red-jaguar", "colosseum.jaguar", 34, 30, { team: "red" }),
    npc("red-archer", "warband.archer", 33, 33, { team: "red" }),
    npc("red-seer", "warband.seer", 36, 33, { team: "red" }),
    npc("blue-minotaur", "colosseum.minotaur", 45, 30, { team: "blue" }),
    npc("blue-shaman", "colosseum.shaman", 47, 26, { team: "blue" }),
    npc("blue-bat", "inferno.bat", 44, 20, { team: "blue" }),
  ], { ffaIncludesPlayer: false }),
  example("mage-hall", { name: "Hall of Mages", description: "Magic from every side in the nexus of the Tombs of Amascut." }, "toa_nexus", "versus", rangedGear, [
    npc("shaman-1", "colosseum.shaman", 24, 35),
    npc("shaman-2", "colosseum.shaman", 38, 35),
    npc("seer-1", "warband.seer", 27, 24),
    npc("seer-2", "warband.seer", 35, 24),
    npc("shockwave", "colosseum.shockwave", 30, 34),
  ]),
  example("minotaur-pit", { name: "The Minotaur's Pit", description: "A minotaur, two jaguars and a javelin colossus in the Doom's first room, with doubled hitpoints." }, "doom", "versus", meleeGear, [
    npc("minotaur", "colosseum.minotaur", 30, 40, { hp: 450 }),
    npc("jaguar-1", "colosseum.jaguar", 24, 36, { hp: 250 }),
    npc("jaguar-2", "colosseum.jaguar", 37, 36, { hp: 250 }),
    npc("javelin", "colosseum.javelin", 30, 45, { hp: 440 }),
  ]),

  // --- harder ---------------------------------------------------------------
  example("sols-gauntlet", { name: "Sol's Gauntlet", description: "Sol Heredit with all his mechanics, while two javelin colossi and a serpent shaman shoot from the edges." }, "sol_heredit", "versus", meleeGear, [
    npc("javelin-west", "colosseum.javelin", 26, 37),
    npc("javelin-east", "colosseum.javelin", 37, 37),
    npc("shaman", "colosseum.shaman", 29, 29),
  ], { bossMechanics: true }),
  example("yamas-court", { name: "Yama's Court", description: "Yama with his fireballs, waves and void flares, and JalTok-Jad with his healers at his side." }, "yama", "versus", rangedGear, [
    npc("jad", "inferno.jad", 19, 30),
    npc("healer-1", "inferno.jad_healer", 25, 36),
    npc("healer-2", "inferno.jad_healer", 38, 36),
  ], { bossMechanics: true, playerStart: [31, 37] }),
  example("vardorvis-pack", { name: "Vardorvis and the Pack", description: "Vardorvis with his axes, spikes and strangle, two jaguar warriors and a minotaur." }, "vardorvis", "versus", meleeGear, [
    npc("jaguar-1", "colosseum.jaguar", 34, 29),
    npc("jaguar-2", "colosseum.jaguar", 46, 29),
    npc("minotaur", "colosseum.minotaur", 45, 19),
  ], { bossMechanics: true }),
  example("dooms-swarm", { name: "Doom's Swarm", description: "The Doom of Mokhaiotl's first delve, with nibblers at your feet and bats overhead." }, "doom", "versus", rangedGear, [
    npc("nib-1", "inferno.nibbler", 24, 29), npc("nib-2", "inferno.nibbler", 25, 31),
    npc("nib-3", "inferno.nibbler", 37, 29), npc("nib-4", "inferno.nibbler", 38, 31),
    npc("bat-1", "inferno.bat", 23, 42), npc("bat-2", "inferno.bat", 37, 42),
  ], { bossMechanics: true }),
  example("abyss-below", { name: "The Abyss Below", description: "The Doom's deeper delves, with an Inferno mager and ranger on the ledges." }, "doom_deep", "versus", mageGear, [
    npc("mager", "inferno.mager", 21, 40),
    npc("ranger", "inferno.ranger", 38, 40),
  ], { bossMechanics: true }),
  example("zebak-frenzy", { name: "Zebak's Feeding Frenzy", description: "Zebak with his roars, waves and blood clouds, and six nibblers that will not leave you alone." }, "zebak", "versus", rangedGear, [
    npc("nib-1", "inferno.nibbler", 33, 25), npc("nib-2", "inferno.nibbler", 35, 27), npc("nib-3", "inferno.nibbler", 36, 30),
    npc("nib-4", "inferno.nibbler", 36, 34), npc("nib-5", "inferno.nibbler", 35, 37), npc("nib-6", "inferno.nibbler", 33, 39),
  ], { bossMechanics: true }),
  example("inferno-finale", { name: "Inferno Finale", description: "Jad and his healers, a mager, a ranger, a meleer and two bats, all at once and no pillars." }, "inferno", "versus", rangedGear, [
    npc("jad", "inferno.jad", 29, 40),
    npc("healer-1", "inferno.jad_healer", 26, 43),
    npc("healer-2", "inferno.jad_healer", 36, 43),
    npc("mager", "inferno.mager", 18, 38),
    npc("ranger", "inferno.ranger", 40, 38),
    npc("meleer", "inferno.meleer", 36, 23),
    npc("bat-1", "inferno.bat", 20, 26),
    npc("bat-2", "inferno.bat", 41, 27),
  ]),
  example("last-team-standing", { name: "Last Team Standing", description: "You and the warband against three teams of the Colosseum's monsters, who fight each other too." }, "colosseum", "ffa", rangedGear, [
    npc("berserker", "warband.berserker", 25, 36, { team: "player" }),
    npc("archer", "warband.archer", 24, 33, { team: "player" }),
    npc("seer", "warband.seer", 24, 39, { team: "player" }),
    npc("red-jaguar-1", "colosseum.jaguar", 40, 45, { team: "red" }),
    npc("red-jaguar-2", "colosseum.jaguar", 43, 45, { team: "red" }),
    npc("red-jaguar-3", "colosseum.jaguar", 37, 43, { team: "red" }),
    npc("blue-minotaur", "colosseum.minotaur", 40, 22, { team: "blue" }),
    npc("blue-shaman-1", "colosseum.shaman", 38, 26, { team: "blue" }),
    npc("blue-shaman-2", "colosseum.shaman", 44, 26, { team: "blue" }),
    npc("green-javelin", "colosseum.javelin", 30, 46, { team: "green" }),
    npc("green-manticore", "colosseum.manticore", 30, 21, { team: "green" }),
  ]),
  example("boss-royale", { name: "Boss Royale", description: "Sol Heredit, the Doom, JalTok-Jad and Vardorvis in the Tombs' nexus. Every one for itself; you watch." }, "toa_nexus", "ffa", mageGear, [
    npc("sol", "sol_heredit", 24, 28),
    npc("doom", "doom", 34, 28),
    npc("jad", "inferno.jad", 28, 17),
    npc("vardorvis", "vardorvis", 34, 20),
  ], { ffaIncludesPlayer: false }),
  example("colossi-barrage", { name: "Colossi Barrage", description: "Three javelin colossi, two shockwave colossi and a manticore with half again their hitpoints." }, "colosseum", "versus", rangedGear, [
    npc("javelin-1", "colosseum.javelin", 20, 45, { hp: 330 }),
    npc("javelin-2", "colosseum.javelin", 32, 47, { hp: 330 }),
    npc("javelin-3", "colosseum.javelin", 43, 44, { hp: 330 }),
    npc("shockwave-1", "colosseum.shockwave", 20, 22, { hp: 190 }),
    npc("shockwave-2", "colosseum.shockwave", 42, 22, { hp: 190 }),
    npc("manticore", "colosseum.manticore", 32, 20, { hp: 375 }),
  ]),
];

export const getSandboxExample = (key) => sandboxExamples.find((entry) => entry.key === key);
