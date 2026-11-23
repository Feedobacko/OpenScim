// The modifiers of the waves: which there are, how a choice of them is read,
// and which three Minimus offers before a wave.
//
// Ten are Sol Heredit's, with their names and pictures and with the rules of
// the engine that four of them change (Frailty, Myopia, Doom and Blasphemy:
// SolModifierState of ../sol-heredit/modifiers.js). Four more exist only in
// the waves. The texts of all fourteen are the game's (CACHE). What a modifier places in the arena or does each tick is in
// modifierEffects.js; what one does to a monster is in that monster's module
// (Relentless: waveMonster.js).
//
// Sources as in constants.js. WIKI here is also
// oldschool.runescape.wiki/w/Fortis_Colosseum/Modifiers and the section
// "Modifiers" of .../Fortis_Colosseum/Strategies.
import { solHereditModifiers } from "../sol-heredit/modifiers.js";
import { firstWave } from "./constants.js";

// CACHE, the structs of the game's own modifiers (config group 34, structs
// 891 to 915; `node .scratch/colo-structs.mjs` prints them): what the
// interface in which a modifier is chosen says of each, a text per level
// (params 1897 to 1899); the Glory a level is worth a wave (param 1903); and
// the modifier's place among the interface's pictures (param 1914). OBS: ten
// of these texts were on the interface in the recorded run, letter for
// letter, each with "+N Glory per wave" of its modifier at every level.
const interfaceModifiers = {
  volatility: { order: 0, glory: 100, texts: ["Enemies explode on death.", "Enemies explode in a large radius on death.", "Damaging energy in a large radius on death and leave behind molten sand."] },
  relentless: {
    order: 1,
    glory: 200,
    texts: ["Enemies ignore 33% of your defence and hit an extra 1 damage.", "Enemies ignore 66% of your defence and hit an extra 3 damage.", "Enemies ignore all defence and hit an extra 6 damage."],
  },
  reentry: {
    order: 2,
    glory: 150,
    texts: [
      "Javelins leave a temporary pool of molten sand where they land.",
      "Javelins leave a big permanent pool of molten sand where they land.",
      "Javelins leave a very big permanent pool of molten sand where they land.",
    ],
  },
  solarflare: {
    order: 3,
    glory: 250,
    texts: ["Damaging energy orbits an area slowly.", "Damaging energy orbits an area quickly and deals more damage.", "Damaging energy orbits an area very quickly, deals more damage and disables prayer."],
  },
  blasphemy: {
    order: 4,
    glory: 100,
    texts: [
      "Prayer is drained by 20% of damage received from enemies off-prayer.",
      "Prayer is drained by 40% of damage received from enemies off-prayer.",
      "Prayer is drained by 60% of damage received from enemies off-prayer.",
    ],
  },
  mantimayhem: {
    order: 5,
    glory: 150,
    texts: [
      "Manticores fire an additional projectile per orb.",
      "Manticores fire an additional projectile per orb and apply Venom on hit.",
      "Manticores fire an additional projectile per orb, apply Venom and Melee orbs can appear anywhere in the sequence.",
    ],
  },
  redflag: { order: 6, glory: 250, texts: ["Minotaurs can no longer be safespotted."] },
  frailty: {
    order: 7,
    glory: 200,
    texts: [
      "Your maximum HP is reduced by 10% and can no longer be boosted.",
      "Your maximum HP is reduced by 20% and can no longer be boosted.",
      "Your maximum HP is reduced by 40% and can no longer be boosted.",
    ],
  },
  totemic: { order: 8, glory: 200, texts: ["Healing totems spawn in and aid your enemies."] },
  doom: {
    order: 9,
    glory: 200,
    texts: [
      "A stack of Doom is gained every time you take damage. Certain death at 15 stacks. Resets each wave.",
      "A stack of Doom is gained every time you take damage. Certain death at 10 stacks. Resets each wave.",
      "A stack of Doom is gained every time you take damage. Certain death at 5 stacks. Resets each wave.",
    ],
  },
  bees: { order: 10, glory: 150, texts: ["A swarm of angry bees drifts around the arena.", "Two swarms of angry bees drift around the arena.", "Three swarms of angry bees drift around the arena."] },
  dynamicduo: { order: 11, glory: 150, texts: ["Shockwave Colossi always spawn in pairs."] },
  quartet: { order: 12, glory: 100, texts: ["An extra random Fremennik Warbander spawns every wave."] },
  myopia: {
    order: 13,
    glory: 200,
    texts: [
      "Your range is reduced by 2 tiles with autocast and ranged attacks.",
      "Your range is reduced by 4 tiles with autocast and ranged attacks.",
      "Your range is reduced by 6 tiles with autocast and ranged attacks.",
    ],
  },
};
// OBS and CACHE: the interface's picture of a modifier at a level is sprite
// 5534 + its place + 15 for each level above the first (Blasphemy 5538, 5553
// and 5568), drawn over sprite 5531, 5532 or 5533 by the level.
const firstModifierSpriteId = 5534;
const spritesPerLevel = 15;
const firstLevelBackgroundSpriteId = 5531;

