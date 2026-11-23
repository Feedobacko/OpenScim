// Shared by the scenario files: item ids, three sets of gear, and the inputs
// a player gives. Item ids are Old School RuneScape object ids.
//
// A scenario is { name, kind, seed, ticks, mechanics?, options?, equipment?,
// inventory?, supplies?, stats?, startHp?, start?, intro?,
// completionOwnership?, script? }.
// `script(tick, api)` runs before each tick; `api` is described in
// harness.mjs (act, moveTo, mechanics, skipIntro, npcs, player, engine).

export const item = {
  // ranged
  twistedBow: 20997, dragonArrow: 11212, toxicBlowpipe: 12926, dragonDart: 11230, zaryteCrossbow: 26374,
  rubyDragonBoltsE: 21944, diamondDragonBoltsE: 21946, bowOfFaerdhinen: 25865,
  masoriMask: 27235, masoriBody: 27238, masoriChaps: 27241, zaryteVambraces: 26235, pegasianBoots: 13237,
  necklaceOfAnguish: 19547, avasAssembler: 22109, venatorRing: 28310,
  // melee
  scytheOfVitur: 22325, soulreaperAxe: 28338, osmumtensFang: 26219, dragonClaws: 13652, burningClaws: 29577,
  voidwaker: 27690, kerisPartisanOfCorruption: 27287, avernicDefender: 22322,
  torvaHelm: 26382, torvaBody: 26384, torvaLegs: 26386, infernalCape: 21295, amuletOfRancour: 29801,
  ferociousGloves: 22981, primordialBoots: 13239, ultorRing: 28307, lightbearer: 25975,
  // magic
  tumekensShadow: 27275, kodaiWand: 21006, volatileNightmareStaff: 24424, elidinisWardF: 27251,
  ancestralHat: 21018, ancestralTop: 21021, ancestralBottom: 21024, occultNecklace: 12002,
  tormentedBracelet: 19544, eternalBoots: 13235, imbuedSaradominCape: 21791,
  // supplies
  saradominBrew: 6685, superRestore: 3024, anglerfish: 13441, karambwan: 3144, shark: 385 /* not edible in this engine */,
  superCombat: 12695, divineSuperCombat: 23685, rangingPotion: 2444, staminaPotion: 12625, prayerPotion: 2434,
};

export const rangedGear = {
  equipment: {
    weapon: item.twistedBow, head: item.masoriMask, body: item.masoriBody, legs: item.masoriChaps, hands: item.zaryteVambraces,
    boots: item.pegasianBoots, amulet: item.necklaceOfAnguish, cape: item.avasAssembler, ring: item.venatorRing,
  },
  supplies: { equippedAmmo: { id: item.dragonArrow } },
};

export const meleeGear = {
  equipment: {
    weapon: item.osmumtensFang, shield: item.avernicDefender, head: item.torvaHelm, body: item.torvaBody, legs: item.torvaLegs,
    hands: item.ferociousGloves, boots: item.primordialBoots, amulet: item.amuletOfRancour, cape: item.infernalCape, ring: item.ultorRing,
  },
};

export const magicGear = {
  equipment: {
    weapon: item.tumekensShadow, head: item.ancestralHat, body: item.ancestralTop, legs: item.ancestralBottom, hands: item.tormentedBracelet,
    boots: item.eternalBoots, amulet: item.occultNecklace, cape: item.imbuedSaradominCape, ring: item.lightbearer,
  },
};

// Inputs. Each queues one replay action on the engine.
export const attack = (api, targetId) => api.act({ type: "attackTarget", targetId });
export const castOn = (api, targetId, spellName) => api.act({ type: "manualCast", targetId, spellName });
/** "ProtectMagic" | "ProtectRange" | "ProtectMelee" | "Redemption"; the same prayer again turns it off. */
export const protect = (api, prayer) => api.act({ type: "protectionPrayer", prayer });
/** "Piety" | "Rigour" | "Augury" | "Zeal" | "EagleEye" | "MysticMight" | "Deadeye" | "MysticVigour" */
export const offensive = (api, prayer) => api.act({ type: "offensivePrayer", prayer });
/** "Preserve" | "RapidRestore" | "RapidHeal" */
export const independent = (api, prayer) => api.act({ type: "independentPrayer", prayer });
export const special = (api) => api.act({ type: "specialAttackToggle" });
export const toggleRun = (api) => api.act({ type: "runToggle" });
/** Eats, drinks or otherwise uses the item in an inventory slot (0-27). */
export const use = (api, inventoryIndex, option = "default") => api.act({ type: "itemAction", inventoryIndex, option });
/** Wields the item in an inventory slot; `slot` is the equipment slot it goes to ("weapon", "shield", "head", ...). */
export const equip = (api, inventoryIndex, slot) =>
  api.act({ type: "equipFromInventory", inventoryIndex, itemId: api.player().inventory[inventoryIndex]?.id, slot });
export const unequip = (api, slot) => api.act({ type: "unequip", slot });
/** A debug action of the encounter, e.g. command(api, { encounter: "yama_p3", type: "spawn-fireball" }). */
export const command = (api, encounterCommand) => api.act({ type: "encounterCommand", command: encounterCommand });
export const setBossHp = (api, hp) => api.act({ type: "setBossHp", hp });

export const boss = (api) => api.npcs().find((npc) => npc.role === "boss");

/** The living, targetable NPC nearest to the player (ties: first spawned). */
export function nearestNpc(api, accept = () => true) {
  const [px, py] = api.player().position;
  // Distance from the player to the nearest tile of the NPC's footprint.
  const distance = (npc) =>
    Math.max(
      Math.max(npc.position[0] - px, 0, px - (npc.position[0] + npc.size - 1)),
      Math.max(npc.position[1] - py, 0, py - (npc.position[1] + npc.size - 1)),
    );
  let best = null;
  for (const npc of api.npcs()) {
    if (npc.untargetable || !accept(npc)) continue;
    if (!best || distance(npc) < distance(best)) best = npc;
  }
  return best;
}
