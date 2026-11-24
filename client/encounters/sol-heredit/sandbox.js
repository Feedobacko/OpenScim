// Sol Heredit and his warband in the sandbox (client/encounters/sandbox/):
// their catalog entries, in the format sandbox/catalog.js describes, and
// Sol's regular attack as a sandbox attack of tiles (`special`). His own
// fight never reads this file.
import { buildGroundAttackArea, getGroundAttackDelayCycles } from "./bossAttacks.js";
import {
  colosseumSeqIds,
  colosseumSpotAnimIds,
  warbandProjectileFlights,
  warbandArcherNpcTypeId,
  warbandSeerNpcTypeId,
  warbandBerserkerNpcTypeId,
  solHereditNpcTypeId,
} from "./constants.js";

// Sol Heredit's regular attack, as his own fight makes it (bossAttacks.js,
// scheduleSolAttack; boss.js, tryLaunchSolAttack): a spear or a shield at
// even odds, the first always a spear, the variant alternating when he
// repeats one; the telegraph now, the ground attack three ticks later on the
// tiles that his position and the target's then give (buildGroundAttackArea),
// within 10 tiles of his centre; still for 6 ticks after a spear and 4 after
// a shield; the next attack 7 or 6 ticks later. A target on the tiles takes
// the larger of two rolls of 0 to 44, which no prayer stops (boss.js).
//
// A sandbox `special` (sandbox/brawler.js starts it, sandbox/encounter.js
// lands it): `start` decides as the attack is made, `land` gives the tiles,
// their stomps and the damage as it lands. Both are plain rules: the sandbox
// draws and applies them.
export const solGroundAttack = {
  id: "sol_heredit.ground",
  spotAnimIds: colosseumSpotAnimIds.solMelee,
  start({ actor, random }) {
    const memory = actor.state.solMemory ?? { lastAction: null, lastVariant: 1, attacked: false };
    const style = !memory.attacked || random() < 0.5 ? "spear" : "shield";
    const variant = memory.lastAction !== style ? 1 : memory.lastVariant === 1 ? 2 : 1;
    actor.state.solMemory = { lastAction: style, lastVariant: variant, attacked: true };
    return {
      clipId: style,
      landsInTicks: 3,
      data: { style, variant },
      holdTicks: style === "spear" ? 6 : 4,
      nextActionTicks: style === "spear" ? 7 : 6,
    };
  },
  land({ data, attacker, target, targetAlive, random, isTileWalkable }) {
    const [x, y] = attacker.position;
    const window = { minX: x - 10, maxX: x + 14, minY: y - 10, maxY: y + 14 };
    const area = buildGroundAttackArea(data, { position: attacker.position, target: target?.position ?? [x + 2, y - 1], arena: window });
    const tiles = area.tiles.filter(([tileX, tileY]) => isTileWalkable(tileX, tileY));
    const stomps = tiles.map((tile, index) => ({
      tile,
      spotAnimId: colosseumSpotAnimIds.solMelee[index % colosseumSpotAnimIds.solMelee.length],
      delayCycles: getGroundAttackDelayCycles(tile, area.centre),
    }));
    if (!target || !targetAlive) return { stomps, damage: null };
    const size = target.size ?? 1;
    const struck = tiles.some(([tileX, tileY]) => tileX >= target.position[0] && tileX < target.position[0] + size && tileY >= target.position[1] && tileY < target.position[1] + size);
    if (!struck) return { stomps, damage: null };
    const roll = () => Math.floor(random() * 45);
    return { stomps, damage: Math.max(roll(), roll()) };
  },
};

const warband = (key, npcTypeId, style, range, flight) => ({
  id: `warband.${key}`,
  name: `Fremennik ${key}`,
  group: "Fortis Colosseum",
  npcTypeId,
  size: 1, // CACHE, TABLE
  attackSpeed: 4, // inferred: minions.js
  attacks: [{ style, range, clip: "attack", ...(flight ? { flight } : {}) }],
  idleSeqId: colosseumSeqIds.warband[key].idle,
  deathSeqId: colosseumSeqIds.warband[key].death,
  clips: { attack: colosseumSeqIds.warband[key].attack },
});

// The warband: constants.js.
export const solHereditSandboxEntries = [
  warband("berserker", warbandBerserkerNpcTypeId, "melee", 1),
  warband("archer", warbandArcherNpcTypeId, "range", 10, warbandProjectileFlights.archer),
  warband("seer", warbandSeerNpcTypeId, "magic", 10, warbandProjectileFlights.seer),
  {
    id: "sol_heredit", name: "Sol Heredit", group: "Bosses", npcTypeId: solHereditNpcTypeId, size: 5, attackSpeed: 7, // inferred
    // His triple attack and grapple belong to his phases: only with the
    // arena's host (sandbox/encounter.js).
    attacks: [{ style: "melee", range: 1, clip: "spear", special: solGroundAttack }],
    idleSeqId: colosseumSeqIds.sol.idle, walkSeqId: colosseumSeqIds.sol.walk, deathSeqId: colosseumSeqIds.sol.death,
    clips: { attack: colosseumSeqIds.sol.spearTelegraph, spear: colosseumSeqIds.sol.spearTelegraph, shield: colosseumSeqIds.sol.shieldTelegraph },
  },
];
