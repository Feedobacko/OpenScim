// The arenas a sandbox scenario can be played in: the rooms of the other
// encounters, without their fights. Each is a variant kind of the sandbox
// (registry.js: variantFactories, variantDescriptors), with a descriptor of
// its own (its map square and how its collision is built) and a
// presentation of its own (presentation.js), as the Doom of Mokhaiotl's
// deeper room is.
//
// Every entry:
//   id            the name a scenario file uses, and the route's second part
//                 (/sandbox/<id>); never change one
//   name          what the menus show
//   mapSquare, mapSquareOffsets?, playerStart, collision   as in the
//                 encounter's own descriptor, from its module
//   locRender     the levels of map objects the scene draws
//   camera        { yaw, pitch, zoom } on entering, from the encounter's
//                 presentation
//   hostKind      the encounter whose boss can be fought here with all its
//                 mechanics (encounter.js); the scene is then that encounter's
// The arena of the lobby is left out: its floor and walls are drawn by its
// own scene (in client/assets/rendering.js), which the sandbox cannot use.
import { solMapSquare, solPlayerStart } from "../sol-heredit/constants.js";
import { solBoundaryLocs } from "../sol-heredit/boundaryLocs.js";
import { colosseumPlayerStart } from "../colosseum/constants.js";
import { infernoMapSquare, infernoMapSquareOffsets, infernoPlayerStart, infernoExcludedStaticLocIds } from "../inferno/constants.js";
import { vardorvisMapSquare } from "../vardorvis/encounter.js";

export const sandboxKind = "sandbox";
export const sandboxVariantKind = (arenaId) => (arenaId === sandboxArenas[0].id ? sandboxKind : `${sandboxKind}_${arenaId}`);

export const sandboxArenas = [
  {
    id: "colosseum",
    name: "Fortis Colosseum",
    mapSquare: solMapSquare,
    playerStart: [...colosseumPlayerStart],
    collision: { mode: "auto", seed: [...colosseumPlayerStart] },
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 270, pitch: -60, zoom: 300 },
  },
  {
    id: "sol_heredit",
    hostKind: "sol_heredit",
    name: "Sol Heredit's arena",
    mapSquare: solMapSquare,
    playerStart: [...solPlayerStart],
    collision: { mode: "auto", seed: [...solPlayerStart], dynamicLocs: solBoundaryLocs },
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 180, pitch: -55, zoom: 320 }, // inferred
  },
  {
    id: "inferno",
    name: "The Inferno (no pillars)",
    mapSquare: infernoMapSquare,
    mapSquareOffsets: infernoMapSquareOffsets,
    playerStart: [...infernoPlayerStart],
    // The pillars are the Inferno's NPCs; without them the floor is open.
    collision: { mode: "auto", seed: [...infernoPlayerStart], excludedStaticLocIds: infernoExcludedStaticLocIds },
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 180, pitch: -55, zoom: 360 }, // inferred
  },
  {
    id: "yama",
    hostKind: "yama_p3",
    name: "Yama's room",
    mapSquare: { x: 23, y: 157 }, // registry.js
    playerStart: [31, 37],
    collision: { mode: "auto", seed: [32, 30] },
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 180, pitch: -55, zoom: 300 }, // the fixture's (test/fixtures/training-ground)
  },
  {
    id: "zebak",
    hostKind: "zebak",
    name: "Zebak's room (ToA)",
    mapSquare: { x: 61, y: 84 }, // toa/zebak/native.js
    playerStart: [29, 32],
    collision: { mode: "auto", seed: [29, 32] },
    locRender: { bounds: null, levels: [0, 1, 2] },
    camera: { yaw: 270, pitch: -55, zoom: 330 }, // inferred
  },
  {
    id: "vardorvis",
    hostKind: "vardorvis",
    name: "Vardorvis' clearing",
    mapSquare: vardorvisMapSquare,
    playerStart: [40, 24], // vardorvis/encounter.js
    collision: { mode: "auto", seed: [40, 24] },
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 180, pitch: -45, zoom: 320 },
  },
  {
    id: "doom",
    hostKind: "doom_of_mokhaiotl",
    name: "Doom of Mokhaiotl, delve 1",
    mapSquare: { x: 20, y: 149 }, // doom-of-mokhaiotl/encounter.js
    playerStart: [31, 28],
    collision: { mode: "auto", seed: [31, 28] },
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 0, pitch: -45, zoom: 330 },
  },
  {
    id: "doom_deep",
    hostKind: "doom_of_mokhaiotl_deep",
    name: "Doom of Mokhaiotl, deeper room",
    mapSquare: { x: 53, y: 100 }, // doom-of-mokhaiotl/encounter.js
    playerStart: [31, 28],
    collision: { mode: "auto", seed: [31, 28] },
    locRender: { bounds: null, levels: [0] },
    camera: { yaw: 0, pitch: -45, zoom: 330 },
  },
  {
    id: "toa_nexus",
    name: "Tombs of Amascut nexus",
    mapSquare: { x: 55, y: 80 }, // toa/nexus.js
    playerStart: [31, 26],
    collision: { mode: "auto", seed: [31, 26] },
    locRender: { bounds: null, levels: [0, 1] },
    camera: { yaw: 0, pitch: -50, zoom: 330 },
  },
];

const arenaById = new Map(sandboxArenas.map((arena) => [arena.id, arena]));
export const getSandboxArena = (id) => arenaById.get(id) ?? sandboxArenas[0];
export const isSandboxArenaId = (id) => arenaById.has(id);
export const getSandboxArenaOfKind = (kind) => sandboxArenas.find((arena) => sandboxVariantKind(arena.id) === kind) ?? sandboxArenas[0];