// WIKI: the four that are only offered for the waves. Their pictures are the
// cache's sprites, as the other ten's are.
const waveOnlyModifiers = [
  { id: "mantimayhem", name: "Mantimayhem", icon: "/assets/encounters/modifier-mantimayhem.png" },
  { id: "reentry", name: "Reentry", icon: "/assets/encounters/modifier-reentry.png" },
  { id: "dynamicduo", name: "Dynamic Duo", icon: "/assets/encounters/modifier-dynamicduo.png" },
  { id: "redflag", name: "Red Flag", icon: "/assets/encounters/modifier-redflag.png" },
];

/**
 * Every modifier of the waves: { id, name, icon, summary, tiers }, a tier's
 * text per level. The texts are the game's own, for Sol Heredit's ten as
 * well: his module's texts speak of his fight.
 */
export const colosseumModifiers = [...solHereditModifiers, ...waveOnlyModifiers].map((modifier) => ({
  ...modifier,
  summary: interfaceModifiers[modifier.id].texts[0],
  tiers: interfaceModifiers[modifier.id].texts,
}));

const getModifier = (id) => colosseumModifiers.find((modifier) => modifier.id === id);

/** "Blasphemy", "Blasphemy (II)", "Blasphemy (III)": a modifier at a level, as the game names it. */
export function getModifierLabel(id, level) {
  return getModifier(id).name + ["", "", " (II)", " (III)"][level];
}

/**
 * A choice of modifiers as the encounter keeps it: { id: level }.
 * `selection` is what the application hands the factory. A modifier the
 * waves do not have, or a level it does not have, is refused.
 */
export function readModifierSelection(selection = {}) {
  for (const [id, level] of Object.entries(selection)) {
    const modifier = getModifier(id);
    if (!modifier || !Number.isInteger(level) || level < 1 || level > modifier.tiers.length) {
      throw new TypeError(`Colosseum modifier '${id}' has no level ${level}`);
    }
  }
  return { ...selection };
}

// OBS, the offer before wave 1: Blasphemy, Relentless, Frailty, in that
// order. WIKI: the first wave always has those three.
const firstWaveOffer = ["blasphemy", "relentless", "frailty"];
// WIKI (Strategies): "Red Flag and Dynamic Duo become available before wave 7
// starts."
const offeredFromWave = { redflag: 7, dynamicduo: 7 };

/**
 * A modifier at a level as the interface shows it: { id, level, label, text,
 * glory, spriteId, backgroundSpriteId }.
 */
export function getInterfaceModifier(id, level) {
  const { order, glory, texts } = interfaceModifiers[id];
  return {
    id,
    level,
    label: getModifierLabel(id, level),
    text: texts[level - 1],
    glory,
    spriteId: firstModifierSpriteId + order + spritesPerLevel * (level - 1),
    backgroundSpriteId: firstLevelBackgroundSpriteId + level - 1,
  };
}

/**
 * The three modifiers Minimus offers before `wave` to a run that has
 * `selection` so far, each as getInterfaceModifier gives it, `level` being
 * the level the choice would bring the modifier to.
 *
 * WIKI: after the first wave they are "picked at random with a preference
 * towards upgrades to previously picked Tier 1 and Tier 2 modifiers". OBS,
 * the offers before waves 2 to 5 of one run: every upgrade that was open was
 * offered, and before the modifiers not yet taken (Blasphemy (II), Reentry,
 * Frailty; Blasphemy (III), Volatility, Mantimayhem; Volatility (II),
 * Blasphemy (III), Quartet; Volatility (II), Reentry, Quartet). inferred from
 * those four: the open upgrades come first, in a random order, and the rest
 * is drawn evenly from the modifiers not yet taken.
 */
export function buildModifierOffer(selection, wave, shuffle) {
  const isOpen = (modifier) => (selection[modifier.id] ?? 0) < modifier.tiers.length && wave >= (offeredFromWave[modifier.id] ?? firstWave);
  const open = colosseumModifiers.filter(isOpen);
  const first = wave === firstWave ? firstWaveOffer.map(getModifier).filter(isOpen) : [];
  const upgrades = shuffle(open.filter((modifier) => selection[modifier.id] && !first.includes(modifier)));
  const untaken = shuffle(open.filter((modifier) => !selection[modifier.id] && !first.includes(modifier)));
  return [...first, ...upgrades, ...untaken].slice(0, 3).map((modifier) => getInterfaceModifier(modifier.id, (selection[modifier.id] ?? 0) + 1));
}
