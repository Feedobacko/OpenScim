// Everything in the room besides the Doom himself: thrown rocks and the
// rocks they leave, larvae, volatile earth and the earthen shield, acid
// blood. Each piece keeps its own state and is handed the encounter (`doom`)
// for the delve's rules, the random generator and the timer (`doom.later`).
import { CollisionFlag } from "../../engine/collision.js";
import { isArenaTileWalkable } from "../../engine/arena.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { buildActorVisualTarget, healNpc } from "../shared/npcHelpers.js";
import { emitInfernoVisual } from "../inferno/events.js";
import {
  npcTypeIds, seqIds, spotAnims, floor, earthPool, bossSize, bossStart,
  debrisMaxHit, larvaBlastMaxHit, acidDamage, shockwaveDamage,
} from "./delves.js";

const key = ([x, y]) => x + "," + y;
const unkey = (text) => text.split(",").map(Number);
const chebyshev = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
const onFloor = ([x, y]) => x >= floor.minX && x <= floor.maxX && y >= floor.minY && y <= floor.maxY;
const tileTarget = (position) => ({ kind: "tile", position: [...position] });
const graphic = (spotAnimId, position, delayCycles = 0, height = 0) => ({ spotAnimId, target: tileTarget(position), height, delayCycles });
export const inFootprint = (actor, [x, y]) =>
  x >= actor.position[0] && x < actor.position[0] + actor.size && y >= actor.position[1] && y < actor.position[1] + actor.size;
export const bossCentre = (boss) => [boss.position[0] + (bossSize >> 1), boss.position[1] + (bossSize >> 1)];
const projectile = (spotAnimId, from, to, startDelayCycles, endDelayCycles, startHeight, endHeight, slope = 0) => ({
  spotAnimId,
  sourcePosition: [from[0] + 0.5, from[1] + 0.5],
  target: tileTarget(to),
  startDelayCycles,
  endDelayCycles,
  slope,
  startOffset: 0,
  startHeight,
  endHeight,
});

// An NPC of the room that is not in the monster table: stats of its own.
function ownFormulaStats({ defence = 1, magic = 1 } = {}) {
  return {
    burnImmunity: null, freezeResistance: 0, poisonResistance: 100,
    attributes: ["demon"],
    levels: { attack: 1, strength: 1, defence, ranged: 1, magic },
    offensive: { atk: 0, ranged: 0, magic: 0, str: 0, rangedStr: 0, magicStr: 0 },
    defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
  };
}
function roomNpc(definition, { id, npcTypeId, size = 1, position, hp, tick, untargetable = false, overheadPrayers }, state) {
  return definition.createActor(
    {
      id, kind: "npc", role: "minion", npcTypeId, archetypeId: id.replace(/-\d+$/, ""), size, alive: true,
      position: [...position], previousPosition: [...position], facing: 0, history: new Map(),
      vitals: { hp, maxHp: hp }, formulaStats: ownFormulaStats(), spawnTick: tick,
      ...(untargetable ? { untargetable: true } : {}),
      ...(overheadPrayers ? { overheadPrayers } : {}),
      blocksNpcMovement: false,
      combat: { attackSpeed: 4, attackRange: 0, attackStyle: "typeless", nextActionTick: Infinity, targetId: null, lastAttackTick: null,
        animations: { idle: null, walk: null, run: null, attack: null, death: null } },
    },
    state,
  );
}
function animate(context, actorId, clipId, graphics = [], projectiles = []) {
  emitInfernoVisual(context.tickEvents, { animations: actorId ? [{ actorId, clipId, delayCycles: 0 }] : [], projectiles, graphics });
}

