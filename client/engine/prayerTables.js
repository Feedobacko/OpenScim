import { commonMechanicsDefaults } from "./mechanicsConfig.js";
var Prayer = {
  ProtectMagic: "ProtectMagic",
  ProtectRange: "ProtectRange",
  ProtectMelee: "ProtectMelee",
  Redemption: "Redemption",
  Augury: "Augury",
  Rigour: "Rigour",
  Piety: "Piety",
  Zeal: "Zeal",
  EagleEye: "EagleEye",
  MysticMight: "MysticMight",
  Deadeye: "Deadeye",
  MysticVigour: "MysticVigour",
  Preserve: "Preserve",
  RapidRestore: "RapidRestore",
  RapidHeal: "RapidHeal",
};
var prayerSlotByPrayer = {
  ProtectMagic: "protection",
  ProtectRange: "protection",
  ProtectMelee: "protection",
  Redemption: "protection",
  Augury: "offensive",
  Rigour: "offensive",
  Piety: "offensive",
  Zeal: "offensive",
  EagleEye: "offensive",
  MysticMight: "offensive",
  Deadeye: "offensive",
  MysticVigour: "offensive",
  Preserve: "independent",
  RapidRestore: "independent",
  RapidHeal: "independent",
};
var mechanicsKeyByPrayer = {
  Deadeye: "upgradedPrayers",
  MysticVigour: "upgradedPrayers",
  Zeal: "zealPrayer",
};
function isPrayerUnlockedByMechanics(prayer, mechanicsConfig) {
  const mechanicsKey = mechanicsKeyByPrayer[prayer];
  return mechanicsKey === undefined || (mechanicsConfig[mechanicsKey] ?? commonMechanicsDefaults[mechanicsKey]) === true;
}
var prayerDrainEffects = {
  ProtectMagic: 12,
  ProtectRange: 12,
  ProtectMelee: 12,
  Piety: 24,
  Zeal: 24,
  Rigour: 24,
  Augury: 24,
  EagleEye: 12,
  MysticMight: 12,
  Deadeye: 12,
  MysticVigour: 12,
  Redemption: 6,
  Preserve: 2,
  RapidRestore: 1,
  RapidHeal: 2,
};
var redemptionHealFraction = 0.25;
function createPrayerState() {
  return {
    points: 99,
    maxPoints: 99,
    drainCounter: 0,
    activePrayers: [],
    prayerActivationTicks: {},
  };
}
export {
  Prayer,
  prayerSlotByPrayer,
  isPrayerUnlockedByMechanics,
  prayerDrainEffects,
  redemptionHealFraction,
  createPrayerState,
};
