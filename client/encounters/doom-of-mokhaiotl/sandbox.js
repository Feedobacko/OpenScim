// The Doom of Mokhaiotl in the sandbox (client/encounters/sandbox/): his
// catalog entry, in the format sandbox/catalog.js describes. His larvae are
// not in TABLE, so they are left out. His own fight never reads this file.
import { npcTypeIds, seqIds, spotAnims } from "./delves.js";

// encounter.js: an orb leaves after 55 cycles; it lands after four ticks
// (inferred: the Doom's own lands by the distance).
const doomOrb = (spotAnimId) => ({ spotAnimId, startDelayCycles: 55, endDelayCycles: 120, slope: 30, startOffset: 0, startHeight: 200, endHeight: 100 });

export const doomSandboxEntries = [
  {
    id: "doom", name: "Doom of Mokhaiotl", group: "Bosses", npcTypeId: npcTypeIds.doom, size: 5, attackSpeed: 6, // inferred
    attacks: [
      { style: "melee", range: 1, clip: "tongue" },
      { style: "magic", range: 20, clip: "orb", flight: doomOrb(spotAnims.orb.magic) },
      { style: "range", range: 20, clip: "orb", flight: doomOrb(spotAnims.orb.range) },
    ],
    idleSeqId: seqIds.idle, deathSeqId: seqIds.despawn, clips: { tongue: seqIds.tongue, orb: seqIds.orb },
  },
];
