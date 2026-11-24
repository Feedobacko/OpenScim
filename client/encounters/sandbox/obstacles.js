// The sandbox's obstacles: boulders, one tile each, that a scenario places
// (scenario.js, `obstacles`) to block the way and the line of sight, as the
// Inferno's pillars do; several make a wall. Each is drawn as Zebak's boulder
// (CACHE: NPC 11737, size 1, model 46376; toa/zebak/phases.js loads it the
// same way, with no sequence), an NPC that never acts and cannot be
// attacked, and its tile is flagged in the arena's collision (encounter.js,
// refineArenaConfig), so that the player and every monster walk around it.
import { CollisionFlag, createCollisionMap } from "../../engine/collision.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { obstacleSize } from "./scenario.js";

// CACHE: Zebak's boulder (toa/zebak/phases.js).
export const obstacleNpcTypeId = 11737;
// As the Inferno's pillars: an object that also stops projectiles (inferno/collisionFlags.js).
const obstacleCollisionFlags = CollisionFlag.OBJECT | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;

export const obstacleNpcDefinition = defineNpc({ id: "sandbox-obstacle", move: false });
export const isObstacle = (npc) => npc?.definition?.id === obstacleNpcDefinition.id;

/** The tiles an obstacle covers, from its south-west corner. */
export const obstacleTiles = ([x, y]) =>
  Array.from({ length: obstacleSize * obstacleSize }, (_, index) => [x + (index % obstacleSize), y + Math.floor(index / obstacleSize)]);

export function createObstacleActor(id, position) {
  return obstacleNpcDefinition.createActor(
    {
      id,
      kind: "npc",
      npcTypeId: obstacleNpcTypeId,
      archetypeId: "sandbox_obstacle",
      size: obstacleSize,
      role: "npc",
      alive: true,
      position: [...position],
      previousPosition: [...position],
      facing: 0,
      lockedFacing: 0,
      // Never hit (untargetable): the numbers only fill the record.
      vitals: { hp: 1, maxHp: 1 },
      history: new Map(),
      formulaStats: null,
      untargetable: true,
      // Its tiles are in the collision: the NPCs' own blocking would count it twice.
      blocksNpcMovement: false,
      combat: {
        attackSpeed: 1,
        attackRange: 0,
        attackStyle: "typeless",
        nextActionTick: Number.MAX_SAFE_INTEGER,
        targetId: null,
        lastAttackTick: null,
        animations: { idle: null, walk: null, run: null, attack: null, death: null },
      },
    },
    {},
  );
}

// A copy of the arena's collision with the obstacles' tiles flagged and
// taken out of the walkable tiles; the arena's own map is left as it is.
export function withObstacles(arena, obstacles) {
  if (obstacles.length === 0) return arena;
  const base = arena.collisionMap;
  const collisionMap = base ? createCollisionMap(base.sizeX, base.sizeY) : createCollisionMap(64, 64);
  if (base?.flags) collisionMap.flags.set(base.flags);
  else if (base) {
    // A map without its array (an overlay, as the Inferno's pillars make): flag by flag.
    for (let x = 0; x < base.sizeX; x++) {
      for (let y = 0; y < base.sizeY; y++) {
        const flag = base.getFlag(x, y);
        if (flag > 0) collisionMap.flag(x, y, flag);
      }
    }
  }
  const walkableTiles = arena.walkableTiles ? new Set(arena.walkableTiles) : null;
  for (const position of obstacles) {
    for (const [x, y] of obstacleTiles(position)) {
      collisionMap.flag(x, y, obstacleCollisionFlags);
      walkableTiles?.delete(`${x},${y}`);
    }
  }
  return { ...arena, collisionMap, walkableTiles };
}