// Killed by a punish (within a tick of it), seven drops of holy water fall
// from above his centre, one a tick, on tiles 2 to 4 from it, each with a
// shadow first and a splash (captured: 192, 1446, 68). The player gets 25%
// special energy at once, then 4 hitpoints and about 3 prayer points as each
// drop lands (captured: +28 and +19 to 20 over the seven); each landing
// clears acid in a 3x3 (wiki).
const holyWaterPrayer = 20;
export function holyWater(doom, context) {
  const player = context.world.getPlayer();
  player.specialAttack.energy = Math.min(100, player.specialAttack.energy + 25);
  const centre = [bossStart[0] + (bossSize >> 1), bossStart[1] + (bossSize >> 1)];
  const tiles = [];
  for (let dx = -4; dx <= 4; dx++) for (let dy = -4; dy <= 4; dy++) if (Math.max(Math.abs(dx), Math.abs(dy)) >= 2) tiles.push([centre[0] + dx, centre[1] + dy]);
  const graphics = [];
  const projectiles = [];
  for (let drop = 0; drop < 7; drop++) {
    const [tile] = tiles.splice(Math.floor(doom.random() * tiles.length), 1);
    projectiles.push(projectile(spotAnims.holyWater, centre, tile, 0, 30 * (drop + 1), 600, 0, 10));
    graphics.push(graphic(spotAnims.holyWaterShadow, tile, 30 * drop), graphic(spotAnims.holyWaterSplash, tile, 30 * (drop + 1)));
    const prayer = Math.floor(((drop + 1) * holyWaterPrayer) / 7) - Math.floor((drop * holyWaterPrayer) / 7);
    doom.later(drop + 1, (ctx) => {
      const you = ctx.world.getPlayer();
      if (!you.alive) return;
      you.vitals.hp = Math.min(you.vitals.maxHp, you.vitals.hp + 4);
      you.prayerState.points = Math.min(you.prayerState.maxPoints, you.prayerState.points + prayer);
      doom.acid.clearAround(tile);
    });
  }
  animate(context, null, null, graphics, projectiles);
}

// --- rocks ------------------------------------------------------------------

