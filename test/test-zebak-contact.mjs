import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";

function fixture(size, walkable = []) {
  const tiles = new Set(walkable);
  const phases = new ZebakPhases(() => 0, () => tiles, () => {});
  const boss = {alive: true, vitals: {hp: 90, maxHp: 100}};
  const player = {alive: true, position: [30, 32]};
  const events = [];
  const context = {
    tick: 1, spawnNpc() {}, despawnNpc() {},
    tickEvents: {emit: event => events.push(event)},
    world: {actors: new Map([["player", player], ["zebak", boss]])},
  };
  const clot = phases.spawn(context, "cloud", size === 1 ? 11743 : 11742, [30, 32], 20);
  clot.aggro = true;
  context.tick += 3;
  return {phases, boss, player, clot, context, events};
}

for (const size of [1, 2]) {
  for (const spray of [false, true]) {
    for (let dx = -2; dx <= size + 1; dx++) {
      for (let dy = -2; dy <= size + 1; dy++) {
        const {phases, boss, player, clot, context, events} = fixture(size);
        clot.actor.vitals.hp = 15;
        phases.clouds(context, player);
        player.position = [30 + dx, 32 + dy];
        const adjacent = dx >= -1 && dx <= size && dy >= -1 && dy <= size;
        const hits = phases.resolveCloudContact(context, {spray});
        assert.equal(hits.length, Number(adjacent));
        assert.equal(boss.vitals.hp, 90 + (adjacent ? spray ? 4 : 2 : 0));
        assert.equal(clot.actor.vitals.hp, adjacent ? 17 : 15);
        assert.deepEqual(events, []);
      }
    }
  }
}

const {phases, player, clot, context, events} = fixture(1, ["31,33", "32,34"]);
player.position = [34,36];
function tick() {
  phases.clouds(context, player);
  const move = phases.movementFor(clot.actor)[0];
  if (move) clot.actor.position = move.path[0];
  context.tick++;
  return phases.resolveCloudContact(context, {});
}
assert.deepEqual(tick(), []);
assert.equal(clot.actor.vitals.hp, 20);
assert.deepEqual(tick(), []);
assert.equal(clot.actor.vitals.hp, 18);
assert.deepEqual(tick(), []); // No open tile for the next step.
assert.equal(clot.actor.vitals.hp, 16);
assert.deepEqual(events.map(e => e.amount), [2, 2]);
player.position = [33,34];
assert.equal(tick()[0].baseDamage, 2);
assert.equal(clot.actor.vitals.hp, 18);
tick();
tick();
assert.equal(clot.actor.vitals.hp, 20);
clot.actor.vitals.hp = 2;
clot.actor.position = [30,32];
player.position = [32,34];
assert.deepEqual(tick(), []);
assert.equal(clot.actor.vitals.hp,2);
assert.deepEqual(tick(), []);
assert.equal(phases.of("cloud").length, 0);
console.log("Both cloud footprints passed adjacent, distant, moving, blocked, healing-cap and final-step cases.");

for (const [thinned, maxHp] of [[false,25],[true,30]]) {
  const land = Array.from({length:24},(_,i) => Array.from({length:24},(_,j) => [28+i,23+j].join(","))).flat();
  const {phases, player, context, events, clot} = fixture(1, land);
  phases.remove(context, clot);
  phases.summonClouds(context, {clouds:thinned, cloudCount:thinned ? 3 : 1}, player);
  const clouds = phases.of("cloud");
  assert.equal(clouds.length,thinned ? 3 : 1);
  player.position = [49,24];
  for (const cloud of clouds) assert.deepEqual(cloud.actor.vitals,{hp:maxHp,maxHp});
  const start = context.tick;
  for (let i=1; i<=Math.ceil(maxHp/2)+3; i++) {
    context.tick++;
    phases.clouds(context,player);
    for (const cloud of clouds) {
      const moves=phases.movementFor(cloud.actor);
      if (i<3) assert.deepEqual(moves,[]);
      if (i===3) assert.equal(moves.length,1);
      if (moves.length) cloud.actor.position=moves[0].path[0];
    }
    phases.resolveCloudContact(context,{});
    if (context.tick-start<4) assert.equal(events.filter(e=>e.type==="hitsplat_spawned").length,0);
    if (context.tick-start===4) assert.equal(events.filter(e=>e.type==="hitsplat_spawned").length,clouds.length);
  }
  assert.deepEqual(phases.of("cloud"),[]);
  for (const cloud of clouds) {
    const pulses = events.filter(e=>e.targetId===cloud.actor.id).map(e=>e.amount);
    assert.deepEqual(pulses,thinned ? Array(15).fill(2) : [...Array(12).fill(2),1]);
  }
}
{
  const {phases,player,context,clot} = fixture(1, ["31,32"]);
  context.tick = clot.actor.spawnTick + 1;
  player.position = [31,32];
  phases.clouds(context,player);
  assert.deepEqual(phases.movementFor(clot.actor),[]);
  assert.deepEqual(phases.resolveCloudContact(context,{}).map(hit=>hit.baseDamage),[2]);
}
console.log("Recorded lifetimes passed for normal and thinned clouds.");
