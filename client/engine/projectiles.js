function getHitDelayTicks(weaponKind, distance) {
  switch (weaponKind) {
    case "melee":
      return 1;
    case "bow":
      return 1 + Math.floor((distance + 3) / 6);
    case "thrown":
      return 1 + Math.floor(distance / 6);
    case "magic":
      return 1 + Math.floor((distance + 1) / 3);
    case "magic_slow":
      return 2 + Math.floor((distance + 1) / 3);
  }
}
var projectileTimings = {
  magic_spell: {
    delay: 51,
    lengthAdjustment: -5,
    stepMultiplier: 10,
    progress: 64,
  },
  tumekens_shadow: {
    delay: 56,
    lengthAdjustment: 16,
    stepMultiplier: 10,
    progress: 40,
  },
  eye_of_ayak: {
    delay: 51,
    lengthAdjustment: -5,
    stepMultiplier: 5,
    progress: 64,
  },
  arrow: {
    delay: 41,
    lengthAdjustment: 5,
    stepMultiplier: 5,
    progress: 11,
  },
  thrown: {
    delay: 32,
    lengthAdjustment: 0,
    stepMultiplier: 5,
    progress: 11,
  },
};
function getProjectileFlightCycles(timing, distance) {
  return timing.delay + timing.lengthAdjustment + timing.stepMultiplier * distance;
}
function getHitDelayTicksFromCycles(cycles) {
  return 1 + Math.floor(cycles / 30);
}
function getTicksFromCycles(cycles) {
  return Math.floor(cycles / 30);
}
export { getHitDelayTicks, projectileTimings, getProjectileFlightCycles, getHitDelayTicksFromCycles, getTicksFromCycles };