// A thrown rock lands beside the Doom, towards the player, and bursts into
// pieces: one on the player's tile, the rest within four tiles. The player's
// protection prayers go off. Three ticks later a rock stands on the marked
// tile (a player there is pushed aside), a player on any piece is hit for up
// to 21, and the rock's orbs leave from the pieces, a tick apart, alternating
// styles (captured; the wiki agrees on what, not when).
export class Rocks {
  standing = new Set();
  inAir = 0;
  orbsLandAt = 0;
  collision = null; // set by the encounter's refineArenaConfig
  constructor(doom) {
    this.doom = doom;
  }
  reset() {
    for (const tile of this.standing) this.collision?.unflag(...unkey(tile), CollisionFlag.OBJECT);
    this.standing.clear();
    this.inAir = 0;
    this.orbsLandAt = 0;
  }
  has(tile) {
    return this.standing.has(key(tile));
  }
  throw(context) {
    const doom = this.doom;
    const style = doom.random() < 0.5 ? "range" : "magic";
    const throwOne = (ctx, index) => {
      const boss = doom.boss(ctx.world);
      if (!boss?.alive) return;
      const at = this.burstTile(boss, ctx.world.getPlayer().position);
      animate(ctx, boss.id, "rockThrow", [], [projectile(spotAnims.rockLaunch[style], bossCentre(boss), at, 60, 210, 340, 500, 50)]);
      this.inAir++;
      doom.later(doom.rules.rockBurstTicks, (later) => this.burst(at, style, later, index));
    };
    throwOne(context, 0);
    // Delve 8: a second, identical rock (a guess: 3 ticks later).
    if (doom.rules.rocks > 1) doom.later(3, (ctx) => throwOne(ctx, 1));
  }
  burstTile(boss, playerTile) {
    const centre = bossCentre(boss);
    const dx = playerTile[0] - centre[0];
    const dy = playerTile[1] - centre[1];
    const far = Math.max(Math.abs(dx), Math.abs(dy));
    const reach = (bossSize >> 1) + 1;
    if (far === 0) return [centre[0], centre[1] - reach];
    return [centre[0] + Math.round((dx * reach) / far), centre[1] + Math.round((dy * reach) / far)];
  }
  burst(at, style, context, index) {
    const doom = this.doom;
    const marked = [...context.world.getPlayer().position];
    // Delve 8: the second rock's debris never falls on the first's (wiki).
    const avoid = index === 1 ? this.firstPieces : undefined;
    const pieces = [marked, ...this.debrisTiles(marked, doom.rules.rockPieces - 1, avoid)];
    if (doom.rules.rocks > 1 && index === 0) this.firstPieces = new Set(pieces.map(key));
    const ends = pieces.map((tile) => 60 + 3 * chebyshev(at, tile));
    animate(context, null, null, [graphic(spotAnims.rockSplit[style], at), ...pieces.map((tile) => graphic(spotAnims.debrisShadow, tile))],
      pieces.map((tile, piece) => projectile(spotAnims.debris[piece % spotAnims.debris.length], at, tile, 0, ends[piece], 500, 0)));
    doom.pendingDamages.push({ baseDamage: 0, attackType: "typeless", source: "Rock", playerPosition: marked, disablesProtectionPrayersForTicks: 1 });
    doom.later(2, (ctx) => animate(ctx, null, null, pieces.map((tile, piece) => graphic(spotAnims.debrisImpact, tile, Math.max(0, ends[piece] - 60)))));
    doom.later(3, (ctx) => this.land(marked, pieces, style, ctx, index));
  }
  debrisTiles(centre, count, avoid = new Set()) {
    const taken = new Set([key(centre), ...avoid]);
    const tiles = [];
    for (let attempt = 0; attempt < 120 && tiles.length < count; attempt++) {
      const tile = [centre[0] + this.doom.randomInt(-4, 4), centre[1] + this.doom.randomInt(-4, 4)];
      if (taken.has(key(tile)) || !onFloor(tile) || this.has(tile)) continue;
      taken.add(key(tile));
      tiles.push(tile);
    }
    return tiles;
  }
  land(marked, pieces, style, context, index) {
    const doom = this.doom;
    this.inAir = Math.max(0, this.inAir - 1);
    const here = context.world.getPlayer().position;
    if (pieces.some((tile) => key(tile) === key(here))) {
      doom.pendingDamages.push({ baseDamage: [0, debrisMaxHit], attackType: "typeless", source: "Rock", playerPosition: [...here] });
    }
    this.place(marked);
    if (key(here) === key(marked)) {
      const aside = this.freeNeighbours(marked);
      if (aside.length) context.teleportPlayer(aside[Math.floor(doom.random() * aside.length)]);
    }
    // Delve 8: two identical rock throws (wiki), each sending its own set as a single throw does.
    // ponytail: the 3 ticks between the throws is a guess (TSPS's), not captured; a delve 8 observer log would settle it.
    const orbs = doom.rules.rockOrbs;
    const sources = pieces.filter((tile) => key(tile) !== key(marked));
    const player = context.world.getPlayer();
    const boss = doom.boss(context.world);
    for (let orb = 0, current = style; orb < orbs && boss?.alive; orb++, current = current === "range" ? "magic" : "range") {
      const from = sources.length ? sources.splice(Math.floor(doom.random() * sources.length), 1)[0] : marked;
      const end = doom.rules.rockOrbFirstCycles + 30 * orb;
      const impactDelayTicks = Math.ceil(end / 30);
      context.queueNpcHit(doom.rollOrb(boss, player, current, { impactDelayTicks }));
      // The orb follows the player, as the boss's own do.
      // From delve 7 each leaves a tick after the last on the same short flight, so all are fast (wiki: "extremely
      // fast"; player report: three fast ones, then the second rock's three the tick after). Before, they leave together.
      const start = doom.rules.delve >= 7 ? 30 * orb : 0;
      animate(context, null, null, [], [{ ...projectile(spotAnims.orb[current], from, player.position, start, end, 100, 100), target: buildActorVisualTarget(player) }]);
      doom.orbImpact(current, impactDelayTicks);
      this.orbsLandAt = Math.max(this.orbsLandAt, context.tick + impactDelayTicks);
    }
  }
  place(tile) {
    if (this.has(tile)) return;
    this.standing.add(key(tile));
    this.collision?.flag(...tile, CollisionFlag.OBJECT);
    this.doom.acid.clear(tile);
  }
  freeNeighbours([x, y]) {
    const tiles = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const tile = [x + dx, y + dy];
        if ((dx || dy) && onFloor(tile) && !this.has(tile)) tiles.push(tile);
      }
    return tiles;
  }
}

// --- larvae -----------------------------------------------------------------

