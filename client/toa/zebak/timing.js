export const cyclesPerTick = 30;
// The first visible pot/rock and arrival are frame estimates. Cache sound matches
// place redirects and impacts at ticks 4/7 on paths 0 and 3, and 3/5 on path 4.
// Baseline https://youtu.be/93wKYCaXfmo?t=196, path 3 https://youtu.be/0-T2gOVfTkI?t=1265,
// path 4 https://youtu.be/mwKeq1tP05Y?t=544.
// Each mouth is sampled from the animated head at release. X/Y are relative
// to the southwest tile; height is above terrain in cache units (128 per tile).
const standardSpit = {
  clipId: "standardSpit", releaseFrame: 66,
  release: 42, split: 93, arrival: 180, impactTicks: 7,
  mouth: {x: 8.58, y: 4.54, height: 309},
};
const fastSpit = {
  clipId: "fastSpit", releaseFrame: 66,
  release: 56, split: 85, arrival: 142, impactTicks: 5,
  mouth: standardSpit.mouth,
};
const standardEnragedSpit = {...standardSpit, clipId: "standardEnragedSpit", releaseFrame: 32,
  split: 95, mouth: {x: 8.49, y: 4.54, height: 315}};
const fastEnragedSpit = {...fastSpit, clipId: "fastEnragedSpit", releaseFrame: 32,
  release: 32, mouth: standardEnragedSpit.mouth};
export function spitClips(normalSequence, enragedSequence) {
  const clip = (seqId, timing) => ({seqId, releaseFrame: timing.releaseFrame, releaseCycle: timing.release});
  return {
    standardSpit: clip(normalSequence, standardSpit),
    fastSpit: clip(normalSequence, fastSpit),
    standardEnragedSpit: clip(enragedSequence, standardEnragedSpit),
    fastEnragedSpit: clip(enragedSequence, fastEnragedSpit),
  };
}
export function spitTiming(path, enraged = false) {
  if (path >= 4) return enraged ? fastEnragedSpit : fastSpit;
  return enraged ? standardEnragedSpit : standardSpit;
}

// Two recorded special throws contain the cycle-3/56/65 cues from sequence 9624.
// The vomit sound precedes the spreading-acid sound by five game ticks.
export const specialThrow = { sound: 30, release: 65, acidLandingTick: 5, solidLandingTick: 6 };

// Ticks from the start of the special spit to the start of the roar animation.
// Measured from 5908 (+30 cycles) and 5836 (+20 cycles) in the recordings above.
// The second baseline roar is inferred from the five-tick difference on paths 3 and 4.
const firstRoarByAttackPeriod = {7: 34, 6: 31, 5: 29};
export function roarWindupTick(attackPeriod = 7, secondRoar = false) {
  const firstRoar = firstRoarByAttackPeriod[attackPeriod];
  return firstRoar - (secondRoar ? 5 : 0);
}
