import assert from "node:assert/strict";
import {zebakDefinition} from "../client/toa/zebak/native.js";
import {ZebakPhases} from "../client/toa/zebak/phases.js";

for (const direction of [-1, 1]) {
  const rolls = [0.5, 0.01, 0.5, 0.99];
  const phases = new ZebakPhases(() => rolls.shift(), () => new Set(), () => {});
  for (const x of [22, 23, 24, 28, 39]) phases.depositAcid([x, 32]);
  phases.depositAcid([22, 33]);
  for (let pass = 1; pass <= 3; pass++) {
    const startTick = 7 * pass;
    phases.waveFronts = [{startTick, direction, gap: 28, gapWidth: 3, actors: []}];
    const context = {tick: startTick + 12};
    phases.advanceWaveFronts(context);
    phases.advanceWaveFronts(context);
    const expected = [22, 23, 24].slice(pass).concat(28, 39);
    assert.deepEqual(phases.snapshot().acid, [...expected.map(x => [x, 32]), [22, 33]]);
    if (pass === 1) phases.depositAcid([24, 32]);
  }
  assert.equal(rolls.length, 0);
}

for (const direction of [-1, 1]) {
  const tiles = new Set();
  for (let x = 24; x <= 35; x++)
    for (let y = 24; y <= 40; y++) tiles.add([x,y].join(","));
  const phases = new ZebakPhases(() => 0, () => tiles, () => {});
  function cross(start, steps, attacking = false, row = 32) {
    const player = {position:start, facing:0, attackTarget:attacking ? "zebak" : null};
    phases.water = null;
    phases.waveFronts = [{y:row, direction, gap:28, gapWidth:3, tick:4}];
    let landed, hits = 0;
    phases.moveWithTide(player, steps.at(-1), pos => landed = pos,
      {stepTiles:steps}, () => hits++);
    return {landed, hits};
  }
  assert.deepEqual(cross([33,32+direction], [[33,32],[33,32-direction]]),
    {landed:[33,32+direction], hits:1});
  assert.deepEqual(cross([30,32+direction], [[30,32],[30,32-direction]]),
    {landed:undefined,hits:0});
  assert.deepEqual(cross([31,32], [[30,32]]), {landed:undefined,hits:0});
  assert.deepEqual(cross([33,32], [[32,32],[31,32]],true),
    {landed:[33,32+direction],hits:1});
  const shore = direction > 0 ? 40 : 24;
  assert.deepEqual(cross([33,shore],[],false,shore), {landed:[33,shore+direction],hits:1});
  assert.equal(phases.water.direction,direction);
}
console.log("Both tide directions passed running into the crest, the open gap, lateral escape, attack pathing, and shoreline displacement.");
for (const direction of [-1, 1]) {
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 23; y <= 41; y++) tiles.add([x,y].join(","));
  const cues = [];
  const boss = {alive: true, position: [14,28], size: 9, vitals: {hp:100,maxHp:100}};
  const player = {alive:true, position:[22,32], equipment:{}};
  const context = {tick:0, world:{actors:new Map([["zebak",boss],["player",player]])},
    tickEvents:{emit() {}}, spawnNpc() {}, despawnNpc() {}};
  const phases = new ZebakPhases(() => 0.5, () => tiles, (_, event) => cues.push({tick:context.tick,event}));
  phases.count.waves = direction < 0 ? 1 : 0;
  const settings = {gap:3,acidWidth:3,jugWidth:5};
  phases.begin(context, "waves", settings);
  const shore = direction > 0 ? 41 : 23;
  const jug = phases.spawn(context, "jug", 11735, [22,shore]);
  let damage = 0;
  for (; context.tick <= 58; context.tick++) {
    phases.step(context, settings, boss);
    for (const object of phases.actors.values()) {
      if (object.destination) object.actor.position = phases.movementFor(object.actor)[0].path[0];
    }
    if (context.tick === 21 || context.tick === 28) {
      assert.equal(phases.waveFronts.length, context.tick === 21 ? 2 : 3);
      const [older, younger] = phases.waveFronts;
      assert.equal(older.y - younger.y, direction * 7);
      assert.ok(older.actors.every(o => o.actor.position[1] === older.y));
      assert.ok(younger.actors.every(o => o.actor.position[1] === younger.y));
      assert.equal(phases.of("wave").length, phases.waveFronts.length * 19);
      assert.deepEqual([older.actors[0].actor.position[0], older.actors.at(-1).actor.position[0]], [18,39]);
    }
    // Intercept the same exposed row once per crest. Repeated callbacks for a
    // front still shove the player, but only its first contact deals damage.
    if (phases.waveFronts.some(front => front.y === 32)) {
      player.position = [22,32];
      const shove = () => phases.moveWithTide(player, null, next => {
        assert.deepEqual(next,[22,32+direction]);
      }, {stepTiles:[]}, () => damage++);
      assert.equal(shove(), true);
      assert.equal(shove(), true);
    }
  }
  assert.equal(damage, 3);
  assert.deepEqual(cues.filter(c => c.event.tidalSurgeSound).map(c => c.tick),[14,25,38]);
  assert.equal(cues.filter(c => c.event.graphics.some(g => g.spotAnimId === 2195)).length, 1);
  assert.equal(cues.filter(c => c.event.graphics.length === 1 && c.event.graphics[0].spotAnimId === 2449
    && c.event.graphics[0].target.position[0] === 22).length, 1);
  assert.equal(phases.actors.has(jug.actor.id), false);
  assert.equal(phases.of("wave").length, 0);
  assert.equal(phases.waveFronts.length, 0);
  assert.equal(phases.active,null);
}
console.log("Three overlapping crests preserved independent NPC rows, gap, shove, damage, shoreline splashes and cleanup in both directions.");
for (const path of [0, 3, 4]) {
  const cues = [];
  const tiles = new Set();
  for (let x = 22; x <= 38; x++)
    for (let y = 22; y <= 42; y++) tiles.add([x,y].join(","));
  const encounter = zebakDefinition({seedRandom: () => () => 0.5, walkable: () => tiles,
    animate: (_, event) => cues.push({tick:context.tick,event})}).factory();
  encounter.configureRunStart({path});
  const phases = encounter.phases;
  const boss = {id:"zebak", alive:true, size:9, position:[14,28], vitals:{hp:100,maxHp:100}};
  const player = {alive:true, position:[29,32], equipment:{}};
  const context = {tick:0, world:{actors:new Map([["zebak",boss],["player",player]])},
    tickEvents:{emit() {}}, spawnNpc() {}, despawnNpc() {}};
  phases.begin(context,"waves",encounter.settings);
  phases.queue.push("roar");
  const jug = phases.spawn(context,"jug",11735,[29,32]);
  for (context.tick = 1; context.tick <= 39; context.tick++) phases.step(context,encounter.settings,boss);
  context.tick = 39;
  encounter.processNpcTick(boss,context);
  assert.deepEqual(phases.queue, []);
  assert.equal(phases.active.kind,"roar");
  assert.equal(phases.active.start,39);
  assert.ok(phases.actors.has(jug.actor.id));
  assert.ok(phases.waveFronts.length > 0);
  const lastFront = phases.waveFronts.at(-1);
  const row = lastFront.y;
  context.tick++;
  phases.step(context,encounter.settings,boss);
  assert.equal(lastFront.y,row + 1);
  for (context.tick++; context.tick <= 54; context.tick++) phases.step(context,encounter.settings,boss);
  assert.equal(phases.waveFronts.length,0);
  assert.equal(phases.active.kind,"roar");
  assert.equal(phases.of("rock").length,3);
  assert.deepEqual(cues.filter(c => c.event.tidalSurgeSound).map(c => c.tick),path ? [13,24,37] : [14,25,38]);
}
console.log("A queued roar starts with water still moving and preserves existing jugs on paths 0, 3 and 4.");
