// Yama in the sandbox (client/encounters/sandbox/): his catalog entry, in the
// format sandbox/catalog.js describes. His own fight's beats, fireballs and
// flares are the arena's host's (sandbox/encounter.js); his own fight never
// reads this file.
import { yamaNpcTypeId } from "./constants.js";
import { spotAnimIds } from "../../data/spotAnimIds.js";

// The NPC type's own stand and walk; attack and death sequences from his
// render config in client/assets/rendering.js (CACHE).
export const yamaSandboxEntries = [
  {
    id: "yama", name: "Yama", group: "Bosses", npcTypeId: yamaNpcTypeId, size: 5, attackSpeed: 7, // inferred: a beat
    attacks: [
      { style: "melee", range: 1, clip: "default" },
      // boss.js: a windup of 3; the effects on the target are the cache's (spotAnimIds.js).
      { style: "magic", range: 15, clip: "secondary", windupTicks: 3, impactDelayTicks: 1, targetGraphic: { spotAnimId: spotAnimIds.VFX_PLAYER_YAMA_MAGIC_SHADOW_IMPACT01, height: 0 } },
      { style: "range", range: 15, clip: "secondary", windupTicks: 3, impactDelayTicks: 1, targetGraphic: { spotAnimId: spotAnimIds.VFX_PLAYER_YAMA_MAGIC_FIRE_IMPACT01, height: 0 } },
    ],
    deathSeqId: 12161, clips: { default: 12144, secondary: 12146 },
  },
];
