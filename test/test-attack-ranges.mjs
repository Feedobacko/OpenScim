// The plugin Attack Ranges (client/plugins/attackRanges.js) without a scene:
// which tiles it draws in each display mode, what it hides, the allow list,
// the stored settings and drag protection. With no arena loaded every tile is
// in sight.
import assert from "node:assert/strict";
import { register } from "node:module";

// The weapons' table reaches the application's vendor chunk, which imports a
// stylesheet: the determinism harness's hooks let Node load it.
register("../tools/determinism/node-hooks.mjs", import.meta.url);
globalThis.self ??= globalThis;
const {
  attackRangesDefaults,
  readAttackRangesSettings,
  parseArgb,
  isAllowListedWeapon,
  layOutRange,
  updateAttackRanges,
  isAttackDragProtected,
  describeHotkey,
} = await import("../client/plugins/attackRanges.js");

// The user's defaults, and a stored value that is not valid falls back to its default.
assert.equal(attackRangesDefaults.displayMode, "BORDER");
assert.equal(attackRangesDefaults.rangeFillColor, "07000000");
assert.equal(attackRangesDefaults.npcHighlightOutlineColor, "9000FFFF");
assert.equal(attackRangesDefaults.npcHighlightFillColor, "4400FFFF");
assert.equal(attackRangesDefaults.npcHighlightOutlineThickness, 3);
assert.deepEqual(readAttackRangesSettings({ borderSize: 99, displayMode: "TILES", rangeFillColor: "red" }), { ...attackRangesDefaults, displayMode: "TILES" });
assert.deepEqual(parseArgb("6656EA67"), { color: "#56EA67", alpha: 102 / 255 });

assert.ok(isAllowListedWeapon("Trident of the swamp", "Trident*, rune crossbow"));
assert.ok(isAllowListedWeapon("Rune crossbow", "Trident*, rune crossbow"));
assert.ok(!isAllowListedWeapon("Rune scimitar", "Trident*, rune crossbow"));
assert.ok(isAllowListedWeapon("Anything", " "));

// A reach of 8 on open ground: a square of 17 by 17.
const square = new Set();
for (let x = 2; x <= 18; x++) for (let y = 2; y <= 18; y++) square.add(`${x},${y}`);
const border = layOutRange(square, "BORDER");
assert.equal(border.fillTiles.length, 289);
assert.equal(border.outlineTiles.length, 0);
assert.equal(border.lines.length, 4 * 17);
assert.ok(border.lines.every(({ x, y }) => x === 2 || x === 19 || y === 2 || y === 19));
assert.equal(layOutRange(square, "TILES").outlineTiles.length, 289);
assert.equal(layOutRange(square, "EDGE_TILES").outlineTiles.length, 64);

// Drawn with a bow; with a reach of 1 only with "Display melee"; NPCs highlighted on their own switch.
const player = { equipment: { weapon: 861 }, selectedAttackStyleIndex: 0, combatSupplies: {} }; // magic shortbow
const npcs = [
  { id: "near", role: "minion", alive: true, position: [12, 10], size: 1 },
  { id: "far", role: "minion", alive: true, position: [30, 10], size: 3 },
  { id: "talker", role: "npc", alive: true, position: [11, 10], size: 1 },
];
const base = { enabled: true, settings: attackRangesDefaults, encounterKind: "inferno", hotkeyOn: false, playerTile: [10, 10], range: 8, player, npcs };
assert.equal(updateAttackRanges(base).fillTiles.length, 289);
assert.deepEqual(updateAttackRanges(base).npcIds, []);
assert.deepEqual(updateAttackRanges({ ...base, settings: { ...attackRangesDefaults, npcHighlightEnableState: "ON" } }).npcIds, ["near"]);
assert.equal(updateAttackRanges({ ...base, range: 1 }), null);
assert.equal(updateAttackRanges({ ...base, range: 1, settings: { ...attackRangesDefaults, showMeleeWeapons: true } }).fillTiles.length, 9);
assert.equal(updateAttackRanges({ ...base, settings: { ...attackRangesDefaults, playerEnableState: "INSTANCES_ONLY" }, encounterKind: "zebak" }), null);
assert.equal(updateAttackRanges({ ...base, settings: { ...attackRangesDefaults, playerEnableState: "HOTKEY_MODE" } }), null);
assert.ok(updateAttackRanges({ ...base, settings: { ...attackRangesDefaults, playerEnableState: "HOTKEY_MODE" }, hotkeyOn: true }));
assert.equal(updateAttackRanges({ ...base, enabled: false }), null);

// Drag protection: the NPC out of reach, not the one in it, not one that is talked to.
updateAttackRanges({ ...base, settings: { ...attackRangesDefaults, dragProtection: true } });
assert.ok(isAttackDragProtected("far"));
assert.ok(!isAttackDragProtected("near"));
assert.ok(!isAttackDragProtected("talker"));

assert.equal(describeHotkey({ key: "f", shiftKey: true }), "Shift+F");
assert.equal(describeHotkey({ key: "Shift", shiftKey: true }), "");
console.log("Attack Ranges: tiles, modes, hiding, allow list, settings and drag protection as the plugin has them");
