import { yamaNpcTypeId } from "./constants.js";
function getMissingHpPercent(currentHp, maxHp) {
  const clampedMaxHp = Math.max(1, Math.trunc(maxHp));
  return Math.floor(((clampedMaxHp - Math.min(clampedMaxHp, Math.max(0, Math.trunc(currentHp)))) * 100) / clampedMaxHp);
}
var defaultYamaAttackPattern = {
  beatStartTick: 4,
  beatIntervalTicks: 7,
  beatsPerCycle: 10,
  fireballBeats: [0, 3, 7],
  snapFireballBeats: [0, 3, 7],
  voidFlareBeats: [8],
};
function scaleBossHp(maxHp, fraction) {
  return Math.floor(maxHp * fraction);
}
// The encounter is the third phase of the fight ("Phase 3" in the monster
// table): Yama starts it with a third of his hitpoints, with half of them
// under a contract.
var defaultYamaBossHp = scaleBossHp(2500, 1 / 3);
var contractYamaBossHp = scaleBossHp(2500, 0.5);
var bloodiedBlowsBossHp = scaleBossHp(3000, 0.5);
var glyphicAttenuationBossHp = scaleBossHp(2875, 0.5);
// What the right protection prayer leaves of a hit: "reduce" multiplies the
// damage by `value` (0.08 leaves 8 %), "block" leaves nothing
// (applyPrayerReduction in client/engine/damage.js).
var defaultRangedMagicPrayerReduction = {
  type: "reduce",
  value: 0.08,
};
var defaultMeleePrayerReduction = {
  type: "reduce",
  value: 0.48,
};
var defaultWaveDamage = [16, 20];
var defaultFireballDamage = [0, 20];
var contractLevelOverrides = {
  attack: 400,
  strength: 402,
  defence: 247,
  magic: 275,
  ranged: 241,
};
var contractEncounterDefaults = {
  attackPattern: {
    beatsPerCycle: 10,
    fireballBeats: [0, 3, 7],
    snapFireballBeats: [0, 7],
    voidFlareBeats: [8],
  },
  autoAttacks: {
    meleeDamage: [0, 53],
    rangedMagicDamage: [0, 53],
    rangedMagicPrayerReduction: {
      type: "reduce",
      value: 0.12,
    },
  },
  waves: {
    deltas: [0, 15, 22],
    firstCycleDeltas: [0, 15, 22],
    randomOffsets: true,
    damage: [28, 35],
  },
  boss: {
    hp: contractYamaBossHp,
  },
  voidFlares: {
    explosionDamage: {
      atZeroHp: [8, 17],
      perRemainingHp: 7 / 16,
    },
  },
};
function mergeEncounterConfig(baseConfig, overrides) {
  return {
    attackPattern: {
      ...baseConfig.attackPattern,
      ...overrides.attackPattern,
    },
    autoAttacks: {
      ...baseConfig.autoAttacks,
      ...overrides.autoAttacks,
    },
    waves: {
      ...baseConfig.waves,
      ...overrides.waves,
    },
    fireballs: {
      ...baseConfig.fireballs,
      ...overrides.fireballs,
    },
    voidFlares: {
      ...baseConfig.voidFlares,
      ...overrides.voidFlares,
    },
    boss: {
      ...baseConfig.boss,
      ...overrides.boss,
    },
    pursuit: overrides.pursuit ?? baseConfig.pursuit,
  };
}
var noContract = {
  kind: "yama_p3",
  contractId: null,
  encounter: {},
};
var divineSeveranceContract = {
  kind: "yama_p3_divine",
  contractId: "divine_severance",
  encounter: mergeEncounterConfig(contractEncounterDefaults, {
    voidFlares: {
      explosionDamage: "lethal",
      continuous: true,
      continuousHp: 81,
    },
    autoAttacks: {
      rangedMagicPrayerReduction: {
        type: "block",
      },
    },
  }),
  engineRules: {
    prayerRestrictions: {
      protection: {
        expiresAfterTicks: 2,
      },
    },
  },
};
// Run energy counts to 10000 (client/engine/playerState.js), so 100 is 1 %.
// The engine knows this failure by its text: with the toggle
// `infiniteStamina` on it drops the failure and the changes of run energy.
var staminaDepletedFailure = "StaminaDepleted";
var forfeitBreathContract = {
  kind: "yama_p3_forfeit_breath",
  contractId: "forfeit_breath",
  encounter: mergeEncounterConfig(contractEncounterDefaults, {}),
  engineRules: {
    onTickStart: (rulesContext) =>
      rulesContext.player.runEnergy.energy <= 0
        ? {
            fail: staminaDepletedFailure,
          }
        : rulesContext.tick % 4 == 0
          ? {
              runEnergyDelta: -100,
              fail: rulesContext.player.runEnergy.energy - 100 <= 0 ? staminaDepletedFailure : undefined,
            }
          : null,
    onPlayerDamageTaken: (hit, rulesContext) => {
      const runEnergyDrain = hit.effectiveDamage * 100;
      return {
        runEnergyDelta: -runEnergyDrain,
        fail: rulesContext.player.runEnergy.energy - runEnergyDrain <= 0 ? staminaDepletedFailure : undefined,
      };
    },
  },
  mechanicsToggles: [
    {
      key: "infiniteStamina",
      label: "Infinite Stamina",
    },
  ],
  defaultMechanicsConfig: {
    infiniteStamina: false,
  },
};
var sensoryCloudingContract = {
  kind: "yama_p3_sensory",
  contractId: "sensory_clouding",
  encounter: mergeEncounterConfig(contractEncounterDefaults, {
    voidFlares: {
      explosionDamage: "lethal",
    },
    autoAttacks: {
      rangedMagicPrayerReduction: {
        type: "reduce",
        value: 0.17,
      },
      rangedMagicDamage: [0, 56],
    },
    pursuit: true,
  }),
  engineRules: {
    modifyPlayerCombatParams: (combatParams, rulesContext) => ({
      ...combatParams,
      attackRange: Math.max(1, Math.floor(combatParams.attackRange / 2)),
    }),
  },
};
function getWretchedStrengthMinimumHit(maximumRolledDamage, currentHp, maxHp) {
  return Math.floor((Math.max(0, Math.trunc(maximumRolledDamage)) * getMissingHpPercent(currentHp, maxHp)) / 100);
}
var bloodiedBlowsContract = {
  kind: "yama_p3_bloodied",
  contractId: "bloodied_blows",
  encounter: mergeEncounterConfig(contractEncounterDefaults, {
    boss: {
      hp: bloodiedBlowsBossHp,
      maxHp: 3000,
    },
    attackPattern: {
      voidFlareBeats: [3, 8],
    },
    voidFlares: {
      maxActive: 4,
      spawnCount: 2,
      guaranteedPlayerMaximum: false,
    },
    autoAttacks: {
      rangedMagicPrayerReduction: {
        type: "reduce",
        value: 0.06,
      },
      wretchedStrength: true,
    },
  }),
  engineRules: {
    playerMinimumHit: (maximumRolledDamage, { player: player }) =>
      getWretchedStrengthMinimumHit(maximumRolledDamage, player.vitals.hp, player.vitals.maxHp),
  },
};
var glyphicAttenuationContract = {
  kind: "yama_p3_glyphic",
  contractId: "glyphic_attenuation",
  encounter: mergeEncounterConfig(contractEncounterDefaults, {
    boss: {
      hp: glyphicAttenuationBossHp,
      maxHp: 2875,
    },
  }),
  engineRules: {
    prayerDrain: {
      // The engine's own drain resistance is 60 + 2 x the prayer bonus. Here
      // the bonus counts against the player, down to a resistance of 40.
      modifyDrainResistance: ({ prayerBonus: prayerBonus }) =>
        Math.max(40, 60 - prayerBonus * 2),
    },
    outgoingDamageMultiplier: ({ player: player }) =>
      1 + player.equipmentStats.prayer * 0.0155,
    monsterStatOverrides: {
      [yamaNpcTypeId]: {
        defensive: {
          crush: 108,
          stab: 666,
          slash: 666,
          magic: 666,
          light: 666,
          standard: 666,
          heavy: 666,
        },
      },
    },
  },
};
// The entries of the contract menu. Nothing in this directory reads them:
// the interface does (client/assets/application.js). `presetsKey` names the
// set of loadout presets it keeps for the variant, and `startingHitpoints`
// the hitpoints the player starts with unless the settings give another.
var yamaContractVariants = [
  {
    id: "no_contract",
    encounterKind: "yama_p3",
    name: "No Contract",
    subtitle: "The standard Yama encounter.",
    available: true,
    presetsKey: "yama_p3",
  },
  {
    id: "forfeit_breath",
    encounterKind: "yama_p3_forfeit_breath",
    name: "Forfeit Breath",
    subtitle:
      "Yama drains run energy passively and on damage. Lose at 0 run energy. Rewards purifying sigil (top).",
    available: true,
    group: "Sigil",
    terms: [
      "Your run energy passively drains by 1% every 4 ticks.",
      "Yama drains run energy equal to the damage he deals.",
      "You die if your run energy reaches 0%.",
      "Fire Streaks and Shadow Waves in phases 1 and 2 behave as if one phase ahead.",
    ],
    reward: "Purifying sigil (top)",
    wikiUrl: "https://oldschool.runescape.wiki/w/Contract_of_forfeit_breath",
  },
  {
    id: "glyphic_attenuation",
    encounterKind: "yama_p3_glyphic",
    name: "Glyphic Attenuation",
    subtitle:
      "Yama is weak to crush and nothing else, and prayer bonus drains prayer faster instead of slower. Rewards sigil (bottom).",
    available: true,
    group: "Sigil",
    terms: [
      "Yama's health is increased to 2875.",
      "Yama's defence bonuses become +80 crush and +666 to everything else.",
      "Your prayer bonus increases the damage you deal.",
      "Your prayer bonus affects drain rate inversely — it drains faster, not slower.",
      "Glyphs protect for 3 ticks instead of 10; Fire glyphs deal 3× damage and Shadow glyphs drain 3× prayer.",
      "Enhanced ruby and diamond bolt effects are disabled.",
    ],
    reward: "Purifying sigil (bottom)",
    wikiUrl:
      "https://oldschool.runescape.wiki/w/Contract_of_glyphic_attenuation",
  },
  {
    id: "sensory_clouding",
    encounterKind: "yama_p3_sensory",
    name: "Sensory Clouding",
    subtitle:
      "Increased prayer penetration, infinite pursuit, lethal flare explosions, 50% reduced attack range. Rewards sigil (left).",
    available: true,
    group: "Sigil",
    terms: [
      "Yama always pursues with melee, including phase 3, whatever your weapon.",
      "All of Yama's standard attacks pierce protection prayers for the entire fight.",
      "Void flares kill an unprotected player if allowed to explode.",
      "Your weapon attack ranges are halved.",
    ],
    reward: "Purifying sigil (left)",
    wikiUrl: "https://oldschool.runescape.wiki/w/Contract_of_sensory_clouding",
  },
  {
    id: "divine_severance",
    encounterKind: "yama_p3_divine",
    name: "Divine Severance",
    subtitle:
      "Protection prayers deactivated on sight. No prayer penetration. Continuous lethal voidflares. Rewards sigil (right).",
    available: true,
    group: "Sigil",
    terms: [
      "Protection prayers are forcibly turned off after two ticks active.",
      "All of Yama's standard attacks are fully blocked by protection prayers.",
      "Void flares spawn continuously throughout the fight with halved health, and each spawn counts as a special attack when Yama picks his next glyph attack.",
      "Void flares kill an unprotected player if allowed to explode.",
    ],
    reward: "Purifying sigil (right)",
    wikiUrl: "https://oldschool.runescape.wiki/w/Contract_of_divine_severance",
  },
  {
    id: "bloodied_blows",
    encounterKind: "yama_p3_bloodied",
    name: "Bloodied Blows",
    subtitle:
      "More and tougher voidflares. Both Yama and challenger gain Wretched Strength. Rewards sigil (middle).",
    available: true,
    startingHitpoints: 10,
    group: "Sigil",
    terms: [
      "Yama's health is increased to 3000.",
      "You and Yama both gain Wretched Strength — minimum hit rises as health falls.",
      "Four void flares spawn per cycle instead of two, arriving as two pairs half a cycle apart.",
      "You are no longer guaranteed a maximum hit against void flares.",
    ],
    reward: "Purifying sigil (middle)",
    wikiUrl: "https://oldschool.runescape.wiki/w/Contract_of_bloodied_blows",
  },
];
export { getMissingHpPercent, defaultYamaAttackPattern, defaultYamaBossHp, defaultRangedMagicPrayerReduction, defaultMeleePrayerReduction, defaultWaveDamage, defaultFireballDamage, contractLevelOverrides, noContract, divineSeveranceContract, forfeitBreathContract, sensoryCloudingContract, bloodiedBlowsContract, glyphicAttenuationContract, yamaContractVariants };
