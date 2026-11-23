// The example scenarios the editor offers. Each is a scenario of the format
// of scenario.js, checked when the module loads (normalizeScenario throws on
// a mistake). Every footprint stands on walkable tiles of its arena: the
// determinism scenario sandbox/examples-placement checks it.
import { normalizeScenario } from "./scenario.js";

const npc = (id, type, x, y, extra = {}) => ({ id, npc: type, position: [x, y], ...extra });
const example = (key, meta, arena, mode, npcs, options = {}) => ({
  key,
  scenario: normalizeScenario({ format: "openscim-sandbox", version: 1, meta: { author: "OpenScim", ...meta }, arena, mode, options, npcs }),
});

export const sandboxExamples = [
  example("two-suns", { name: "Two Suns", description: "Two Sol Heredits in his own arena. Good luck." }, "sol_heredit", "versus", [
    npc("sol-west", "sol_heredit", 27, 36),
    npc("sol-east", "sol_heredit", 34, 36),
  ]),
  example("inferno-gauntlet", { name: "Inferno Gauntlet", description: "A late Inferno wave without the pillars to hide behind." }, "inferno", "versus", [
    npc("meleer", "inferno.meleer", 29, 40),
    npc("ranger", "inferno.ranger", 20, 42),
    npc("mager", "inferno.mager", 39, 41),
    npc("bat-1", "inferno.bat", 24, 37),
    npc("bat-2", "inferno.bat", 36, 37),
    npc("nibbler-1", "inferno.nibbler", 28, 36),
    npc("nibbler-2", "inferno.nibbler", 31, 36),
    npc("nibbler-3", "inferno.nibbler", 34, 36),
  ]),
  example("colosseum-royale", { name: "Colosseum Royale", description: "The six monsters of the waves, every one for itself. Watch who is left." }, "colosseum", "ffa", [
    npc("shaman", "colosseum.shaman", 22, 46),
    npc("jaguar", "colosseum.jaguar", 40, 46),
    npc("javelin", "colosseum.javelin", 20, 24),
    npc("manticore", "colosseum.manticore", 41, 23),
    npc("shockwave", "colosseum.shockwave", 31, 44),
    npc("minotaur", "colosseum.minotaur", 31, 25),
  ], { ffaIncludesPlayer: false }),
  example("warband-stand", { name: "The Warband's Stand", description: "The Fremennik fight at your side against an Inferno wave." }, "colosseum", "ffa", [
    npc("berserker", "warband.berserker", 25, 36, { team: "player" }),
    npc("archer", "warband.archer", 24, 33, { team: "player" }),
    npc("seer", "warband.seer", 24, 39, { team: "player" }),
    npc("meleer", "inferno.meleer", 38, 35, { team: "inferno" }),
    npc("ranger", "inferno.ranger", 42, 42, { team: "inferno" }),
    npc("blob", "inferno.blob", 42, 28, { team: "inferno" }),
  ]),
  example("jad-duel", { name: "Jad in Yama's Room", description: "JalTok-Jad and his two healers, far from home." }, "yama", "versus", [
    npc("jad", "inferno.jad", 29, 24),
    npc("healer-1", "inferno.jad_healer", 25, 27),
    npc("healer-2", "inferno.jad_healer", 37, 27),
  ]),
  example("boss-brawl", { name: "Boss Brawl", description: "Vardorvis, Sol Heredit and the Doom, and you in the middle: everyone fights everyone." }, "doom_deep", "ffa", [
    npc("vardorvis", "vardorvis", 24, 40),
    npc("sol", "sol_heredit", 35, 40),
    npc("doom", "doom", 29, 31),
  ], { playerStart: [31, 46] }),
  example("nibbler-swarm", { name: "Nibbler Swarm", description: "Ten nibblers in Zebak's room. Bring something that hits many." }, "zebak", "versus", [
    npc("nib-1", "inferno.nibbler", 25, 38), npc("nib-2", "inferno.nibbler", 27, 38), npc("nib-3", "inferno.nibbler", 29, 38),
    npc("nib-4", "inferno.nibbler", 31, 38), npc("nib-5", "inferno.nibbler", 33, 38), npc("nib-6", "inferno.nibbler", 25, 26),
    npc("nib-7", "inferno.nibbler", 27, 26), npc("nib-8", "inferno.nibbler", 29, 26), npc("nib-9", "inferno.nibbler", 31, 26),
    npc("nib-10", "inferno.nibbler", 33, 26),
  ]),
  example("clearing-skirmish", { name: "Red against Blue", description: "Two teams in Vardorvis' clearing; the player only watches." }, "vardorvis", "ffa", [
    npc("red-jaguar", "colosseum.jaguar", 34, 30, { team: "red" }),
    npc("red-archer", "warband.archer", 33, 33, { team: "red" }),
    npc("red-seer", "warband.seer", 36, 33, { team: "red" }),
    npc("blue-minotaur", "colosseum.minotaur", 45, 30, { team: "blue" }),
    npc("blue-shaman", "colosseum.shaman", 47, 26, { team: "blue" }),
    npc("blue-bat", "inferno.bat", 44, 20, { team: "blue" }),
  ], { ffaIncludesPlayer: false }),
  example("mage-hall", { name: "Hall of Mages", description: "Magic from every side in the nexus of the Tombs of Amascut." }, "toa_nexus", "versus", [
    npc("shaman-1", "colosseum.shaman", 24, 35),
    npc("shaman-2", "colosseum.shaman", 38, 35),
    npc("seer-1", "warband.seer", 27, 24),
    npc("seer-2", "warband.seer", 35, 24),
    npc("shockwave", "colosseum.shockwave", 30, 34),
  ]),
  example("minotaur-pit", { name: "The Minotaur's Pit", description: "A minotaur, two jaguars and a javelin colossus in the Doom's first room, with doubled hitpoints." }, "doom", "versus", [
    npc("minotaur", "colosseum.minotaur", 30, 40, { hp: 450 }),
    npc("jaguar-1", "colosseum.jaguar", 24, 36, { hp: 250 }),
    npc("jaguar-2", "colosseum.jaguar", 37, 36, { hp: 250 }),
    npc("javelin", "colosseum.javelin", 30, 45, { hp: 440 }),
  ]),
];

export const getSandboxExample = (key) => sandboxExamples.find((entry) => entry.key === key);
