import assert from "node:assert/strict";
import { ZebakPhases } from "../client/toa/zebak/phases.js";
import { zebakPresentation } from "../client/toa/zebak/native.js";
import { configure } from "../client/toa/zebak/rules.js";

const arena = new Set();
for (let x = 22; x <= 38; x++)
  for (let y = 23; y <= 41; y++) arena.add([x, y].join(","));
const events = [];
const splats = [];
const effects = zebakPresentation(class {}).audio.rules.inferno_visual;
const phases = new ZebakPhases(() => 0.3, () => arena, (_, event) => events.push(event));
const boss = {alive: true, position: [14, 28], size: 9, vitals: {hp: 100, maxHp: 100}};
const player = {alive: true, position: [33, 32], equipment: {}};
const context = {tick: 10, world: {actors: new Map([["zebak", boss], ["player", player]])},
  spawnNpc() {}, despawnNpc() {}, tickEvents: {emit(event) {splats.push(event);}}};
const settings = {acidWidth: 5, jugWidth: 5, gap: 3};
phases.begin(context, "roar", settings);
const launch = events.at(-1);
assert.ok(launch.animations.every(cue => cue.clipId === "attack"));
assert.ok(launch.projectiles.every(cue => cue.startDelayCycles === 65 && cue.endDelayCycles === (cue.spotAnimId === 2194 ? 150 : 180)));
assert.equal(effects.resolve(launch).sound.id, 5908);
assert.equal(effects.resolve(launch).sound.delayCycles, 30);
for (context.tick++; context.tick < 15; context.tick++) {
  phases.step(context, settings, boss);
  assert.equal(phases.acid.size + phases.of("rock").length + phases.of("jug").length, 0);
}
phases.step(context, settings, boss);
const impact = events.at(-1);
assert.ok(impact.graphics.some(cue => cue.spotAnimId === 1556));
assert.deepEqual(new Set(impact.projectiles.map(cue => cue.endDelayCycles)), new Set([30,60]));
assert.equal(effects.resolve(impact).sound.id, 5909);
assert.equal(effects.resolve(impact).sound.delayCycles, 30);
assert.equal(phases.of("rock").length + phases.of("jug").length, 0);
const initialAcid = phases.acid.size;
context.tick++;
phases.step(context, settings, boss);
assert.ok(events.at(-1).graphics.some(cue => cue.spotAnimId === 2174));
assert.equal(effects.resolve(events.at(-1)).sound.id, 5867);
assert.equal(phases.of("rock").length, 2);
assert.equal(phases.of("jug").length, 7);
assert.ok(phases.acid.size > initialAcid);
const innerSpread = phases.acid.size;
context.tick++;
phases.step(context, settings, boss);
assert.ok(phases.acid.size > innerSpread);

const jug = phases.of("jug")[0];
jug.actor.position = [30,23];
jug.remaining = 1;
jug.step = [0,-1];
phases.stepJugs(context, settings, player);
const splash = events.at(-1);
assert.equal(splash.graphics[0].spotAnimId, 2449);
assert.deepEqual(splash.graphics[0].target.position, [30,22]);
assert.equal(effects.resolve(splash).sound.id, 5880);
assert.equal(phases.actors.has(jug.actor.id), false);

const other = phases.of("jug")[0];
other.actor.position = [...player.position];
player.attackTarget = other.actor.id;
phases.pendingJug = {action: "Hit", id: other.actor.id};
context.attackObject = () => 2;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), true);
assert.equal(player.attackTarget, null);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), true);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(other.kind, "broken-jug");
assert.equal(splats.at(-1).amount, 5);
assert.deepEqual(other.actor.vitals, {hp: 0, maxHp: 5});
context.tick++;
phases.stepJugs(context, settings, player);
assert.ok(events.at(-1).graphics.some(cue => cue.spotAnimId === 2192));
assert.equal(events.at(-1).jugBreakCause, "weapon");
assert.equal(effects.resolve(events.at(-1)).kind, "pass");
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(phases.actors.has(other.actor.id), false);
const shelter = phases.of("rock")[0];
const moving = phases.spawn(context, "jug", 11736, [shelter.actor.position[0]-1, shelter.actor.position[1]]);
moving.step = [1,0];
moving.remaining = 4;
phases.stepJugs(context, settings, player);
assert.deepEqual(splats.at(-1), {type: "hitsplat_spawned", targetId: moving.actor.id, amount: 5, hitsplatType: "damage"});
assert.equal(moving.actor.vitals.hp, 0);
assert.equal(moving.actor.healthBarWhenUntargetable, true);
assert.equal(shelter.actor.vitals.hp, 150);
context.tick++;
phases.stepJugs(context, settings, player);
assert.equal(events.at(-1).jugBreakCause, "collision");
assert.equal(effects.resolve(events.at(-1)).kind, "pass");

phases.clearSpecial(context);
phases.begin(context, "waves", settings);
const start = context.tick;
for (; context.tick <= start + 15; context.tick++) phases.step(context, settings, boss);
const fall = events.find(event => event.graphics.some(cue => cue.spotAnimId === 2195));
const shoreBursts = fall.graphics.filter(cue => cue.spotAnimId === 68);
assert.equal(shoreBursts.length, 8);
assert.ok(shoreBursts.every(cue => cue.delayCycles === 200));
assert.ok(fall.graphics.filter(cue => cue.spotAnimId === 2195).every(cue => cue.delayCycles === 6));
assert.deepEqual(shoreBursts.map(cue => cue.target.position),
  fall.graphics.filter(cue => cue.spotAnimId === 2195).map(cue => cue.target.position));
assert.deepEqual(effects.resolve(fall).sound.map(s => [s.id, s.delayCycles]), [[5882,30],[5880,230]]);
assert.equal(effects.resolve(events.find(event => event.tidalSurgeSound)).sound.id, 5852);
for (const upset of [false, true]) {
  const settings = configure({upset});
  const jug = phases.spawn(context, "jug", 11735, [30, 32]);
  const wet = new Set();
  const dry = new Set();
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      const position = [30 + dx, 32 + dy];
      const tile = position.join(",");
      phases.depositAcid(position);
      (Math.max(Math.abs(dx), Math.abs(dy)) <= (upset ? 1 : 2) ? wet : dry).add(tile);
    }
  }
  phases.breakJug(context, jug, "roar");
  context.tick++;
  phases.stepJugs(context, settings, player);
  assert.equal(wet.size, upset ? 9 : 25);
  assert.deepEqual(new Set(phases.splashes.at(-1).tiles.map(p => p.join(","))), wet);
  const groundWater = events.at(-1).graphics.filter(g => g.spotAnimId === 95);
  assert.equal(events.at(-1).jugBreakCause, "roar");
  assert.equal(effects.resolve(events.at(-1)).kind, "pass");
  assert.deepEqual(new Set(groundWater.map(g => g.target.position.join(","))), wet);
  for (const tile of wet) assert.ok(!phases.acid.has(tile));
  for (const tile of dry) assert.ok(phases.acid.has(tile));
}
console.log("Verified special spit, primary landing, acid spread, jug impact and water entry, shore fall and crest.");
