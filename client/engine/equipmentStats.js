import { getBaseItemId } from "../data/itemVariants.js";
import { variantArrowsByItemId } from "./ammunition.js";
var gracefulSetItemPairs = [
  [
    [11850, 11851],
    [11852, 11853],
    [11854, 11855],
    [11856, 11857],
    [11858, 11859],
    [11860, 11861],
  ],
  [
    [13579, 13580],
    [13581, 13582],
    [13583, 13584],
    [13585, 13586],
    [13587, 13588],
    [13589, 13590],
  ],
  [
    [13591, 13592],
    [13593, 13594],
    [13595, 13596],
    [13597, 13598],
    [13599, 13600],
    [13601, 13602],
  ],
  [
    [13603, 13604],
    [13605, 13606],
    [13607, 13608],
    [13609, 13610],
    [13611, 13612],
    [13613, 13614],
  ],
  [
    [13615, 13616],
    [13617, 13618],
    [13619, 13620],
    [13621, 13622],
    [13623, 13624],
    [13625, 13626],
  ],
  [
    [13627, 13628],
    [13629, 13630],
    [13631, 13632],
    [13633, 13634],
    [13635, 13636],
    [13637, 13638],
  ],
  [
    [13667, 13668],
    [13669, 13670],
    [13671, 13672],
    [13673, 13674],
    [13675, 13676],
    [13677, 13678],
  ],
  [
    [21061, 21063],
    [21064, 21066],
    [21067, 21069],
    [21070, 21072],
    [21073, 21075],
    [21076, 21078],
  ],
  [
    [24743, 24745],
    [24746, 24748],
    [24749, 24751],
    [24752, 24754],
    [24755, 24757],
    [24758, 24760],
  ],
  [
    [25069, 25071],
    [25072, 25074],
    [25075, 25077],
    [25078, 25080],
    [25081, 25083],
    [25084, 25086],
  ],
  [
    [27444, 27446],
    [27447, 27449],
    [27450, 27452],
    [27453, 27455],
    [27456, 27458],
    [27459, 27461],
  ],
  [
    [30045, 30047],
    [30048, 30050],
    [30051, 30053],
    [30054, 30056],
    [30057, 30059],
    [30060, 30062],
  ],
];
var agilityCapeItemPairs = [
  [9771, 13340],
  [9772, 13341],
  [13280, 13342],
];
var gracefulPieceBonusPercents = [3, 3, 4, 4, 3, 3];
var wornVariantItemPairs = [
  ...gracefulSetItemPairs.flat(),
  ...agilityCapeItemPairs,
  [88, 89],
  [10069, 10073],
  [10071, 10074],
  [10553, 10554],
  [10053, 28839],
  [10055, 28842],
  [10057, 28845],
  [10059, 28848],
  [10061, 28851],
  [10063, 28854],
  [10065, 28857],
  [10067, 28860],
];
var wornVariantByItemId = new Map(wornVariantItemPairs);
var gracefulPieceIndexByItemId = new Map();
for (const gracefulSet of gracefulSetItemPairs) {
  gracefulSet.forEach((piecePair, pieceIndex) => {
    for (const itemId of piecePair) {
      gracefulPieceIndexByItemId.set(itemId, pieceIndex);
    }
  });
}
for (const capePair of agilityCapeItemPairs) {
  for (const itemId of capePair) {
    gracefulPieceIndexByItemId.set(itemId, 1);
  }
}
function getWornVariantItemId(itemId) {
  return wornVariantByItemId.get(itemId) ?? itemId;
}
function getGracefulBonusPercent(equipment) {
  const wornPieces = new Set();
  for (const itemId of Object.values(equipment)) {
    const pieceIndex = itemId === undefined ? undefined : gracefulPieceIndexByItemId.get(itemId);
    if (pieceIndex !== undefined) {
      wornPieces.add(pieceIndex);
    }
  }
  let bonusPercent = 0;
  for (const pieceIndex of wornPieces) {
    bonusPercent += gracefulPieceBonusPercents[pieceIndex];
  }
  if (wornPieces.size === gracefulPieceBonusPercents.length) {
    return bonusPercent + 10;
  } else {
    return bonusPercent;
  }
}
function getNumericParam(params, paramId, fallback = 0) {
  if (!params) {
    return fallback;
  }
  const value = params.get(paramId);
  if (typeof value == "number") {
    return value;
  } else {
    return fallback;
  }
}
function createEmptyEquipmentStats() {
  return {
    attackStab: 0,
    attackSlash: 0,
    attackCrush: 0,
    attackMagic: 0,
    attackRanged: 0,
    defenceStab: 0,
    defenceSlash: 0,
    defenceCrush: 0,
    defenceMagic: 0,
    defenceRanged: 0,
    meleeStrength: 0,
    rangedStrength: 0,
    magicDamage: 0,
    prayer: 0,
    attackSpeed: 4,
    attackRange: 1,
  };
}
var equipmentStatOverridesByItemId = {
  24417: { // Inquisitor's mace
    attackCrush: 102,
    meleeStrength: 96,
  },
  27679: { // Accursed sceptre (a)
    attackSpeed: 5,
  },
  28951: { // Dizana's quiver
    attackRanged: 18,
    rangedStrength: 3,
  },
  29031: { // Eclipse Moon chestplate
    attackMagic: -15,
    attackRanged: 31,
    defenceStab: 15,
    defenceSlash: 18,
    defenceCrush: 57,
    defenceMagic: 55,
    defenceRanged: 32,
    meleeStrength: 3,
  },
  29033: { // Eclipse Moon tassets
    attackMagic: -15,
    attackRanged: 17,
    defenceStab: 9,
    defenceSlash: 13,
    defenceCrush: 37,
    defenceMagic: 31,
    defenceRanged: 17,
    meleeStrength: 1,
  },
  29035: { // Eclipse Moon helm
    attackMagic: -6,
    attackRanged: 8,
    defenceStab: 2,
    defenceSlash: 3,
    defenceCrush: 14,
    defenceMagic: 10,
    defenceRanged: 4,
    meleeStrength: 3,
  },
  29037: { // Blue Moon chestplate
    attackMagic: 30,
    defenceCrush: 51,
    defenceMagic: 28,
    meleeStrength: 2,
    magicDamage: 1,
  },
  29801: { // Amulet of rancour
    attackStab: 25,
    attackSlash: 25,
    attackCrush: 25,
    attackMagic: -6,
    attackRanged: -8,
    meleeStrength: 12,
    prayer: 2,
  },
  29806: { // Aranea boots
    attackMagic: 5,
    attackRanged: 6,
    meleeStrength: 4,
    prayer: 1,
  },
  30076: { // Hueycoatl hide body
    attackMagic: -15,
    attackRanged: 30,
    defenceStab: 55,
    defenceSlash: 47,
    defenceCrush: 60,
    defenceMagic: 56,
    defenceRanged: 55,
    prayer: 3,
  },
  30079: { // Hueycoatl hide chaps
    attackMagic: -10,
    attackRanged: 17,
    defenceStab: 31,
    defenceSlash: 25,
    defenceCrush: 33,
    defenceMagic: 30,
    defenceRanged: 31,
    prayer: 2,
  },
  31097: { // Avernic treads (max)
    attackStab: 5,
    attackSlash: 5,
    attackCrush: 5,
    attackMagic: 11,
    attackRanged: 15,
    defenceStab: 21,
    defenceSlash: 25,
    defenceCrush: 25,
    defenceMagic: 10,
    defenceRanged: 10,
    meleeStrength: 6,
    rangedStrength: 3,
    magicDamage: 2,
  },
  27624: { // Ancient sceptre
    magicDamage: 10,
  },
  33639: { // Necklace of rupture
    attackRanged: 20,
    rangedStrength: 8,
    prayer: 3,
  },
};
function applyEquipmentStatOverrides(itemId, stats) {
  const variantArrow = variantArrowsByItemId[itemId];
  if (variantArrow !== undefined) {
    return {
      ...stats,
      attackRanged: 20,
      rangedStrength: variantArrow.rangedStrength,
    };
  }
  const baseItemOverride = equipmentStatOverridesByItemId[getBaseItemId(itemId)];
  const itemOverride = equipmentStatOverridesByItemId[itemId];
  if (baseItemOverride === undefined && itemOverride === undefined) {
    return stats;
  } else {
    return {
      ...stats,
      ...baseItemOverride,
      ...itemOverride,
    };
  }
}
function readEquipmentStats(objType) {
  const params = objType.params;
  return applyEquipmentStatOverrides(objType.id, {
    attackStab: getNumericParam(params, 0),
    attackSlash: getNumericParam(params, 1),
    attackCrush: getNumericParam(params, 2),
    attackMagic: getNumericParam(params, 3),
    attackRanged: getNumericParam(params, 4),
    defenceStab: getNumericParam(params, 5),
    defenceSlash: getNumericParam(params, 6),
    defenceCrush: getNumericParam(params, 7),
    defenceMagic: getNumericParam(params, 8),
    defenceRanged: getNumericParam(params, 9),
    meleeStrength: getNumericParam(params, 10),
    rangedStrength: getNumericParam(params, 189) || getNumericParam(params, 12),
    magicDamage: getNumericParam(params, 299) / 10,
    prayer: getNumericParam(params, 11),
    attackSpeed: getNumericParam(params, 14, 4),
    attackRange: Math.max(1, getNumericParam(params, 13)),
  });
}
var equipmentStatParamIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14, 189, 12, 299];
function getItemEquipmentStats(itemId, objTypeLoader) {
  const objType = objTypeLoader.load(itemId);
  const baseItemId = getBaseItemId(itemId);
  if (baseItemId === itemId || equipmentStatParamIds.some((paramId) => objType.params?.has(paramId) === true)) {
    return readEquipmentStats(objType);
  } else {
    return applyEquipmentStatOverrides(itemId, readEquipmentStats(objTypeLoader.load(baseItemId)));
  }
}
function computeEquipmentStats(equipment, objTypeLoader) {
  const totals = {
    attackStab: 0,
    attackSlash: 0,
    attackCrush: 0,
    attackMagic: 0,
    attackRanged: 0,
    defenceStab: 0,
    defenceSlash: 0,
    defenceCrush: 0,
    defenceMagic: 0,
    defenceRanged: 0,
    meleeStrength: 0,
    rangedStrength: 0,
    magicDamage: 0,
    prayer: 0,
    attackSpeed: 4,
    attackRange: 1,
  };
  for (const slot of [
    "head",
    "cape",
    "amulet",
    "weapon",
    "body",
    "shield",
    "legs",
    "hands",
    "boots",
    "ring",
  ]) {
    const itemId = equipment[slot];
    if (itemId === undefined) {
      continue;
    }
    let itemStats;
    try {
      itemStats = getItemEquipmentStats(itemId, objTypeLoader);
    } catch {
      continue;
    }
    totals.attackStab += itemStats.attackStab;
    totals.attackSlash += itemStats.attackSlash;
    totals.attackCrush += itemStats.attackCrush;
    totals.attackMagic += itemStats.attackMagic;
    totals.attackRanged += itemStats.attackRanged;
    totals.defenceStab += itemStats.defenceStab;
    totals.defenceSlash += itemStats.defenceSlash;
    totals.defenceCrush += itemStats.defenceCrush;
    totals.defenceMagic += itemStats.defenceMagic;
    totals.defenceRanged += itemStats.defenceRanged;
    totals.meleeStrength += itemStats.meleeStrength;
    totals.rangedStrength += itemStats.rangedStrength;
    totals.magicDamage += itemStats.magicDamage;
    totals.prayer += itemStats.prayer;
    if (slot === "weapon") {
      totals.attackSpeed = itemStats.attackSpeed;
      totals.attackRange = itemStats.attackRange;
    }
  }
  return totals;
}
function getCarriedWeight(equipment, inventory, objTypeLoader) {
  let totalGrams = 0;
  for (const slot of [
    "head",
    "cape",
    "amulet",
    "weapon",
    "body",
    "shield",
    "legs",
    "hands",
    "boots",
    "ring",
  ]) {
    const itemId = equipment[slot];
    if (itemId !== undefined) {
      try {
        const objType = objTypeLoader.load(getWornVariantItemId(itemId));
        if (!objType.stackable) {
          totalGrams += objType.weight;
        }
      } catch {}
    }
  }
  for (const inventoryItem of inventory) {
    if (inventoryItem) {
      try {
        const objType = objTypeLoader.load(inventoryItem.id);
        const quantity = inventoryItem.quantity ?? 1;
        if (!objType.stackable) {
          totalGrams += objType.weight * quantity;
        }
      } catch {}
    }
  }
  return totalGrams / 1000;
}
export {
  getGracefulBonusPercent,
  createEmptyEquipmentStats,
  getItemEquipmentStats,
  computeEquipmentStats,
  getCarriedWeight,
};
