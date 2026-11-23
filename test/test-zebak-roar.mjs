import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";

import { roarWindupTick } from "../client/toa/zebak/timing.js";

for (const [period, first, second] of [[7,34,29],[6,31,26],[5,29,24]]) {
  assert.equal(roarWindupTick(period), first);
  assert.equal(roarWindupTick(period, true), second);
}

const tiles = new Set();
for (let x = 22; x <= 38; x++)
  for (let y = 24; y <= 40; y++) tiles.add([x, y].join(","));

for (const [playerX, expectedHits] of [[27, 0], [29, 0], [30, 3]]) {
  const events = [];
  const phases = new ZebakPhases(() => 0, () => tiles, (_, event) => events.push(event));
  const player = {alive: true, position: [playerX, 29]};
  const boss = {alive: true, vitals: {hp: 100, maxHp: 100}};
  const splats = [];
  const context = {tick: 0, world: {actors: new Map([["player", player]])}, spawnNpc() {}, despawnNpc() {},
    tickEvents: {emit: event => splats.push(event)}};
  const jug = phases.spawn(context, "jug", 11735, [34, 31], 5);
  phases.depositAcid([34,31]);
  const rock = phases.spawn(context, "rock", 11737, [26, 29], 150);
  phases.active = {kind: "roar", start: 0};
  let hits = 0;
  for (context.tick = 0; context.tick <= 41; context.tick++) {
    hits += phases.step(context, {period: 7, jugWidth: 5}, boss).filter(hit => hit.source === "Great Roar").length;
    if (context.tick === 37) {
      assert.equal(jug.actor.vitals.hp, 0);
      assert.equal(jug.shatterTick, 38);
      assert.equal(rock.actor.vitals.hp, 100);
      assert.ok(phases.acid.has("34,31"));
    }
    if (context.tick === 38) {
      assert.ok(!phases.actors.has(jug.actor.id));
      assert.ok(!phases.acid.has("34,31"));
      assert.equal(phases.splashes.length, 1);
    }
  }
  assert.equal(hits, expectedHits);
  assert.deepEqual(splats.filter(splat => splat.targetId === rock.actor.id).map(splat => splat.amount), [50,50,50]);
  assert.deepEqual(splats.filter(splat => splat.targetId === jug.actor.id).map(splat => splat.amount), [5]);
  assert.deepEqual(events.filter(event => event.roarPulse !== undefined)
    .map(event => event.graphics.map(cue => cue.spotAnimId)), [[], [], [2191]]);
  const pulses = events.filter(event => event.graphics[0]?.spotAnimId === 2184);
  assert.equal(pulses.length, 3);
  for (const pulse of pulses) {
    const byTile = new Map(pulse.graphics.map(cue => [cue.target.position.join(","), cue.delayCycles]));
    assert.equal(byTile.size, tiles.size - 4);
    for (let x = 26; x <= 29; x++) assert.ok(!byTile.has([x,29].join(",")));
    for (let x = 23; x <= 38; x++) assert.ok(byTile.get([x,30].join(",")) > byTile.get([x-1,30].join(",")));
  }
}
console.log("All three roar fronts cover exposed tiles and leave the three shelter tiles clear.");