// Larvae drop about four tiles past the player, away from the Doom (during
// his shield, from his north-west), and crawl a tile every two ticks to his
// centre. Reaching it, the larva charge goes up by one: the player takes the
// charge (at most 12) and the Doom heals 9 plus it. They have 2 hitpoints and
// take 1 a hit, except from demonbane; one praying against the attack's style
// takes nothing. Killed, a larva bursts over its 3x3: up to 21 to the player,
// or, if the Doom is caught, 5-10 to him (100 to his shield) and not the player.
// Prayers: half pray Melee at delves 1-2, any one of the three at delve 3
// (captured). From delve 4 they are coloured: green (ranged), blue (magic)
// and, only during the shield, red (melee), each taking only its own style
// (wiki). Every larva, red ones too, steps 1 tick after it lands, then
// every 2 ticks (captured: 30 larvae, 230 steps).
// ponytail: larvae walking around rocks.
const larvaDefinition = defineNpc({
  id: "doom-larva",
  move: ({ actor, context, config }) => config.larvae.step(actor, context),
  tick: ({ actor, context, config }) => ({ environmentalDamages: config.larvae.reach(actor, context) }),
});
const larvaHitpoints = 2;
const larvaReachCap = 12;
const larvaHeal = 9;
const larvaStepTicks = 2;

