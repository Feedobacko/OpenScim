// JalTok-Jad's prayer window (client/encounters/inferno/jad.js, issue #17).
// His magic and ranged attacks are judged against the player's protection
// prayer on the tick he releases them, three ticks after his animation
// starts: a matching prayer switched on any time before that tick blocks the
// hit, and one switched on after it does not, though the hitsplat comes a
// tick or two later. The OSRS Wiki on the ranged attack: switching after
// the release is too late, "even if the projectile has not hit you yet"
// (TzHaar Fight Cave/Strategies). Plain Node with the harness's module hooks.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";

const { prepareArena, engineModule, objTypeLoader } = await loadEnvironment();
const { infernoNpcTypeIds } = await import("../client/encounters/inferno/constants.js");
await prepareArena("inferno");

const against = { magic: "ProtectMagic", range: "ProtectRange" };

// Runs wave 67 (one Jad). Each time Jad starts an attack, the player drops his
// prayer and puts the matching one up `ticksAfterAnimation` ticks later
// (before that tick is processed, as a click between ticks is). Returns, per
// attack, its style and the prayer the hit was judged against.
function judgedPrayers(ticksAfterAnimation) {
  const engine = engineModule.createSimulationEngine({
    encounterConfig: { kind: "inferno", mechanics: { infiniteHealth: true, infernoStartWave: "67" } },
    objTypeLoader, combatSeed: 7,
    inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  const attacks = [];
  let switchAt = null;
  const seen = new Set();
  for (let step = 0; step < 200 && attacks.filter((attack) => attack.judged !== undefined).length < 6; step++) {
    if (switchAt && switchAt.tick === engine.currentTick + 1) engine.setProtectionPrayer(switchAt.prayer);
    engine.advanceTick(engine.getState().playerPosition);
    for (const jad of engine.worldState.getNpcs().filter((npc) => npc.npcTypeId === infernoNpcTypeIds.jad)) {
      const pending = jad.state.pendingAttack;
      if (!pending || seen.has(pending.releaseTick) || pending.style === "melee") continue;
      seen.add(pending.releaseTick);
      assert.equal(pending.releaseTick - engine.currentTick, 3, "the attack is released three ticks after the animation starts");
      engine.setProtectionPrayer(null);
      switchAt = { tick: engine.currentTick + ticksAfterAnimation, prayer: against[pending.style] };
      attacks.push({ style: pending.style, releaseTick: pending.releaseTick, judged: undefined });
    }
    for (const hit of engine.getState().damageHistory.filter((entry) => entry.targetId === "player" && entry.tick === engine.currentTick && entry.sourceNpcTypeId === infernoNpcTypeIds.jad)) {
      const attack = attacks.find((candidate) => candidate.judged === undefined && candidate.releaseTick < hit.tick);
      if (attack) attack.judged = hit.activePrayer;
    }
  }
  return attacks.filter((attack) => attack.judged !== undefined);
}

// Switched on one, two or three ticks after the animation starts: in time.
for (const ticks of [1, 2, 3]) {
  const attacks = judgedPrayers(ticks);
  assert.ok(attacks.length >= 4, `attacks seen (${attacks.length})`);
  for (const { style, judged } of attacks) assert.equal(judged, against[style], `switched ${ticks} ticks after the animation: the ${style} attack is prayed against`);
}
// Four ticks after: the attack was released on the third, without the prayer.
for (const { style, judged } of judgedPrayers(4)) assert.notEqual(judged, against[style], `switched after the release: the ${style} attack is not prayed against`);

console.log("Jad's prayer window: three ticks from the animation to the release, judged on the release");
process.exit(0);
