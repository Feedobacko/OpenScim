// The sandbox's catalog keeps up with the encounters, and every monster in it
// can be placed and fights:
//   1. every NPC an encounter draws (its presentation's render config) that
//      has stats in the monster table and an attack clip is in the catalog
//      (an entry in its encounter's sandbox.js) or excluded with a reason
//      (sandboxCatalogExclusions in client/encounters/sandbox/catalog.js);
//   2. that check itself, on an encounter made up here;
//   3. every entry has stats in the monster table, a unique id, attacks
//      whose clips it has, and is loaded by the scene with every spot
//      animation its attacks use;
//   4. every entry, placed alone in the Colosseum, starts an attack on the
//      player within 40 ticks of the engine (an animation of it in the
//      tick's events).
// Plain Node with the harness's module hooks and the trimmed cache.
import assert from "node:assert/strict";
import { loadEnvironment } from "../tools/determinism/harness.mjs";
import { findUncataloguedNpcs } from "../tools/sandbox/discover.mjs";

const { engineModule, objTypeLoader, prepareArena } = await loadEnvironment();
const { sandboxNpcCatalog, sandboxCatalogExclusions, sandboxPreloadNpcTypes, sandboxSpotAnimIds } = await import("../client/encounters/sandbox/catalog.js");
const { monsterByNpcTypeId } = await import("../client/data/monsters.js");
const { getMonsterFormulaStats, getMonsterHitpoints } = await import("../client/engine/monsterStats.js");
const { sandboxVariantKind } = await import("../client/encounters/sandbox/arenas.js");
const { presentationBuilders } = await import("../client/encounters/presentations.js");

// 1. Each presentation, built with a stand-in for the scene classes (only its
// render config is read). The sandbox's own, and the test fixture the
// harness's hooks register (test/fixtures/register.mjs), are not read.
class StandInScene {}
const presentations = presentationBuilders.map((build) => build(StandInScene, () => 0, { presentationOf: () => undefined }));
const catalogIds = new Set(sandboxNpcCatalog.map((entry) => entry.npcTypeId));
const { missing, report } = findUncataloguedNpcs({
  presentations,
  catalogIds,
  exclusions: sandboxCatalogExclusions,
  monsterOf: (npcTypeId) => monsterByNpcTypeId.get(npcTypeId),
  skipKinds: (kind) => kind.startsWith("sandbox") || kind === "training_ground",
});
assert.deepEqual(missing, [],
  "NPCs an encounter draws that the sandbox's catalog lacks: give each an entry in its encounter's sandbox.js, " +
  "or a reason in sandboxCatalogExclusions (client/encounters/sandbox/catalog.js)\n" + report.join("\n"));
assert.ok(report.length > catalogIds.size, "the encounters' NPCs were read");

// 2. A made-up encounter that draws an Inferno mager (stats, a clip), a
// monster it excludes, a type the table does not know, and one in the catalog.
const madeUp = findUncataloguedNpcs({
  presentations: [{ kind: "made_up", renderConfig: { preloadNpcTypes: [
    { npcTypeId: 7699, idleSeqId: 7609, attackClips: { magic: 7610 }, deathSeqId: 7613 },
    { npcTypeId: 7697, attackClips: { attack: 7597 } },
    { npcTypeId: 99999, attackClips: { attack: 1 } },
    { npcTypeId: 7691, attackClips: { attack: 7574 } },
  ] } }],
  catalogIds: new Set([7691]),
  exclusions: { 7697: "made-up reason" },
  monsterOf: (id) => monsterByNpcTypeId.get(id),
});
assert.deepEqual(madeUp.missing, [{ npcTypeId: 7699, kind: "made_up" }]);
assert.ok(madeUp.report.some((line) => line.includes("excluded: made-up reason")));
assert.ok(madeUp.report.some((line) => line.includes("no stats")));

// 3.
assert.equal(new Set(sandboxNpcCatalog.map((entry) => entry.id)).size, sandboxNpcCatalog.length, "catalog ids are unique");
assert.ok(sandboxNpcCatalog.length > 0);
for (const entry of sandboxNpcCatalog) {
  assert.ok(getMonsterHitpoints(entry.npcTypeId) > 0 && getMonsterFormulaStats(entry.npcTypeId), `${entry.id}: stats in the monster table`);
  assert.ok(Number.isInteger(entry.size) && entry.size > 0, `${entry.id}: size`);
  assert.ok(entry.attacks.length > 0, `${entry.id}: attacks`);
  for (const attack of entry.attacks) {
    assert.ok(["melee", "range", "magic"].includes(attack.style), `${entry.id}: style`);
    assert.ok(entry.clips[attack.clip] !== undefined, `${entry.id}: clip ${attack.clip}`);
  }
  assert.ok(sandboxPreloadNpcTypes.some((npcType) => npcType.npcTypeId === entry.npcTypeId), `${entry.id}: loaded by the scene`);
  // Every spot animation its attacks fly or draw, a volley's parts included
  // (the manticore's orbs), is loaded by the scene: one that is not is never drawn.
  const chargedOrbs = (attack) => Object.values(attack.chargedVolley?.orbs ?? {}).map((orb) => ({ flight: orb, targetGraphic: { spotAnimId: orb.impactSpotAnimId } }));
  for (const attack of entry.attacks.flatMap((attack) => [attack, ...(attack.volley ?? []), ...chargedOrbs(attack)])) {
    for (const id of [attack.projectile?.spotAnimId, attack.flight?.spotAnimId, attack.targetGraphic?.spotAnimId, ...(attack.parts?.spotAnims.map((part) => part.spotAnimId) ?? []), ...(attack.special?.spotAnimIds ?? [])]) {
      if (id !== undefined) assert.ok(sandboxSpotAnimIds.includes(id), `${entry.id}: spot animation ${id} is loaded by the scene`);
    }
  }
}

// 4.
const kind = sandboxVariantKind("colosseum");
await prepareArena(kind);
for (const entry of sandboxNpcCatalog) {
  const scenario = { arena: "colosseum", mode: "versus", meta: { name: "catalog" }, npcs: [{ id: "probe", npc: entry.id, position: [27, 35] }] };
  const engine = engineModule.createSimulationEngine({
    encounterConfig: { kind, mechanics: { infiniteHealth: true }, options: { scenario } },
    objTypeLoader, combatSeed: 3,
    inventory: engineModule.createEmptyInventory(), equipment: {}, combatSupplies: engineModule.createEmptyCombatSupplies(), attackStylePerCategory: {},
  });
  let attacked = false;
  for (let tick = 0; tick < 40 && !attacked; tick++) {
    engine.advanceTick(engine.player().position);
    attacked = engine.getLastTickEvents().some((event) => event.type === "inferno_visual" && event.animations.some((animation) => animation.actorId === "probe"));
  }
  assert.ok(attacked, `${entry.id}: attacks within 40 ticks`);
}
console.log(`sandbox catalog: ${sandboxNpcCatalog.length} entries, each fought; every monster the encounters draw is in it or excluded`);
process.exit(0);
