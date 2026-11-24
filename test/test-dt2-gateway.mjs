import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { awakenedKind, bosses } from "../client/dt2/bosses.js";
import * as dt2 from "../client/dt2/gateway.js";
import * as toa from "../client/toa/gateway.js";
import * as sandbox from "../client/encounters/sandbox/gateway.js";
import { gatewayFloor, gatewayPortals } from "../client/lobby/gateways.js";

// The four bosses, one ancient element each.
assert.deepEqual(bosses.map((boss) => boss.element), ["blood", "ice", "shadow", "smoke"]);
// The engine knows every boss and its awakened variant; only Vardorvis has a fight yet.
const engine = readFileSync(new URL("../client/engine/encounterKinds.js", import.meta.url), "utf8");
for (const { kind } of bosses)
  assert.match(
    engine,
    new RegExp(`\\{kind:"${kind}",variantKinds:\\["${awakenedKind(kind)}"\\],slug:"[a-z-]+",registered:${kind === "vardorvis"}\\}`),
    kind + " and its awakened variant are engine kinds",
  );

// The door's tiles open the chooser; none of them is a tile of the other gateway.
assert.ok(dt2.gatewayPortals.length >= 6, "the door and the row in front of it are portals");
const toaTiles = new Set(toa.gatewayPortals.map(({ position }) => position.join(",")));
for (const { position: [x, y], open, encounterKind } of dt2.gatewayPortals) {
  assert.equal(typeof open, "function");
  assert.equal(encounterKind, undefined);
  assert.ok(x >= 0 && x < 64 && y >= 0 && y < 64, "portal tile " + x + "," + y + " lies on the lobby map");
  assert.ok(!toaTiles.has(x + "," + y), "portal tile " + x + "," + y + " belongs to one gateway");
}
assert.equal(gatewayPortals.length, toa.gatewayPortals.length + dt2.gatewayPortals.length + sandbox.gatewayPortals.length);
// The sandbox's dais shares no tile with the other two gateways.
const dt2Tiles = new Set(dt2.gatewayPortals.map(({ position }) => position.join(",")));
for (const { position, open } of sandbox.gatewayPortals) {
  assert.equal(typeof open, "function");
  assert.ok(!toaTiles.has(position.join(",")) && !dt2Tiles.has(position.join(",")), "sandbox portal tile " + position + " belongs to one gateway");
}

// Build the lobby's walkable disc the way the lobby does, add the gateway,
// and walk from the spawn tile to a tile that opens the chooser.
const walkable = new Set();
for (let x = 0; x < 64; x++)
  for (let y = 0; y < 64; y++)
    if (Math.hypot(x + 0.5 - 31.5, y + 0.5 - 25.5) <= 16) walkable.add(x + "," + y);
const onPlatform = new Set(walkable);
dt2.extendLobbyArena(walkable, (x, y) => walkable.delete(Math.floor(x) + "," + Math.floor(y)));
assert.ok(walkable.size > onPlatform.size, "the walkway adds tiles beyond the platform");
const portals = new Set(dt2.gatewayPortals.map(({ position }) => position.join(",")));
const seen = new Set(["31,25"]);
const queue = [[31, 25]];
let reached = false;
while (queue.length && !reached) {
  const [x, y] = queue.shift();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const key = x + dx + "," + (y + dy);
    if (seen.has(key) || !walkable.has(key)) continue;
    if (portals.has(key)) reached = true;
    seen.add(key);
    queue.push([x + dx, y + dy]);
  }
}
assert.ok(reached, "the player can walk from the spawn tile to a tile that opens the chooser");

// The lobby lays its floor under every tile the gateway adds and under the
// door, and not on the middle of the platform.
for (const key of walkable)
  if (!onPlatform.has(key)) {
    const [x, y] = key.split(",").map(Number);
    assert.ok(gatewayFloor(x + 0.5, y + 0.5), "floor under walkway tile " + key);
  }
for (const { position: [x, y] } of dt2.gatewayPortals) assert.ok(gatewayFloor(x + 0.5, y + 0.5), "floor under portal tile " + x + "," + y);
assert.ok(!gatewayFloor(31.5, 25.5));
console.log("DT2 gateway passed");
