var spellbookNames = ["standard", "ancient", "lunar", "arceuus"];
var spellbookLabels = {
  standard: "Standard",
  ancient: "Ancient Magicks",
  lunar: "Lunar",
  arceuus: "Arceuus",
};
var defaultSpellbook = "arceuus";
function isSpellbook(value) {
  return typeof value == "string" && spellbookNames.includes(value);
}
var statNames = [
  "attack",
  "strength",
  "defence",
  "ranged",
  "magic",
  "prayer",
  "hitpoints",
  "agility",
];
function clampStatLevel(stat, level) {
  const bounds = statLevelBounds[stat];
  if (Number.isFinite(level)) {
    return Math.min(bounds.max, Math.max(bounds.min, Math.trunc(level)));
  } else {
    return bounds.min;
  }
}
var statLabels = {
  attack: "Attack",
  strength: "Strength",
  defence: "Defence",
  ranged: "Ranged",
  magic: "Magic",
  prayer: "Prayer",
  hitpoints: "Hitpoints",
  agility: "Agility",
};
var statLevelBounds = {
  attack: {
    min: 1,
    max: 99,
  },
  strength: {
    min: 1,
    max: 99,
  },
  defence: {
    min: 1,
    max: 99,
  },
  ranged: {
    min: 1,
    max: 99,
  },
  magic: {
    min: 1,
    max: 99,
  },
  prayer: {
    min: 1,
    max: 99,
  },
  hitpoints: {
    min: 10,
    max: 99,
  },
  agility: {
    min: 1,
    max: 99,
  },
};
function isValidStatLevel(stat, level) {
  const bounds = statLevelBounds[stat];
  return (
    typeof level == "number" && Number.isInteger(level) && level >= bounds.min && level <= bounds.max
  );
}
function getCombatLevel(stats) {
  const baseLevel =
    (stats.defence.max + stats.hitpoints.max + Math.floor(stats.prayer.max / 2)) * 0.25;
  const meleeLevel = (stats.attack.max + stats.strength.max) * 0.325;
  const rangedLevel = (Math.floor(stats.ranged.max / 2) + stats.ranged.max) * 0.325;
  const magicLevel = (Math.floor(stats.magic.max / 2) + stats.magic.max) * 0.325;
  return Math.floor(baseLevel + Math.max(meleeLevel, rangedLevel, magicLevel));
}
var maxRunEnergy = 10000;
function createRunEnergy() {
  return {
    energy: 10000,
  };
}
function createPoisonState() {
  return {
    poisonVarp: 0,
    poisonTickCounter: 30,
    startedTick: null,
  };
}
var combatStatNames = ["attack", "strength", "defence", "ranged", "magic"];
var decayingStatNames = statNames.filter((stat) => stat !== "hitpoints" && stat !== "prayer");
var purgingStaffItemId = 29594;
var lightbearerItemId = 25975;
var ringOfEnduranceItemId = 24736;
function createDefaultStats() {
  const maxedLevel = {
    current: 99,
    max: 99,
  };
  return {
    attack: {
      ...maxedLevel,
    },
    strength: {
      ...maxedLevel,
    },
    defence: {
      ...maxedLevel,
    },
    ranged: {
      ...maxedLevel,
    },
    magic: {
      ...maxedLevel,
    },
    prayer: {
      ...maxedLevel,
    },
    hitpoints: {
      ...maxedLevel,
    },
    agility: {
      ...maxedLevel,
    },
  };
}
function createStatsFromLevels(levels) {
  return {
    attack: {
      current: levels.attack,
      max: levels.attack,
    },
    strength: {
      current: levels.strength,
      max: levels.strength,
    },
    defence: {
      current: levels.defence,
      max: levels.defence,
    },
    ranged: {
      current: levels.ranged,
      max: levels.ranged,
    },
    magic: {
      current: levels.magic,
      max: levels.magic,
    },
    prayer: {
      current: levels.prayer,
      max: levels.prayer,
    },
    hitpoints: {
      current: levels.hitpoints,
      max: levels.hitpoints,
    },
    agility: {
      current: levels.agility,
      max: levels.agility,
    },
  };
}
function cloneStats(stats) {
  return {
    attack: {
      current: stats.attack.current,
      max: stats.attack.max,
    },
    strength: {
      current: stats.strength.current,
      max: stats.strength.max,
    },
    defence: {
      current: stats.defence.current,
      max: stats.defence.max,
    },
    ranged: {
      current: stats.ranged.current,
      max: stats.ranged.max,
    },
    magic: {
      current: stats.magic.current,
      max: stats.magic.max,
    },
    prayer: {
      current: stats.prayer.current,
      max: stats.prayer.max,
    },
    hitpoints: {
      current: stats.hitpoints.current,
      max: stats.hitpoints.max,
    },
    agility: {
      current: stats.agility.current,
      max: stats.agility.max,
    },
  };
}
function resetStatsToMax(stats) {
  return createStatsFromLevels({
    attack: stats.attack.max,
    strength: stats.strength.max,
    defence: stats.defence.max,
    ranged: stats.ranged.max,
    magic: stats.magic.max,
    prayer: stats.prayer.max,
    hitpoints: stats.hitpoints.max,
    agility: stats.agility?.max ?? 99,
  });
}
function createSpecialAttackState() {
  return {
    energy: 100,
    regenTickCounter: 50,
    lightbearerEquipped: false,
  };
}
function createCombatTimers() {
  return {
    saturatedHeartCooldownTicks: 0,
    surgePotionCooldownTicks: 0,
    markOfDarknessCooldownTicks: 0,
    markOfDarknessActiveTicks: 0,
    deathChargeCooldownTicks: 0,
    deathChargeActiveTicks: 0,
    deathChargeProcsRemaining: 0,
    statBoostDecayTick: 100,
    statBoostDecayExtended: false,
    statRecoveryTick: 100,
    statDecayLocks: {},
    hpRegenTick: 101,
  };
}
export {
  spellbookLabels,
  defaultSpellbook,
  isSpellbook,
  statNames,
  clampStatLevel,
  statLabels,
  statLevelBounds,
  isValidStatLevel,
  getCombatLevel,
  maxRunEnergy,
  createRunEnergy,
  createPoisonState,
  combatStatNames,
  decayingStatNames,
  purgingStaffItemId,
  lightbearerItemId,
  ringOfEnduranceItemId,
  createDefaultStats,
  createStatsFromLevels,
  cloneStats,
  resetStatsToMax,
  createSpecialAttackState,
  createCombatTimers,
};