export class Larvae {
  definition = larvaDefinition;
  constructor(doom) {
    this.doom = doom;
  }
  reset() {
    this.count = 0;
    this.charge = 0; // carries over between delves in the game; one delve here
  }
  isLarva(npc) {
    return larvaDefinition.isActor(npc);
  }
  spawn(context, { duringShield = false } = {}) {
    const doom = this.doom;
    const boss = doom.boss(context.world);
    const tile = duringShield ? this.northWestTile(boss) : this.pastPlayerTile(boss, context.world.getPlayer().position);
    if (!tile) return;
    const { npcTypeId, prayer = null, style = null } = this.kind(duringShield);
    const id = "doom-larva-" + this.count++;
    // Overhead: the prayer a plain larva uses, or the two a coloured one's style leaves (captured: one combined icon).
    const overheadPrayers = prayer ? [prayer] : style ? ["melee", "range", "magic"].filter((other) => other !== style) : undefined;
    context.spawnNpc(roomNpc(larvaDefinition, { id, npcTypeId, position: tile, hp: larvaHitpoints, tick: context.tick, overheadPrayers }, { prayer, style, movedAt: context.tick - 1 }));
    animate(context, id, "spawn", [graphic(spotAnims.larvaSpawn, tile)]);
  }
  // A plain larva with the prayer it uses, or a coloured one with the style it takes.
  kind(duringShield) {
    const doom = this.doom;
    if (doom.rules.delve <= 2) return { npcTypeId: npcTypeIds.larva, prayer: doom.random() < 0.5 ? "melee" : null };
    if (doom.rules.delve === 3) return { npcTypeId: npcTypeIds.larva, prayer: ["melee", "range", "magic"][doom.randomInt(0, 2)] };
    const styles = duringShield ? ["range", "magic", "melee"] : ["range", "magic"];
    const style = styles[doom.randomInt(0, styles.length - 1)];
    return { npcTypeId: { range: npcTypeIds.rangedLarva, magic: npcTypeIds.magicLarva, melee: npcTypeIds.meleeLarva }[style], style };
  }
  pastPlayerTile(boss, playerTile) {
    const centre = bossCentre(boss);
    const dx = Math.sign(playerTile[0] - centre[0]);
    const dy = Math.sign(playerTile[1] - centre[1]);
    for (let attempt = 0; attempt < 40; attempt++) {
      const reach = this.doom.randomInt(3, 5);
      const side = this.doom.randomInt(-2, 2);
      const tile = attempt < 30 && (dx || dy)
        ? [playerTile[0] + dx * reach + (dx === 0 ? side : 0), playerTile[1] + dy * reach + (dy === 0 ? side : 0)]
        : [playerTile[0] + this.doom.randomInt(-4, 4), playerTile[1] + this.doom.randomInt(-4, 4)];
      if (onFloor(tile) && !this.doom.rocks.has(tile) && chebyshev(tile, centre) > 3) return tile;
    }
    return null;
  }
  northWestTile(boss) {
    const centre = bossCentre(boss);
    for (let attempt = 0; attempt < 20; attempt++) {
      const reach = this.doom.randomInt(7, 9);
      const tile = [centre[0] - reach, centre[1] + reach + this.doom.randomInt(-2, 2)];
      if (onFloor(tile) && !this.doom.rocks.has(tile)) return tile;
    }
    return [floor.minX + 1, floor.maxY - 1];
  }
  step(larva, context) {
    const boss = this.doom.boss(context.world);
    if (!larva.alive || !boss?.alive || context.tick - larva.state.movedAt < larvaStepTicks) return [];
    larva.state.movedAt = context.tick;
    const centre = bossCentre(boss);
    const next = [larva.position[0] + Math.sign(centre[0] - larva.position[0]), larva.position[1] + Math.sign(centre[1] - larva.position[1])];
    // A crawl: the tile drawn over its 2 ticks, so it keeps moving rather than stepping and waiting (game: NPC crawl).
    return [{ npcId: larva.id, path: [next], movementSpeed: "crawl" }];
  }
  // Into the Doom: the charge, the player's hit and his heal.
  reach(larva, context) {
    const boss = this.doom.boss(context.world);
    if (!larva.alive || !boss?.alive || !inFootprint(boss, larva.position)) return [];
    context.despawnNpc(larva.id);
    this.charge++;
    animate(context, null, null, [{ spotAnimId: spotAnims.larvaImpact, target: buildActorVisualTarget(context.world.getPlayer()), height: 0, delayCycles: 0 }]);
    healNpc(boss, larvaHeal + this.charge, context.tickEvents);
    return [{ baseDamage: Math.min(this.charge, larvaReachCap), attackType: "typeless", source: "Demonic larva", playerPosition: [...context.world.getPlayer().position] }];
  }
  // A hit on a larva: nothing through its prayer (a coloured one prays the
  // other two styles), 1 unless demonbane.
  damage(larva, damage, attack, demonbane) {
    const { prayer, style } = larva.state;
    if ((prayer && prayer === attack.style) || (style && style !== attack.style)) return 0;
    return demonbane ? damage : Math.min(1, damage);
  }
  killed(larva, context) {
    const doom = this.doom;
    const [x, y] = larva.position;
    const blast = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) blast.push([x + dx, y + dy]);
    animate(context, null, null, blast.map((tile) => graphic(spotAnims.larvaBlast, tile)));
    const boss = doom.boss(context.world);
    if (boss?.alive && blast.some((tile) => inFootprint(boss, tile))) {
      if (doom.shield.up) doom.shield.hit(100, context);
      else {
        doom.hitBoss(boss, doom.randomInt(5, 10), context);
        doom.acid.spray(boss, context);
      }
      return;
    }
    if (doom.shield.up) doom.shield.store();
    if (blast.some((tile) => key(tile) === key(context.world.getPlayer().position))) {
      doom.pendingDamages.push({ baseDamage: [0, larvaBlastMaxHit], attackType: "typeless", source: "Larva blast", playerPosition: [...context.world.getPlayer().position] });
    }
  }
}

// --- volatile earth, the earthen shield and the shockwave -------------------

// Volatile earth comes up on 19-28 tiles of the captured pool, 79-96 ticks
// into the fight and every 100 after (a guess). The Doom attacks for 15 ticks
// more, then charges: a slam at 19, landing at 21 and every 2 ticks after
// for each further shockwave (26-42 each) on anyone outside the earthen
// shield. The second earth destroyed brings the shield (3x3) on its tile; it
// walks to the first, diagonally first, and its centre clears acid. It goes
// when it arrives or the shockwaves end.
const idle = () => ({ environmentalDamages: [] });
const earthDefinition = defineNpc({ id: "doom-volatile-earth", move: false, tick: idle });
const earthenShieldDefinition = defineNpc({
  id: "doom-earthen-shield",
  move: ({ actor, context, config }) => config.shockwave.walk(actor, context),
  tick: idle,
});
const wave = { charge: 15, loop: 17, slam: 19, lands: 21, between: 2 };

