import { getArenaBounds, isArenaTileWalkable, isInsideArenaBounds, getArenaCollisionMap } from "../../engine/arena.js";
import { CollisionFlag } from "../../engine/collision.js";
import { canNpcActAtTick, isNpcHeldInPlace } from "../../engine/npcState.js";
import { weightEqually, getContextDecisions } from "../../engine/decisions.js";
import { areFootprintsOverlapping } from "../../engine/attackRange.js";
import { createOccupancyStepCheck } from "../../engine/occupancy.js";
import { isNpcInAttackRange } from "./npcAttack.js";
var westStepCollisionMasks = {
  single: CollisionFlag.BLOCK_WEST,
  start: CollisionFlag.BLOCK_SOUTH_WEST,
  middle: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  end: CollisionFlag.BLOCK_NORTH_WEST,
};
var eastStepCollisionMasks = {
  single: CollisionFlag.BLOCK_EAST,
  start: CollisionFlag.BLOCK_SOUTH_EAST,
  middle: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  end: CollisionFlag.BLOCK_NORTH_EAST,
};
var southStepCollisionMasks = {
  single: CollisionFlag.BLOCK_SOUTH,
  start: CollisionFlag.BLOCK_SOUTH_WEST,
  middle: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  end: CollisionFlag.BLOCK_SOUTH_EAST,
};
var northStepCollisionMasks = {
  single: CollisionFlag.BLOCK_NORTH,
  start: CollisionFlag.BLOCK_NORTH_WEST,
  middle: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  end: CollisionFlag.BLOCK_NORTH_EAST,
};
var southWestStepCollisionMasks = {
  corner: CollisionFlag.BLOCK_SOUTH_WEST,
  horizontalStrip: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  xIntermediate: CollisionFlag.BLOCK_WEST,
  yIntermediate: CollisionFlag.BLOCK_SOUTH,
};
var northWestStepCollisionMasks = {
  corner: CollisionFlag.BLOCK_NORTH_WEST,
  horizontalStrip: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  xIntermediate: CollisionFlag.BLOCK_WEST,
  yIntermediate: CollisionFlag.BLOCK_NORTH,
};
var southEastStepCollisionMasks = {
  corner: CollisionFlag.BLOCK_SOUTH_EAST,
  horizontalStrip: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  xIntermediate: CollisionFlag.BLOCK_EAST,
  yIntermediate: CollisionFlag.BLOCK_SOUTH,
};
var northEastStepCollisionMasks = {
  corner: CollisionFlag.BLOCK_NORTH_EAST,
  horizontalStrip: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  xIntermediate: CollisionFlag.BLOCK_EAST,
  yIntermediate: CollisionFlag.BLOCK_NORTH,
};
function getCardinalStepCollisionMasks(dx, dy) {
  if (dx === -1 && dy === 0) {
    return westStepCollisionMasks;
  } else if (dx === 1 && dy === 0) {
    return eastStepCollisionMasks;
  } else if (dx === 0 && dy === -1) {
    return southStepCollisionMasks;
  } else if (dx === 0 && dy === 1) {
    return northStepCollisionMasks;
  } else {
    return null;
  }
}
function canFootprintStepCardinally(destinationFootprint, direction) {
  const { southWest: southWest, width: width, height: height } = destinationFootprint;
  const [dx, dy] = direction;
  const edgeMasks = getCardinalStepCollisionMasks(dx, dy);
  if (!edgeMasks) {
    return false;
  }
  const isHorizontalStep = dy === 0;
  const edgeLength = isHorizontalStep ? height : width;
  const edgeStartX = dx === 1 ? southWest[0] + width - 1 : southWest[0];
  const edgeStartY = dy === 1 ? southWest[1] + height - 1 : southWest[1];
  const collisionMap = getArenaCollisionMap();
  for (let edgeIndex = 0; edgeIndex < edgeLength; edgeIndex++) {
    const x = edgeStartX + (isHorizontalStep ? 0 : edgeIndex);
    const y = edgeStartY + (isHorizontalStep ? edgeIndex : 0);
    if (!isArenaTileWalkable(x, y)) {
      return false;
    }
    const blockFlags =
      edgeLength === 1 ? edgeMasks.single : edgeIndex === 0 ? edgeMasks.start : edgeIndex === edgeLength - 1 ? edgeMasks.end : edgeMasks.middle;
    if (collisionMap?.hasFlag(x, y, blockFlags)) {
      return false;
    }
  }
  return true;
}
function getDiagonalStepCollisionMasks(dx, dy) {
  if (dx === -1 && dy === -1) {
    return southWestStepCollisionMasks;
  } else if (dx === -1 && dy === 1) {
    return northWestStepCollisionMasks;
  } else if (dx === 1 && dy === -1) {
    return southEastStepCollisionMasks;
  } else if (dx === 1 && dy === 1) {
    return northEastStepCollisionMasks;
  } else {
    return null;
  }
}
function canFootprintStepDiagonally(fromTile, destinationFootprint, direction) {
  const { southWest: southWest, width: width, height: height } = destinationFootprint;
  const [dx, dy] = direction;
  const diagonalMasks = getDiagonalStepCollisionMasks(dx, dy);
  if (!diagonalMasks) {
    return false;
  }
  const collisionMap = getArenaCollisionMap();
  const isTileUnblocked = (x, y, blockFlags) => isArenaTileWalkable(x, y) && !collisionMap?.hasFlag(x, y, blockFlags);
  if (width === 1 && height === 1) {
    return (
      isTileUnblocked(southWest[0], southWest[1], diagonalMasks.corner) &&
      isTileUnblocked(fromTile[0] + dx, fromTile[1], diagonalMasks.xIntermediate) &&
      isTileUnblocked(fromTile[0], fromTile[1] + dy, diagonalMasks.yIntermediate)
    );
  }
  const cornerX = dx > 0 ? southWest[0] + width - 1 : southWest[0];
  const cornerY = dy > 0 ? southWest[1] + height - 1 : southWest[1];
  if (!isTileUnblocked(cornerX, cornerY, diagonalMasks.corner)) {
    return false;
  }
  for (let columnOffset = 1; columnOffset < width; columnOffset++) {
    if (!isTileUnblocked(cornerX - dx * columnOffset, cornerY, diagonalMasks.horizontalStrip)) {
      return false;
    }
  }
  for (let rowOffset = 1; rowOffset < height; rowOffset++) {
    if (!isTileUnblocked(cornerX, cornerY - dy * rowOffset, diagonalMasks.verticalStrip)) {
      return false;
    }
  }
  return true;
}
function isFootprintWithinArenaBounds(toTile, width, height) {
  const bounds = getArenaBounds();
  return (
    !bounds ||
    (toTile[0] >= bounds.minX &&
      toTile[1] >= bounds.minY &&
      toTile[0] + width - 1 <= bounds.maxX &&
      toTile[1] + height - 1 <= bounds.maxY)
  );
}
function canFootprintStepInArena(fromTile, toTile, footprintDimensions) {
  const { width: width, height: height } = footprintDimensions;
  if (
    !Number.isInteger(width) ||
    width < 1 ||
    !Number.isInteger(height) ||
    height < 1
  ) {
    return false;
  }
  const dx = toTile[0] - fromTile[0];
  const dy = toTile[1] - fromTile[1];
  if (dx === 0 && dy === 0) {
    return false;
  }
  if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
    return false;
  }
  if (
    !isFootprintWithinArenaBounds(toTile, width, height)
  ) {
    return false;
  }
  const destinationFootprint = {
    southWest: toTile,
    width: width,
    height: height,
  };
  if (dx !== 0 && dy !== 0) {
    return canFootprintStepDiagonally(fromTile, destinationFootprint, [dx, dy]);
  } else {
    return (dx === 0 || !!canFootprintStepCardinally(destinationFootprint, [dx, 0])) && (dy === 0 || !!canFootprintStepCardinally(destinationFootprint, [0, dy]));
  }
}
function isArenaFootprintWalkable(southWestTile, size) {
  for (let x = southWestTile[0]; x < southWestTile[0] + size; x++) {
    for (let y = southWestTile[1]; y < southWestTile[1] + size; y++) {
      if (!isInsideArenaBounds(x, y) || !isArenaTileWalkable(x, y)) {
        return false;
      }
    }
  }
  return true;
}
function getPursuitDestinationTile(actor, target) {
  const dx = actor.position[0] - target.position[0];
  const dy = actor.position[1] - target.position[1];
  const diagonalSum = dx + dy;
  const diagonalDifference = dx - dy;
  const inNorthWestHalf = diagonalDifference < 0;
  const inNorthEastHalf = diagonalSum >= target.size - actor.size;
  const inSouthEastHalf = diagonalDifference > 0;
  const inSouthWestHalf = diagonalSum <= target.size - actor.size;
  const [targetX, targetY] = target.position;
  if (inNorthWestHalf && !inNorthEastHalf) {
    const westOffsetY =
      diagonalSum >= -actor.size
        ? Math.min(diagonalSum + actor.size, target.size - 1)
        : diagonalDifference > -actor.size
          ? -(actor.size + diagonalDifference)
          : 0;
    return [targetX - actor.size, targetY + westOffsetY];
  }
  if (inNorthEastHalf && !inSouthEastHalf) {
    return [
      targetX +
        (diagonalDifference >= -target.size
          ? Math.min(diagonalDifference + target.size, target.size - 1)
          : diagonalSum < target.size
            ? Math.max(diagonalSum - target.size, -(actor.size - 1))
            : 0),
      targetY + target.size,
    ];
  }
  if (inSouthEastHalf && !inSouthWestHalf) {
    const eastOffsetY =
      diagonalDifference <= target.size
        ? target.size - diagonalDifference
        : diagonalSum < target.size
          ? Math.max(diagonalSum - target.size, -(actor.size - 1))
          : 0;
    return [targetX + target.size, targetY + eastOffsetY];
  }
  return [
    targetX +
      (diagonalSum > -actor.size
        ? Math.min(diagonalSum + actor.size, target.size - 1)
        : diagonalDifference < actor.size
          ? Math.max(diagonalDifference - actor.size, -(actor.size - 1))
          : 0),
    targetY - actor.size,
  ];
}
function getNpcPursuitMoves(actor, context, targetOverride) {
  if (
    !canNpcActAtTick(actor, context.tick) ||
    (actor.spawnTick !== undefined && actor.spawnTick > context.tick) ||
    actor.combat.attackRange <= 0
  ) {
    return [];
  }
  const combatTarget =
    actor.combat.targetId === null
      ? undefined
      : context.world.actors.get(actor.combat.targetId);
  const target = targetOverride ?? (combatTarget?.alive ? combatTarget : undefined);
  if (!target || isNpcHeldInPlace(actor, context.world.getPlayer(), context.tick)) {
    return [];
  }
  const isOverlappingTarget = areFootprintsOverlapping(actor, target);
  if (!isOverlappingTarget && isNpcInAttackRange(actor, target, actor.combat.attackRange)) {
    return [];
  }
  const isStepUnblocked = createOccupancyStepCheck(context.world.occupancy);
  const canStepTo = (toTile) =>
    canFootprintStepInArena(actor.position, toTile, {
      width: actor.size,
      height: actor.size,
    }) &&
    (actor.passThruNpcs === true || isStepUnblocked(actor.position, toTile, actor.size));
  if (isOverlappingTarget) {
    const escapeDirection = getContextDecisions(context).choose(
      {
        site: "npc.movement.overlap_escape",
        tick: context.tick,
        actorId: actor.id,
        targetId: target.id,
      },
      weightEqually([
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]),
    );
    const escapeTile = [actor.position[0] + escapeDirection[0], actor.position[1] + escapeDirection[1]];
    if (canStepTo(escapeTile)) {
      return [
        {
          npcId: actor.id,
          path: [escapeTile],
        },
      ];
    } else {
      return [];
    }
  }
  const destinationTile = getPursuitDestinationTile(actor, target);
  const stepX = Math.sign(destinationTile[0] - actor.position[0]);
  const stepY = Math.sign(destinationTile[1] - actor.position[1]);
  const nextTile = [
    [actor.position[0] + stepX, actor.position[1] + stepY],
    [actor.position[0] + stepX, actor.position[1]],
    [actor.position[0], actor.position[1] + stepY],
  ].find(canStepTo);
  if (nextTile) {
    return [
      {
        npcId: actor.id,
        path: [nextTile],
      },
    ];
  } else {
    return [];
  }
}
export { canFootprintStepInArena, isArenaFootprintWalkable, getNpcPursuitMoves };
