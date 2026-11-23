// The Tombs of Amascut gateway in the lobby: a sand causeway that leaves the
// platform along one of its spokes and ends at the tomb door, which faces the
// platform's centre. Every object is one the nexus room already uses, so the
// gateway adds nothing to the cache.
import { nexusKind } from "./nexus.js";
import { toaMesh, toaShaderModes } from "./shader.js";
import { box, centerX, lobbyGateway, rimY } from "../lobby/gateway.js";

// Where the gateway stands: the direction of its spoke, in degrees
// anticlockwise from east. 90 is north, behind Yama; Yama's neighbours stand
// at 31 and 149. Change this one number to move the whole gateway.
const spokeDegrees = 65;

// Laid out as if the spoke pointed north (see lobby/gateway.js).
const door = { x: 28, y: 46, width: 7, depth: 3 };
const walkway = { minX: 29, maxX: 33, minY: 39 };

// [object id, x, y, rotation, type]. Type 10 is a scenery object, 22 a floor decoration.
const placements = [
  [46168, door.x, door.y, 0], // the tomb door in its open state, facing the platform
  [45334, door.x - 1, door.y - 1, 1], // fire
  [45378, door.x - 1, door.y - 1, 3, 22],
  [45334, door.x + door.width, door.y - 1, 1],
  [45378, door.x + door.width, door.y - 1, 3, 22],
  [45244, walkway.minX - 1, door.y - 4, 1], // braziers
  [45245, walkway.maxX + 1, door.y - 4, 3],
  [45267, walkway.minX - 1, door.y - 2, 1], // pots
  [45275, walkway.maxX + 1, door.y - 2, 2],
  [45296, walkway.minX - 1, door.y - 3, 1],
  [45322, walkway.maxX + 1, door.y - 3, 0], // skeleton
];

const { toLayout, turnMatrix, tilesIn, gatewayLocs, turnGatewayObject } = lobbyGateway(spokeDegrees, placements);
export { gatewayLocs, turnGatewayObject };
const doorTiles = tilesIn(door.x, door.y, door.x + door.width, door.y + door.depth);

// A click on the door or on the row in front of it enters the nexus.
export const gatewayPortals = tilesIn(door.x, door.y - 1, door.x + door.width, door.y + door.depth).map(
  (position) => ({ position, encounterKind: nexusKind, displayName: "Tombs of Amascut" }),
);

// Adds the walkway to the lobby's walkable tiles and blocks the door.
export function extendLobbyArena(walkable, block) {
  for (const [x, y] of tilesIn(walkway.minX, walkway.minY, walkway.maxX + 1, door.y)) walkable.add(x + "," + y);
  for (const [x, y] of doorTiles) block(x + 0.5, y + 0.5);
}

// The sand: the walkway, a wider apron under the door, and a spill onto the
// platform where the walkway meets the rim.
const side = 2.8, apron = 4.8, apronStart = door.y - 0.9, apronEnd = door.y + door.depth + 0.9;

// How much sand lies at a laid-out point, 0 to 1.
function sandAt(x, y) {
  const distance = Math.min(
    box(x, y, centerX, (rimY + apronStart) / 2, side - 0.2, (apronStart - rimY) / 2 + 0.5),
    box(x, y, centerX, (apronStart + apronEnd) / 2, apron - 0.2, (apronEnd - apronStart) / 2 - 0.2),
    Math.hypot(x - centerX, (y - rimY) * 1.3) - 3.2,
  );
  return Math.min(1, Math.max(0, 0.5 - distance / 1.6));
}

// The lobby leaves its fallen columns off the sand. Takes a lobby position.
export const gatewayCovers = (x, y) => sandAt(...toLayout(x, y)) > 0.15;

// `hsl(h, s, l)` packs a colour the way the renderer expects; `baseZ` is the
// height of the lobby floor.
export function gatewayMeshes({ baseZ, hsl }) {
  const surface = baseZ + 0.065;
  const sandColour = hsl(28, 128, 118);
  const gold = hsl(32, 224, 150);
  const part = (name, zIndex, depth, animParams) =>
    toaMesh("toa-gateway-" + name, zIndex, depth, animParams, turnMatrix);

  const step = 0.5;
  const sand = part("sand", 2, "readwrite", [toaShaderModes.sand, centerX, door.y - 1, 9]);
  const minX = centerX - 6.5, maxX = centerX + 6.5, minY = rimY - 4.5, maxY = apronEnd + 1.5;
  const columns = Math.round((maxX - minX) / step), rows = Math.round((maxY - minY) / step);
  const at = [];
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const x = minX + column * step, y = minY + row * step;
      at.push(sand.vertex(x, y, surface, sandColour, sandAt(x, y)));
    }
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const a = row * (columns + 1) + column, b = a + columns + 1;
      if (sandAt(minX + (column + 0.5) * step, minY + (row + 0.5) * step) > 0)
        sand.quad(at[a], at[a + 1], at[b + 1], at[b]);
    }

  // Sand pours into the void where the causeway has left the platform.
  const falls = part("falls", 3, "read", [toaShaderModes.fall, 0, 0, 0]);
  const pour = (from, to) => falls.sheet(from, to, surface, -4, sandColour, 0.7, 0);
  for (const sign of [-1, 1]) {
    const x = centerX + sign * side, outer = centerX + sign * apron;
    pour([x, rimY + 0.4], [x, apronStart]);
    pour([x, apronStart], [outer, apronStart]);
    pour([outer, apronStart], [outer, apronEnd]);
  }
  pour([centerX - apron, apronEnd], [centerX + apron, apronEnd]);

  // The veil: a sheet of light standing in the door's opening, which narrows upward.
  const veil = part("veil", 7, "read", [toaShaderModes.veil, 1, 0, 0]);
  veil.sheet([centerX - 1.6, door.y + 0.2], [centerX + 1.6, door.y + 0.2], baseZ, 3.3, gold, 0.95, 0.35, 0.45);

  // A beam of light above the door, like the ones over the lobby's bosses.
  const beamY = door.y + door.depth / 2, radius = 1.6;
  const shaft = part("shaft", 8, "read", [toaShaderModes.shaft, 0, 0, 0]);
  shaft.sheet([centerX - radius, beamY], [centerX + radius, beamY], baseZ + 5, 20, gold, 0.6, 0);
  shaft.sheet([centerX, beamY - radius], [centerX, beamY + radius], baseZ + 5, 20, gold, 0.6, 0);

  return [sand, falls, veil, shaft].map((mesh) => mesh.command());
}
