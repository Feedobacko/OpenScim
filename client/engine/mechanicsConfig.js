var commonMechanicsDefaults = {
  infiniteHealth: false,
  infiniteSpecialAttack: false,
  autoPrepot: true,
  doubleDeathCharge: true,
  upgradedPrayers: true,
  zealPrayer: false,
  vialSmasher: true,
};
function buildMechanicsConfig(encounterDefaults, playerMechanics) {
  return {
    ...commonMechanicsDefaults,
    ...(encounterDefaults ?? {}),
    ...(playerMechanics ?? {}),
  };
}
export { commonMechanicsDefaults, buildMechanicsConfig };
