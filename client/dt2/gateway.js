// The Desert Treasure II gateway in the lobby: the platform's own floor
// reaches out to the door of the Ancient Vault. The four ancient elements run
// along the floor into the door, and a rune ring turns around it; the ring's
// inner ring ignites when the gate wakes.
import { awakenedColour, bosses } from "./bosses.js";
import { chooseBoss } from "./chooser.js";
import { dt2Mesh, dt2ShaderModes } from "./shader.js";
import { centerX, lobbyGateway, rimY } from "../lobby/gateway.js";

// Where the gateway stands: the direction of its spoke, in degrees
// anticlockwise from east. Sol Heredit stands at 31; the camera looks north
// from south of the centre, so what lies behind him shows to his right.
// Below about 30 the door leaves the right edge of the default view.
const spokeDegrees = 33;

// Laid out as if the spoke pointed north (see lobby/gateway.js).
const door = { x: 30, y: 47, width: 3, depth: 1 };
const walkway = { minX: 30, maxX: 32, minY: 39 };

// [object id, x, y, rotation, type].
const placements = [
  [46743, door.x, door.y, 0], // the vault door, facing the platform
];

const { toLayout, turnMatrix, tilesIn, gatewayLocs, turnGatewayObject } = lobbyGateway(spokeDegrees, placements);
export { gatewayLocs, turnGatewayObject };

// A click on the door or on the row in front of it opens the boss chooser.
export const gatewayPortals = tilesIn(door.x, door.y - 1, door.x + door.width, door.y + door.depth).map(
  (position) => ({ position, displayName: "Desert Treasure II", open: chooseBoss }),
);

// Adds the walkway to the lobby's walkable tiles and blocks the door.
export function extendLobbyArena(walkable, block) {
  for (const [x, y] of tilesIn(walkway.minX, walkway.minY, walkway.maxX + 1, door.y)) walkable.add(x + "," + y);
  for (const [x, y] of tilesIn(door.x, door.y, door.x + door.width, door.y + door.depth)) block(x + 0.5, y + 0.5);
}

// The floor: a strip from the rim to the door and a round dais under the
// door and its ring. The lobby builds it with its own floor, tile by tile on
// its own grid, so the platform has no seam. Takes a lobby position.
const stripHalfWidth = 2.1, daisRadius = 3.4;
export function gatewayFloor(lobbyX, lobbyY) {
  const [x, y] = toLayout(lobbyX, lobbyY);
  const onStrip = Math.abs(x - centerX) <= stripHalfWidth && y >= rimY - 1 && y <= door.y + door.depth;
  return onStrip || Math.hypot(x - centerX, y - (door.y + door.depth / 2)) <= daisRadius;
}

// The lobby leaves its fallen columns off the gateway's floor.
export const gatewayCovers = gatewayFloor;

// `hsl(h, s, l)` packs a colour the way the renderer expects; `baseZ` is the
// height of the lobby floor.
export function gatewayMeshes({ baseZ, hsl }) {
  const violet = hsl(...awakenedColour);
  const part = (name, zIndex, depth, animParams) =>
    dt2Mesh("dt2-gateway-" + name, zIndex, depth, animParams, turnMatrix);

  // Each boss's element runs along the floor into the door, in a lane of its
  // own. A stream is a flat sheet that fades in at its start.
  const surface = baseZ + 0.03;
  const streamStart = rimY, streamEnd = door.y + 0.2, halfWidth = 0.26;
  const streams = part("streams", 3, "read", [dt2ShaderModes.stream, streamEnd - streamStart, halfWidth, 0]);
  bosses.forEach((boss, index) => {
    const x = centerX + (index - 1.5) * 0.75, colour = hsl(...boss.colour);
    streams.quad(
      streams.vertex(x - halfWidth, streamStart, surface, colour, 0, -1, 0),
      streams.vertex(x + halfWidth, streamStart, surface, colour, 0, 1, 0),
      streams.vertex(x + halfWidth, streamEnd, surface, colour, 1, 1, 1),
      streams.vertex(x - halfWidth, streamEnd, surface, colour, 1, -1, 1),
    );
  });

  // The rune ring stands around the door and faces the platform.
  const ringRadius = 3.3, ringY = door.y + 0.75, ringZ = baseZ + 2.5;
  const ring = part("ring", 6, "read", [dt2ShaderModes.ring, ringRadius, -1, 0]);
  ring.quad(
    ring.vertex(centerX - ringRadius, ringY, ringZ - ringRadius, violet, 1, -1, -1),
    ring.vertex(centerX + ringRadius, ringY, ringZ - ringRadius, violet, 1, 1, -1),
    ring.vertex(centerX + ringRadius, ringY, ringZ + ringRadius, violet, 1, 1, 1),
    ring.vertex(centerX - ringRadius, ringY, ringZ + ringRadius, violet, 1, -1, 1),
  );

  // A beam of light above the door, like the ones over the lobby's bosses.
  const beamY = door.y + 0.5, radius = 1.5;
  const shaft = part("shaft", 8, "read", [dt2ShaderModes.shaft, 0, 0, 0]);
  shaft.sheet([centerX - radius, beamY], [centerX + radius, beamY], baseZ + 5, 20, violet, 0.55, 0);
  shaft.sheet([centerX, beamY - radius], [centerX, beamY + radius], baseZ + 5, 20, violet, 0.55, 0);

  return [streams, ring, shaft].map((mesh) => mesh.command());
}