export class Shockwave {
  constructor(doom) {
    this.doom = doom;
  }
  reset() {
    this.active = null; // { at }
    this.nextAt = Infinity;
    this.earth = new Set();
    this.destroyed = [];
    this.shieldTile = null; // the shield NPC's destination
    this.count = 0;
  }
  start(context) {
    const doom = this.doom;
    this.active = { at: context.tick };
    const boss = doom.boss(context.world);
    const free = earthPool.filter((tile) => !doom.rocks.has(tile) && !inFootprint(boss, tile));
    const count = Math.min(free.length, doom.randomInt(19, 28));
    for (let picked = 0; picked < count; picked++) {
      const [tile] = free.splice(Math.floor(doom.random() * free.length), 1);
      const id = "doom-earth-" + this.count++;
      context.spawnNpc(roomNpc(earthDefinition, { id, npcTypeId: npcTypeIds.volatileEarth, position: tile, hp: 1, tick: context.tick }, {}));
      this.earth.add(id);
      animate(context, id, "spawn");
    }
    const at = context.tick;
    const shockwaves = doom.rules.shockwaves;
    const last = wave.lands + (shockwaves - 1) * wave.between;
    doom.later(wave.charge, (ctx) => animate(ctx, "doom", "areaCharge"));
    doom.later(wave.loop, (ctx) => animate(ctx, "doom", "areaLoop"));
    doom.later(wave.slam, (ctx) => animate(ctx, "doom", "areaSlam", [{ spotAnimId: spotAnims.areaSlam, target: buildActorVisualTarget(doom.boss(ctx.world)), height: 0, delayCycles: 0 }]));
    for (let index = 0; index < shockwaves; index++) doom.later(wave.lands + index * wave.between, (ctx) => this.land(ctx));
    doom.later(last, (ctx) => animate(ctx, "doom", "areaReturn"));
    doom.later(last + 1, (ctx) => {
      this.active = null;
      this.nextAt = ctx.tick + 100;
      doom.nextAt = Math.max(doom.nextAt, ctx.tick);
    });
    doom.later(last + 3, (ctx) => this.clear(ctx));
    return at;
  }
  // The Doom keeps attacking until the charge.
  holdsAttacks(tick) {
    return this.active !== null && tick >= this.active.at + wave.charge;
  }
  land(context) {
    // Captured: a slam on every floor tile 2 to 12 tiles from his centre, a cycle later
    // for each tile further out; which of the three looks random (here a hash of the tile).
    const centre = [bossStart[0] + (bossSize >> 1), bossStart[1] + (bossSize >> 1)];
    const graphics = [];
    for (let x = floor.minX; x <= floor.maxX; x++)
      for (let y = floor.minY; y <= floor.maxY; y++) {
        const ring = chebyshev([x, y], centre);
        if (ring >= 2 && ring <= 12 && isArenaTileWalkable(x, y)) graphics.push(graphic(spotAnims.floorSlam[(x * 5 + y * 3 + context.tick) % 3], [x, y], ring - 2));
      }
    animate(context, null, null, graphics);
    if (this.sheltered(context)) return;
    this.doom.pendingDamages.push({ baseDamage: shockwaveDamage, attackType: "typeless", source: "Shockwave", playerPosition: [...context.world.getPlayer().position] });
  }
  sheltered(context) {
    const shield = context.world.getNpc("doom-earthen-shield");
    return Boolean(shield?.alive && inFootprint(shield, context.world.getPlayer().position));
  }
  earthDestroyed(earth, context) {
    this.earth.delete(earth.id);
    if (this.shieldTile || !this.active) return;
    this.destroyed.push([...earth.position]);
    if (this.destroyed.length < 2) return;
    const [destination, from] = this.destroyed;
    this.shieldTile = destination;
    context.spawnNpc(roomNpc(earthenShieldDefinition, {
      id: "doom-earthen-shield", npcTypeId: npcTypeIds.earthenShield, size: 3, position: [from[0] - 1, from[1] - 1], hp: 1, tick: context.tick, untargetable: true,
    }, { movedAt: context.tick }));
    animate(context, "doom-earthen-shield", "spawn");
    for (const id of this.earth) this.removeLater(id, context, 2, "death");
    this.earth.clear();
  }
  walk(shield, context) {
    const centre = [shield.position[0] + 1, shield.position[1] + 1];
    this.doom.acid.clear(centre);
    if (key(centre) === key(this.shieldTile)) {
      context.despawnNpc(shield.id);
      this.shieldTile = null;
      return [];
    }
    if (context.tick - shield.state.movedAt < this.doom.rules.earthenShieldStepTicks) return [];
    shield.state.movedAt = context.tick;
    const next = [shield.position[0] + Math.sign(this.shieldTile[0] - centre[0]), shield.position[1] + Math.sign(this.shieldTile[1] - centre[1])];
    return [{ npcId: shield.id, path: [next] }];
  }
  removeLater(id, context, ticks, clipId) {
    if (clipId) animate(context, id, clipId);
    this.doom.later(ticks, (ctx) => ctx.world.getNpc(id) && ctx.despawnNpc(id));
  }
  clear(context) {
    for (const id of this.earth) if (context.world.getNpc(id)) context.despawnNpc(id);
    this.earth.clear();
    this.destroyed = [];
    if (context.world.getNpc("doom-earthen-shield")) context.despawnNpc("doom-earthen-shield");
    this.shieldTile = null;
  }
  get definitions() {
    return [earthDefinition, earthenShieldDefinition];
  }
}

