import { getArenaCollisionMap } from "./arena.js";
import { CollisionFlag } from "./collision.js";
function getDistanceToFootprint(fromX, fromY, targetX, targetY, targetSize) {
  const targetMaxX = targetX + targetSize - 1;
  const targetMaxY = targetY + targetSize - 1;
  const distanceX = fromX < targetX ? targetX - fromX : fromX > targetMaxX ? fromX - targetMaxX : 0;
  const distanceY = fromY < targetY ? targetY - fromY : fromY > targetMaxY ? fromY - targetMaxY : 0;
  return Math.max(distanceX, distanceY);
}
function getProjectileBlockFlag(directionX, directionY) {
  if (directionX === 1) {
    return CollisionFlag.BLOCK_EAST_PROJECTILE;
  } else if (directionX === -1) {
    return CollisionFlag.BLOCK_WEST_PROJECTILE;
  } else if (directionY === 1) {
    return CollisionFlag.BLOCK_NORTH_PROJECTILE;
  } else {
    return CollisionFlag.BLOCK_SOUTH_PROJECTILE;
  }
}
function hasLineOfSight(fromX, fromY, toX, toY) {
  const collisionMap = getArenaCollisionMap();
  if (!collisionMap) {
    return true;
  }
  if (fromX === toX && fromY === toY) {
    return true;
  }
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distanceX = Math.abs(dx);
  const distanceY = Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);
  const canProjectileEnter = (tileX, tileY, moveX, moveY) => {
    const flag = collisionMap.getFlag(tileX, tileY);
    return (
      flag !== -1 &&
      (flag &
        getProjectileBlockFlag(moveX, moveY)) ===
        0
    );
  };
  if (distanceX > distanceY) {
    let fixedY = 32768 + (fromY << 16);
    const slopeY = distanceX === 0 ? 0 : Math.floor((distanceY << 16) / distanceX);
    if (stepY < 0) {
      fixedY -= 1;
    }
    let x = fromX;
    while (x !== toX) {
      x += stepX;
      const tileY = fixedY >> 16;
      if (!canProjectileEnter(x, tileY, stepX, 0)) {
        return false;
      }
      fixedY += slopeY * stepY;
      const nextTileY = fixedY >> 16;
      if (nextTileY !== tileY && !canProjectileEnter(x, nextTileY, 0, stepY)) {
        return false;
      }
    }
    return true;
  }
  let fixedX = 32768 + (fromX << 16);
  const slopeX = Math.floor((distanceX << 16) / distanceY);
  if (stepX < 0) {
    fixedX -= 1;
  }
  let y = fromY;
  while (y !== toY) {
    y += stepY;
    const tileX = fixedX >> 16;
    if (!canProjectileEnter(tileX, y, 0, stepY)) {
      return false;
    }
    fixedX += slopeX * stepX;
    const nextTileX = fixedX >> 16;
    if (nextTileX !== tileX && !canProjectileEnter(nextTileX, y, stepX, 0)) {
      return false;
    }
  }
  return true;
}
function clampToInterval(coordinate, min, max) {
  if (coordinate < min) {
    return min;
  } else if (coordinate > max) {
    return max;
  } else {
    return coordinate;
  }
}
function areBoundsInAttackRange(fromMinX, fromMinY, fromMaxX, fromMaxY, toMinX, toMinY, toMaxX, toMaxY, attackRange, checkCollision, meleeReach = "cardinal") {
  const gapX = fromMaxX < toMinX ? toMinX - fromMaxX : toMaxX < fromMinX ? fromMinX - toMaxX : 0;
  const gapY = fromMaxY < toMinY ? toMinY - fromMaxY : toMaxY < fromMinY ? fromMinY - toMaxY : 0;
  if (Math.max(gapX, gapY) > attackRange) {
    return false;
  }
  if (attackRange <= 1 && meleeReach === "cardinal" && gapX > 0 && gapY > 0) {
    return false;
  }
  if (!checkCollision) {
    return true;
  }
  if (attackRange > 1 || meleeReach === "diagonal") {
    return hasLineOfSight(clampToInterval(toMinX, fromMinX, fromMaxX), clampToInterval(toMinY, fromMinY, fromMaxY), clampToInterval(fromMinX, toMinX, toMaxX), clampToInterval(fromMinY, toMinY, toMaxY));
  }
  if (gapX === 0 && gapY === 0) {
    return true;
  }
  if (fromMaxX < toMinX || toMaxX < fromMinX) {
    const fromEdgeX = fromMaxX < toMinX ? fromMaxX : fromMinX;
    const toEdgeX = fromMaxX < toMinX ? toMinX : toMaxX;
    const sharedMinY = Math.max(fromMinY, toMinY);
    const sharedMaxY = Math.min(fromMaxY, toMaxY);
    for (let y = sharedMinY; y <= sharedMaxY; y++) {
      if (!isWallBetweenAdjacentTiles(fromEdgeX, y, toEdgeX, y)) {
        return true;
      }
    }
    return false;
  }
  const fromEdgeY = fromMaxY < toMinY ? fromMaxY : fromMinY;
  const toEdgeY = fromMaxY < toMinY ? toMinY : toMaxY;
  const sharedMinX = Math.max(fromMinX, toMinX);
  const sharedMaxX = Math.min(fromMaxX, toMaxX);
  for (let x = sharedMinX; x <= sharedMaxX; x++) {
    if (!isWallBetweenAdjacentTiles(x, fromEdgeY, x, toEdgeY)) {
      return true;
    }
  }
  return false;
}
function isInAttackRangeWithCollision(fromX, fromY, targetX, targetY, targetSize, attackRange, meleeReach = "cardinal") {
  const footprintSize = Math.max(1, targetSize);
  return areBoundsInAttackRange(fromX, fromY, fromX, fromY, targetX, targetY, targetX + footprintSize - 1, targetY + footprintSize - 1, attackRange, true, meleeReach);
}
function isFootprintInAttackRange(fromFootprint, toFootprint, options) {
  const fromWidth = Math.max(1, Math.trunc(fromFootprint.width));
  const fromHeight = Math.max(1, Math.trunc(fromFootprint.height));
  const toWidth = Math.max(1, Math.trunc(toFootprint.width));
  const toHeight = Math.max(1, Math.trunc(toFootprint.height));
  return areBoundsInAttackRange(
    fromFootprint.southWest[0],
    fromFootprint.southWest[1],
    fromFootprint.southWest[0] + fromWidth - 1,
    fromFootprint.southWest[1] + fromHeight - 1,
    toFootprint.southWest[0],
    toFootprint.southWest[1],
    toFootprint.southWest[0] + toWidth - 1,
    toFootprint.southWest[1] + toHeight - 1,
    options.attackRange,
    options.checkCollision ?? false,
    options.meleeReach,
  );
}
function isInAttackRangeWithoutCollision(fromX, fromY, targetX, targetY, targetSize, attackRange, meleeReach = "cardinal") {
  const footprintSize = Math.max(1, targetSize);
  return areBoundsInAttackRange(fromX, fromY, fromX, fromY, targetX, targetY, targetX + footprintSize - 1, targetY + footprintSize - 1, attackRange, false, meleeReach);
}
function isTileInAttackRange(fromTile, targetTile, targetSize, attackRange, checkCollision = false, meleeReach = "cardinal") {
  if (checkCollision) {
    return isInAttackRangeWithCollision(fromTile[0], fromTile[1], targetTile[0], targetTile[1], targetSize, attackRange, meleeReach);
  } else {
    return isInAttackRangeWithoutCollision(fromTile[0], fromTile[1], targetTile[0], targetTile[1], targetSize, attackRange, meleeReach);
  }
}
function isTileInsideFootprint(tile, targetTile, targetSize) {
  return isPointInsideFootprint(tile[0], tile[1], targetTile[0], targetTile[1], targetSize);
}
function isPointInsideFootprint(x, y, targetX, targetY, targetSize) {
  return x >= targetX && x <= targetX + targetSize - 1 && y >= targetY && y <= targetY + targetSize - 1;
}
function isWallBetweenAdjacentTiles(fromX, fromY, toX, toY) {
  const collisionMap = getArenaCollisionMap();
  if (!collisionMap) {
    return false;
  }
  const dx = toX - fromX;
  const dy = toY - fromY;
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    return false;
  }
  const fromFlag = collisionMap.getFlag(fromX, fromY);
  const toFlag = collisionMap.getFlag(toX, toY);
  return (
    fromFlag !== -1 &&
    toFlag !== -1 &&
    (dx === 1
      ? (fromFlag & CollisionFlag.WALL_EAST) !== 0 || (toFlag & CollisionFlag.WALL_WEST) !== 0
      : dx === -1
        ? (fromFlag & CollisionFlag.WALL_WEST) !== 0 || (toFlag & CollisionFlag.WALL_EAST) !== 0
        : dy === 1
          ? (fromFlag & CollisionFlag.WALL_NORTH) !== 0 || (toFlag & CollisionFlag.WALL_SOUTH) !== 0
          : (fromFlag & CollisionFlag.WALL_SOUTH) !== 0 || (toFlag & CollisionFlag.WALL_NORTH) !== 0)
  );
}
function areFootprintsOverlapping(footprint, otherFootprint) {
  return (
    footprint.position[0] < otherFootprint.position[0] + otherFootprint.size &&
    footprint.position[0] + footprint.size > otherFootprint.position[0] &&
    footprint.position[1] < otherFootprint.position[1] + otherFootprint.size &&
    footprint.position[1] + footprint.size > otherFootprint.position[1]
  );
}
export { getDistanceToFootprint, hasLineOfSight, isInAttackRangeWithCollision, isFootprintInAttackRange, isTileInAttackRange, isTileInsideFootprint, isPointInsideFootprint, areFootprintsOverlapping };
