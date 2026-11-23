// Vardorvis (client/encounters/vardorvis/). He starts at 40,26 with 700
// hitpoints, the player at 41,22; he waits until he is attacked.
import { attack, command, item, meleeGear, offensive, protect, setBossHp, use } from "./common.mjs";

const KIND = "vardorvis";
const BOSS = "vardorvis";
const centre = [41, 26];

// Slash: his defence against it is +65, against stab +215.
const scytheGear = { equipment: { ...meleeGear.equipment, weapon: item.scytheOfVitur, shield: undefined } };

// The arena inside the barrier, less its pillars.
const pillars = new Set(["36,28", "39,21", "43,21", "43,31", "46,28", "46,24", "36,24", "39,31"]);
const arena = [];
for (let x = 36; x <= 46; x++) for (let y = 21; y <= 31; y++) if (!pillars.has(x + "," + y)) arena.push([x, y]);

// The tiles the axes still to come will cut: from a tendril, the axe's lane
// from one tile in (it cuts there as it is thrown); from an axe, the rest of
// it. Both head for the centre, so a lane follows from where it starts.
function sweptTiles(api) {
  const swept = new Set();
  for (const npc of api.npcs()) {
    const tendril = npc.id.startsWith("vardorvis-tendril-"), axe = npc.id.startsWith("vardorvis-axe-");
    if (!tendril && !axe) continue;
    const [x, y] = npc.position;
    const moved = npc.previousPosition && (npc.previousPosition[0] !== x || npc.previousPosition[1] !== y);
    const dir = axe && moved
      ? [Math.sign(x - npc.previousPosition[0]), Math.sign(y - npc.previousPosition[1])]
      : [Math.sign(centre[0] - (x + 1)), Math.sign(centre[1] - (y + 1))];
    for (let k = tendril ? 1 : 0; k <= 9; k++)
      for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) swept.add(x + dir[0] * k + dx + "," + (y + dir[1] * k + dy));
  }
  return swept;
}

// Super restore (4) to (1).
const restores = new Set([3024, 3026, 3028, 3030]);

// A player who steps out of the axes' lanes and fights between them, drinks
// a restore when Prayer runs low, and clicks a strangle's spores away on the
// tick after the hold (OBS: three in one tick), as the overlay shows them
// (the encounter's snapshot).
function dodgeAndFight(api) {
  const player = api.player();
  const strangle = api.engine.getEncounterSnapshot().state.strangle;
  if (strangle?.endTick === null && api.engine.currentTick >= strangle.holdTick)
    strangle.spores.forEach((s, spore) => s.destroyedTick === null && command(api, { encounter: KIND, type: "destroy-spore", spore }));
  const restore = player.inventory.findIndex((slot) => restores.has(slot?.id));
  if (player.prayerState.points < 30 && restore >= 0) use(api, restore);
  const swept = sweptTiles(api);
  const [px, py] = player.position;
  if (!swept.has(px + "," + py)) {
    if (player.attackTarget !== BOSS) attack(api, BOSS);
    return;
  }
  const safe = arena.filter((tile) => !swept.has(tile.join(",")));
  const distance = ([x, y]) => Math.max(Math.abs(x - px), Math.abs(y - py)) * 100 + x * 10 + y; // ties by tile
  const tile = safe.sort((a, b) => distance(a) - distance(b))[0];
  if (!tile) return;
  if (player.attackTarget !== null) attack(api, null);
  api.moveTo(...tile);
}

export const scenarios = [
  {
    // Melee under Protect from Melee and Piety, out of the axes' way, with
    // restores and health that does not run out: slashes, axes and the bleed, his
    // healing, the head and the darts below 570, and his death.
    name: "vardorvis/kill",
    kind: KIND,
    seed: 3,
    ticks: 400,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    inventory: Array(8).fill(item.superRestore),
    script(tick, api) {
      if (tick === 1) protect(api, "ProtectMelee");
      if (tick === 1) offensive(api, "Piety");
      if (tick >= 1) dodgeAndFight(api);
    },
  },
  {
    // At 200 hitpoints he is enraged: three axes every 8 ticks, a head with
    // each set, darts. The player stands in melee without a prayer, so the
    // head's gaze drains prayer and turns the overheads off.
    name: "vardorvis/enraged",
    kind: KIND,
    seed: 11,
    ticks: 120,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 200);
      if (tick === 2) attack(api, BOSS);
    },
  },
  {
    // The awakened fight, the dodging player of vardorvis/kill (he outlasts
    // it): axes every 8 ticks, tendrils that hit as they rise, the bigger
    // bleed, spikes and strangle, magic heads.
    name: "vardorvis/awakened-fight",
    kind: "vardorvis_awakened",
    seed: 5,
    ticks: 400,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    inventory: Array(8).fill(item.superRestore),
    script(tick, api) {
      if (tick === 1) protect(api, "ProtectMelee");
      if (tick === 1) offensive(api, "Piety");
      if (tick >= 1) dodgeAndFight(api);
    },
  },
  {
    // Awakened, below half: the head's pair of a magic and a ranged
    // projectile, a tick apart; four axes a set. The player stands in melee.
    name: "vardorvis/awakened-enraged",
    kind: "vardorvis_awakened",
    seed: 12,
    ticks: 120,
    mechanics: { infiniteHealth: true },
    ...scytheGear,
    script(tick, api) {
      if (tick === 1) setBossHp(api, 400);
      if (tick === 2) attack(api, BOSS);
    },
  },
];