// --- acid blood (delve 3+) --------------------------------------------------

// Each delve the acid goes one way from the Doom. Every hit on him sends a
// blob to the tile just past his edge that way, plus one more at delve 3 (2-6
// out, up to 2 to the side), two from delve 4 and three from 8 (1-9 out, up to
// 4 to the side); a pool forms where each lands. Standing in one hurts 3-7 a
// tick. None while he is shielded. Rocks cover acid. ponytail: the venom.
export class Acid {
  pools = new Set();
  constructor(doom) {
    this.doom = doom;
  }
  reset() {
    this.pools.clear();
    this.direction = [[0, 1], [1, 0], [0, -1], [-1, 0]][this.doom.randomInt(0, 3)];
  }
  spray(boss, context) {
    const doom = this.doom;
    if (!doom.rules.acid || doom.shield.up) return;
    const [dx, dy] = this.direction;
    const centre = bossCentre(boss);
    const offsets = [[3, 0]];
    for (let blob = 0; blob < doom.rules.acidExtraBlobs; blob++) {
      offsets.push(doom.rules.delve === 3 ? [doom.randomInt(2, 6), doom.randomInt(-2, 2)] : [doom.randomInt(1, 9), doom.randomInt(-4, 4)]);
    }
    const projectiles = [];
    const splats = [];
    for (const [out, side] of offsets) {
      const tile = [centre[0] + dx * out + (dx === 0 ? side : 0), centre[1] + dy * out + (dy === 0 ? side : 0)];
      if (!onFloor(tile) || inFootprint(boss, tile)) continue;
      const end = 15 + 3 * chebyshev(centre, tile);
      projectiles.push(projectile(spotAnims.acidBlob, centre, tile, 0, end, 100, 0));
      // Captured: any of the four splats (_N, _E, _S, _W), whatever the direction; here a hash of the tile.
      splats.push(graphic(spotAnims.acidSplat[(tile[0] * 5 + tile[1] * 3 + context.tick) % 4], tile, end));
      doom.later(Math.ceil(end / 30), () => !doom.rocks.has(tile) && this.pools.add(key(tile)));
    }
    animate(context, null, null, splats, projectiles);
  }
  // Every tick: standing in acid.
  hurt(context) {
    if (!this.pools.has(key(context.world.getPlayer().position))) return [];
    return [{ baseDamage: acidDamage, attackType: "typeless", source: "Acid blood", playerPosition: [...context.world.getPlayer().position] }];
  }
  clear(tile) {
    this.pools.delete(key(tile));
  }
  clearAround([x, y]) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.pools.delete(key([x + dx, y + dy]));
  }
  tiles() {
    return [...this.pools].map(unkey);
  }
}

export const roomDefinitions = [larvaDefinition, earthDefinition, earthenShieldDefinition];
