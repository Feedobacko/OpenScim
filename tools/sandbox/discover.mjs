// The NPCs the encounters draw that the sandbox's catalog does not hold:
// test/test-sandbox-catalog.mjs fails while there is one, so a new
// encounter's monsters reach the sandbox (an entry in the encounter's own
// sandbox.js) or are left out with a reason (sandboxCatalogExclusions in
// client/encounters/sandbox/catalog.js).
//
// findUncataloguedNpcs({ presentations, catalogIds, exclusions, monsterOf, skipKinds })
//   presentations  [{ kind, renderConfig: { preloadNpcTypes } }]
//   catalogIds     the NPC type ids the catalog holds
//   exclusions     { npcTypeId: reason }
//   monsterOf(id)  the monster table's entry (client/data/monsters.js)
//   skipKinds(kind)  true for presentations not to read
// Returns { missing, report }: the NPC types to add, as { npcTypeId, kind },
// and one line per NPC type found saying where it stands. An NPC without
// stats in the monster table, or without an attack clip in the render config
// that draws it, is not a monster to place: it is not asked for.

export function findUncataloguedNpcs({ presentations, catalogIds, exclusions, monsterOf, skipKinds = () => false }) {
  const found = new Map();
  for (const presentation of presentations) {
    if (skipKinds(presentation.kind)) continue;
    for (const npcType of presentation.renderConfig?.preloadNpcTypes ?? []) {
      if (!found.has(npcType.npcTypeId)) found.set(npcType.npcTypeId, { kind: presentation.kind, npcType });
    }
  }
  const missing = [];
  const report = [];
  for (const [npcTypeId, { kind, npcType }] of [...found].sort(([a], [b]) => a - b)) {
    let fate;
    if (catalogIds.has(npcTypeId)) fate = "in the catalog";
    else if (exclusions[npcTypeId]) fate = "excluded: " + exclusions[npcTypeId];
    else if (!monsterOf(npcTypeId)?.levels?.hitpoints) fate = "not a monster: no stats in the monster table";
    else if (Object.keys(npcType.attackClips ?? {}).length === 0) fate = "not a monster: no attack clip in its render config";
    else {
      fate = "MISSING";
      missing.push({ npcTypeId, kind });
    }
    report.push(`${String(npcTypeId).padStart(6)}  ${kind.padEnd(26)} ${fate}`);
  }
  return { missing, report };
}
