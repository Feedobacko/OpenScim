// The sandbox (client/encounters/sandbox/): its two modes, and each example
// scenario for a few ticks, so that a change of an example, of the catalog
// or of an arena shows here.
import { attack, nearestNpc, rangedGear } from "./common.mjs";

// The player shoots the nearest NPC accepted whenever he has no target.
const shootNearest = (accept) => (tick, api) => {
  if (api.player().attackTarget) return;
  const npc = nearestNpc(api, accept);
  if (npc) attack(api, npc.id);
};
const allies = new Set(["berserker", "archer", "seer"]);

const versus = {
  format: "openscim-sandbox",
  version: 1,
  meta: { name: "Harness: versus" },
  arena: "yama",
  mode: "versus",
  npcs: [
    { id: "nib-1", npc: "inferno.nibbler", position: [29, 30] },
    { id: "nib-2", npc: "inferno.nibbler", position: [33, 30] },
    { id: "bat", npc: "inferno.bat", position: [31, 27], hp: 30, maxHit: 5 },
    { id: "shaman", npc: "colosseum.shaman", position: [25, 33], hp: 40, levels: { magic: 50 } },
  ],
};

// The sandbox's modules reach vendor.js, which Node loads only through the
// harness's module hooks: the list is made once those are in.
export async function scenarios() {
  const { sandboxExamples } = await import("../../../client/encounters/sandbox/examples.js");
  const { sandboxVariantKind } = await import("../../../client/encounters/sandbox/arenas.js");
  const example = (key) => sandboxExamples.find((entry) => entry.key === key).scenario;
  return [
    {
      // Four NPCs walk up and attack; the player shoots them one by one and the run is won.
      name: "sandbox/versus-kill",
      kind: sandboxVariantKind("yama"),
      seed: 21,
      ticks: 90,
      options: { scenario: versus },
      ...rangedGear,
      script: shootNearest(),
    },
    {
      // Every one for itself, the player left out: the monsters fight until one is left.
      name: "sandbox/ffa-spectator",
      kind: sandboxVariantKind("colosseum"),
      seed: 5,
      ticks: 300,
      options: { scenario: example("colosseum-royale") },
    },
    {
      // Teams: the warband on the player's side against an Inferno wave; the player helps.
      name: "sandbox/ffa-allies",
      kind: sandboxVariantKind("colosseum"),
      seed: 9,
      ticks: 200,
      mechanics: { infiniteHealth: true },
      options: { scenario: example("warband-stand") },
      ...rangedGear,
      script: shootNearest((npc) => !allies.has(npc.id)),
    },
    // Each example loads and its NPCs set off.
    ...sandboxExamples.map(({ key, scenario }) => ({
      name: `sandbox/example/${key}`,
      kind: sandboxVariantKind(scenario.arena),
      seed: 3,
      ticks: 12,
      mechanics: { infiniteHealth: true },
      options: { scenario },
    })),
  ];
}
