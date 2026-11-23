var solPhases = [
  {
    threshold: 0.9,
    taunt: "Not bad. Let's try something else...",
    addsCrystal: true,
  },
  {
    threshold: 0.75,
    taunt: "Impressive. Let's see how you handle this...",
    addsCrystal: true,
  },
  {
    threshold: 0.5,
    taunt: "You can't win!",
    addsCrystal: true,
  },
  {
    threshold: 0.25,
    taunt: "Ralos guides my hand!",
    addsCrystal: true,
  },
  {
    threshold: 0.1,
    taunt: "LET'S END THIS!",
    addsCrystal: false,
  },
];
var solDefeatOverheadTexts = [
  "A worthy... opponent...",
  "Ralos has smiled upon you...",
  "My compliments, champion...",
];
function getSolPhaseForHp(bossHp, maxHp) {
  const hpFraction = bossHp / maxHp;
  let phase = 0;
  for (const solPhase of solPhases) {
    if (hpFraction <= solPhase.threshold) {
      phase++;
    }
  }
  return phase;
}
function isSolEnragePhase(phase) {
  return phase >= 5;
}
export { solPhases, solDefeatOverheadTexts, getSolPhaseForHp, isSolEnragePhase };
