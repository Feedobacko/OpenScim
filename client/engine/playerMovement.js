import { getArenaCollisionMap, getArenaWalkableTiles, isArenaTileWalkable } from "./arena.js";
import { isInAttackRangeWithCollision, isPointInsideFootprint } from "./attackRange.js";
import { CollisionFlag } from "./collision.js";
var pathfindNeighborOffsets = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
// One per entry of pathfindNeighborOffsets: what the search writes on a tile
// it enters, so that reconstructBfsPath can walk back. The bits say where
// the step came from: 1 from the north, 2 from the east, 4 from the south, 8
// from the west. 99 marks the tile the search started on; 0 is a tile it
// never entered.
var pathfindBacktrackFlags = [2, 8, 1, 4, 3, 9, 6, 12];
var cardinalBlockFlags = [CollisionFlag.BLOCK_WEST, CollisionFlag.BLOCK_EAST, CollisionFlag.BLOCK_SOUTH, CollisionFlag.BLOCK_NORTH];
var diagonalBlockFlagSets = [
  [CollisionFlag.BLOCK_SOUTH_WEST, CollisionFlag.BLOCK_WEST, CollisionFlag.BLOCK_SOUTH],
  [CollisionFlag.BLOCK_SOUTH_EAST, CollisionFlag.BLOCK_EAST, CollisionFlag.BLOCK_SOUTH],
  [CollisionFlag.BLOCK_NORTH_WEST, CollisionFlag.BLOCK_WEST, CollisionFlag.BLOCK_NORTH],
  [CollisionFlag.BLOCK_NORTH_EAST, CollisionFlag.BLOCK_EAST, CollisionFlag.BLOCK_NORTH],
];
var PATHFIND_UNVISITED_COST = 99999999;
function reconstructBfsPath(backtrackGrid, gridOriginX, gridOriginY, startX, startY, endX, endY) {
  const path = [];
  let x = endX;
  let y = endY;
  while (x !== startX || y !== startY) {
    path.push([x, y]);
    const backtrackFlag = backtrackGrid[x - gridOriginX][y - gridOriginY];
    if (0 === backtrackFlag || backtrackFlag === 99) {
      break;
    }
    if (backtrackFlag & 2) {
      x++;
    } else if (backtrackFlag & 8) {
      x--;
    }
    if (1 & backtrackFlag) {
      y++;
    } else if (4 & backtrackFlag) {
      y--;
    }
  }
  path.reverse();
  return path;
}
function nextPowerOfTwoAtLeast16(minimumSize) {
  let roundedSize = Math.max(16, minimumSize);
  roundedSize--;
  roundedSize |= roundedSize >> 1;
  roundedSize |= roundedSize >> 2;
  roundedSize |= roundedSize >> 4;
  roundedSize |= roundedSize >> 8;
  roundedSize |= roundedSize >> 16;
  roundedSize++;
  return roundedSize;
}
function takeStepsAlongPath(fromTile, path, isRunning, npcBounds) {
  if (path.length === 0) {
    return {
      position: [...fromTile],
      stepTiles: [],
    };
  }
  const maxSteps = isRunning ? 2 : 1;
  const stepTiles = [];
  for (let i = 0; i < Math.min(maxSteps, path.length); i++) {
    const [x, y] = path[i];
    if (
      npcBounds &&
      x >= npcBounds.minX &&
      x <= npcBounds.maxX &&
      y >= npcBounds.minY &&
      y <= npcBounds.maxY
    ) {
      break;
    }
    stepTiles.push([x, y]);
  }
  return {
    position: stepTiles[stepTiles.length - 1] ?? [...fromTile],
    stepTiles: stepTiles,
  };
}
function findBfsPathToTile(fromTile, targetTile) {
  const [startX, startY] = fromTile;
  const [targetX, targetY] = targetTile;
  if (startX === targetX && startY === targetY) {
    return [];
  }
  const gridSize = 128;
  const gridOriginX = startX - 64;
  const gridOriginY = startY - 64;
  const costGrid = [];
  const backtrackGrid = [];
  for (let i = 0; i < gridSize; i++) {
    costGrid[i] = new Array(gridSize).fill(PATHFIND_UNVISITED_COST);
    backtrackGrid[i] = new Array(gridSize).fill(0);
  }
  const queueCapacity = nextPowerOfTwoAtLeast16(16384);
  const queueMask = queueCapacity - 1;
  const queueX = new Int32Array(queueCapacity);
  const queueY = new Int32Array(queueCapacity);
  backtrackGrid[64][64] = 99;
  costGrid[64][64] = 0;
  let queueTail = 0;
  let queueHead = 0;
  queueX[queueTail] = startX;
  queueY[queueTail] = startY;
  queueTail = (queueTail + 1) & queueMask;
  let reachedTarget = false;
  let endX = startX;
  let endY = startY;
  const collisionMap = getArenaCollisionMap();
  while (queueHead !== queueTail) {
    const x = queueX[queueHead];
    const y = queueY[queueHead];
    queueHead = (queueHead + 1) & queueMask;
    const gridX = x - gridOriginX;
    const gridY = y - gridOriginY;
    if (x === targetX && y === targetY) {
      endX = x;
      endY = y;
      reachedTarget = true;
      break;
    }
    const neighborCost = costGrid[gridX][gridY] + 1;
    for (let direction = 0; direction < 8; direction++) {
      const [dx, dy] = pathfindNeighborOffsets[direction];
      const neighborX = x + dx;
      const neighborY = y + dy;
      const neighborGridX = neighborX - gridOriginX;
      const neighborGridY = neighborY - gridOriginY;
      if (neighborGridX < 0 || neighborGridX >= gridSize || neighborGridY < 0 || neighborGridY >= gridSize) {
        continue;
      }
      if (backtrackGrid[neighborGridX][neighborGridY] !== 0) {
        continue;
      }
      if (!isArenaTileWalkable(neighborX, neighborY)) {
        continue;
      }
      let isBlocked = false;
      if (collisionMap) {
        if (direction < 4) {
          isBlocked = collisionMap.hasFlag(neighborX, neighborY, cardinalBlockFlags[direction]);
        } else {
          const diagonalIndex = direction - 4;
          const [diagonalBlockFlag, horizontalBlockFlag, verticalBlockFlag] = diagonalBlockFlagSets[diagonalIndex];
          isBlocked =
            collisionMap.hasFlag(neighborX, neighborY, diagonalBlockFlag) ||
            collisionMap.hasFlag(x + dx, y, horizontalBlockFlag) ||
            collisionMap.hasFlag(x, y + dy, verticalBlockFlag);
        }
      }
      if (!isBlocked) {
        backtrackGrid[neighborGridX][neighborGridY] = pathfindBacktrackFlags[direction];
        costGrid[neighborGridX][neighborGridY] = neighborCost;
        queueX[queueTail] = neighborX;
        queueY[queueTail] = neighborY;
        queueTail = (queueTail + 1) & queueMask;
      }
    }
  }
  if (!reachedTarget) {
    let closestDistanceSquared = Infinity;
    let closestCost = Infinity;
    for (let candidateX = targetX - 10; candidateX <= targetX + 10; candidateX++) {
      for (let candidateY = targetY - 10; candidateY <= targetY + 10; candidateY++) {
        const candidateGridX = candidateX - gridOriginX;
        const candidateGridY = candidateY - gridOriginY;
        if (candidateGridX < 0 || candidateGridY < 0 || candidateGridX >= gridSize || candidateGridY >= gridSize) {
          continue;
        }
        if (costGrid[candidateGridX][candidateGridY] >= 100) {
          continue;
        }
        const distanceX = Math.abs(candidateX - targetX);
        const distanceY = Math.abs(candidateY - targetY);
        const distanceSquared = distanceX * distanceX + distanceY * distanceY;
        if (distanceSquared < closestDistanceSquared || (distanceSquared === closestDistanceSquared && costGrid[candidateGridX][candidateGridY] < closestCost)) {
          closestDistanceSquared = distanceSquared;
          closestCost = costGrid[candidateGridX][candidateGridY];
          endX = candidateX;
          endY = candidateY;
        }
      }
    }
    if (closestDistanceSquared === Infinity) {
      return [];
    }
  }
  if (endX === startX && endY === startY) {
    return [];
  } else {
    return reconstructBfsPath(backtrackGrid, gridOriginX, gridOriginY, startX, startY, endX, endY);
  }
}
function computeStepToTileInArena(fromTile, targetTile, isRunning) {
  return takeStepsAlongPath(
    fromTile,
    findBfsPathToTile(fromTile, targetTile),
    isRunning,
  );
}
function getRunOffset(targetOffset) {
  const [dx, dy] = targetOffset;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const distance = Math.max(absDx, absDy);
  if (distance <= 2) {
    return [dx, dy];
  }
  const signX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const signY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  if (distance <= 4) {
    let majorSteps;
    let minorSteps;
    let majorDistance = absDx;
    let minorDistance = absDy;
    let majorSign = signX;
    let minorSign = signY;
    let axesSwapped = false;
    if (minorDistance > majorDistance) {
      [majorDistance, minorDistance] = [minorDistance, majorDistance];
      [majorSign, minorSign] = [minorSign, majorSign];
      axesSwapped = true;
    }
    if (minorDistance <= 1) {
      majorSteps = 2;
      minorSteps = 0;
    } else if (minorDistance === 2) {
      if (majorDistance === 3) {
        majorSteps = 2;
        minorSteps = 1;
      } else {
        majorSteps = 2;
        minorSteps = 0;
      }
    } else if (majorDistance === minorDistance) {
      majorSteps = 2;
      minorSteps = 2;
    } else if (majorDistance === minorDistance + 1) {
      majorSteps = 2;
      minorSteps = 1;
    } else {
      majorSteps = 2;
      minorSteps = 0;
    }
    let stepDx = majorSign * majorSteps;
    let stepDy = minorSign * minorSteps;
    if (axesSwapped) {
      [stepDx, stepDy] = [stepDy, stepDx];
    }
    return [stepDx, stepDy];
  }
  const axisDifference = Math.abs(absDx - absDy);
  if (axisDifference >= 2) {
    if (absDx > absDy) {
      return [2 * signX, 0];
    } else {
      return [0, signY * 2];
    }
  } else if (1 === axisDifference) {
    if (absDx > absDy) {
      return [2 * signX, signY * 1];
    } else {
      return [1 * signX, 2 * signY];
    }
  } else {
    return [signX * 2, signY * 2];
  }
}
function getRunStepOffsets(runDx, runDy) {
  if (0 === runDx && runDy === 0) {
    return [];
  }
  const offsets = [];
  const absDx = Math.abs(runDx);
  const absDy = Math.abs(runDy);
  const signX = runDx > 0 ? 1 : runDx < 0 ? -1 : 0;
  const signY = runDy > 0 ? 1 : runDy < 0 ? -1 : 0;
  const straightSteps = Math.abs(absDx - absDy);
  const diagonalSteps = Math.min(absDx, absDy);
  if (absDx > absDy) {
    for (let i = 0; i < straightSteps; i++) {
      offsets.push([signX, 0]);
    }
  } else if (absDy > absDx) {
    for (let i = 0; i < straightSteps; i++) {
      offsets.push([0, signY]);
    }
  }
  for (let i = 0; i < diagonalSteps; i++) {
    offsets.push([signX, signY]);
  }
  return offsets;
}
function computeStepToTileWithoutArena(fromTile, targetTile, isRunning) {
  const stepTiles = [];
  let [x, y] = fromTile;
  const [targetX, targetY] = targetTile;
  if (x !== targetX || y !== targetY) {
    const dx = targetX - x;
    const dy = targetY - y;
    if (isRunning) {
      const [runDx, runDy] = getRunOffset([dx, dy]);
      const stepOffsets = getRunStepOffsets(runDx, runDy);
      for (const [stepDx, stepDy] of stepOffsets) {
        const nextX = x + stepDx;
        const nextY = y + stepDy;
        if (!isArenaTileWalkable(nextX, nextY)) {
          break;
        }
        x = nextX;
        y = nextY;
        stepTiles.push([x, y]);
      }
    } else {
      const nextX = x + (dx > 0 ? 1 : dx < 0 ? -1 : 0);
      const nextY = y + (dy > 0 ? 1 : dy < 0 ? -1 : 0);
      if (isArenaTileWalkable(nextX, nextY)) {
        x = nextX;
        y = nextY;
        stepTiles.push([x, y]);
      }
    }
  }
  return {
    position: stepTiles[stepTiles.length - 1] ?? [...fromTile],
    stepTiles: stepTiles,
  };
}
function computePlayerStepToTile(fromTile, targetTile, isRunning = true) {
  if (getArenaCollisionMap() !== null || getArenaWalkableTiles() !== null) {
    return computeStepToTileInArena(fromTile, targetTile, isRunning);
  } else {
    return computeStepToTileWithoutArena(fromTile, targetTile, isRunning);
  }
}
// The same breadth-first search as findBfsPathToTile: the grid of 128
// around the start, the queue, and the eight neighbours in the same order
// with the same collision tests are the same statement for statement. Two
// things differ. The goal, tested on the start tile and on every tile taken
// from the queue: a tile from which the target is in attack range (and, with
// mustBeOutsideTarget, outside its footprint) in place of the target tile
// itself. And the fallback when no goal was reached. Both take a tile that
// was reached at a cost under 100, the cheaper of two that are equally
// near: here the one with the least gap to the target's footprint, searched
// 10 + targetSize + attackRange tiles around it; there the one nearest to
// the target tile, within 10.
function findBfsPathToAttackRange(fromTile, targetTile, targetSize, attackRange, mustBeOutsideTarget = false) {
  const [startX, startY] = fromTile;
  if (
    isInAttackRangeWithCollision(startX, startY, targetTile[0], targetTile[1], targetSize, attackRange) &&
    (!mustBeOutsideTarget || !isPointInsideFootprint(startX, startY, targetTile[0], targetTile[1], targetSize))
  ) {
    return [];
  }
  const gridSize = 128;
  const gridOriginX = startX - 64;
  const gridOriginY = startY - 64;
  const costGrid = [];
  const backtrackGrid = [];
  for (let i = 0; i < gridSize; i++) {
    costGrid[i] = new Array(gridSize).fill(PATHFIND_UNVISITED_COST);
    backtrackGrid[i] = new Array(gridSize).fill(0);
  }
  const queueCapacity = nextPowerOfTwoAtLeast16(16384);
  const queueMask = queueCapacity - 1;
  const queueX = new Int32Array(queueCapacity);
  const queueY = new Int32Array(queueCapacity);
  backtrackGrid[64][64] = 99;
  costGrid[64][64] = 0;
  let queueTail = 0;
  let queueHead = 0;
  queueX[queueTail] = startX;
  queueY[queueTail] = startY;
  queueTail = (queueTail + 1) & queueMask;
  let reachedTarget = false;
  let endX = startX;
  let endY = startY;
  const collisionMap = getArenaCollisionMap();
  while (queueHead !== queueTail) {
    const x = queueX[queueHead];
    const y = queueY[queueHead];
    queueHead = (queueHead + 1) & queueMask;
    const gridX = x - gridOriginX;
    const gridY = y - gridOriginY;
    if (
      isInAttackRangeWithCollision(x, y, targetTile[0], targetTile[1], targetSize, attackRange) &&
      (!mustBeOutsideTarget || !isPointInsideFootprint(x, y, targetTile[0], targetTile[1], targetSize))
    ) {
      endX = x;
      endY = y;
      reachedTarget = true;
      break;
    }
    const neighborCost = costGrid[gridX][gridY] + 1;
    for (let direction = 0; direction < 8; direction++) {
      const [dx, dy] = pathfindNeighborOffsets[direction];
      const neighborX = x + dx;
      const neighborY = y + dy;
      const neighborGridX = neighborX - gridOriginX;
      const neighborGridY = neighborY - gridOriginY;
      if (neighborGridX < 0 || neighborGridX >= gridSize || neighborGridY < 0 || neighborGridY >= gridSize) {
        continue;
      }
      if (backtrackGrid[neighborGridX][neighborGridY] !== 0) {
        continue;
      }
      if (!isArenaTileWalkable(neighborX, neighborY)) {
        continue;
      }
      let isBlocked = false;
      if (collisionMap) {
        if (direction < 4) {
          isBlocked = collisionMap.hasFlag(neighborX, neighborY, cardinalBlockFlags[direction]);
        } else {
          const diagonalIndex = direction - 4;
          const [diagonalBlockFlag, horizontalBlockFlag, verticalBlockFlag] = diagonalBlockFlagSets[diagonalIndex];
          isBlocked =
            collisionMap.hasFlag(neighborX, neighborY, diagonalBlockFlag) ||
            collisionMap.hasFlag(x + dx, y, horizontalBlockFlag) ||
            collisionMap.hasFlag(x, y + dy, verticalBlockFlag);
        }
      }
      if (!isBlocked) {
        backtrackGrid[neighborGridX][neighborGridY] = pathfindBacktrackFlags[direction];
        costGrid[neighborGridX][neighborGridY] = neighborCost;
        queueX[queueTail] = neighborX;
        queueY[queueTail] = neighborY;
        queueTail = (queueTail + 1) & queueMask;
      }
    }
  }
  if (!reachedTarget) {
    const targetMaxX = targetTile[0] + targetSize - 1;
    const targetMaxY = targetTile[1] + targetSize - 1;
    let closestDistanceSquared = 1 / 0;
    let closestCost = Infinity;
    const searchRadius = 10 + targetSize + attackRange;
    for (let candidateX = targetTile[0] - searchRadius; candidateX <= targetMaxX + searchRadius; candidateX++) {
      for (let candidateY = targetTile[1] - searchRadius; candidateY <= targetMaxY + searchRadius; candidateY++) {
        const candidateGridX = candidateX - gridOriginX;
        const candidateGridY = candidateY - gridOriginY;
        if (candidateGridX < 0 || candidateGridY < 0 || candidateGridX >= gridSize || candidateGridY >= gridSize) {
          continue;
        }
        if (costGrid[candidateGridX][candidateGridY] >= 100) {
          continue;
        }
        const gapX = candidateX < targetTile[0] ? targetTile[0] - candidateX : candidateX > targetMaxX ? candidateX - targetMaxX : 0;
        const gapY = candidateY < targetTile[1] ? targetTile[1] - candidateY : candidateY > targetMaxY ? candidateY - targetMaxY : 0;
        const distanceSquared = gapX * gapX + gapY * gapY;
        if (distanceSquared < closestDistanceSquared || (distanceSquared === closestDistanceSquared && costGrid[candidateGridX][candidateGridY] < closestCost)) {
          closestDistanceSquared = distanceSquared;
          closestCost = costGrid[candidateGridX][candidateGridY];
          endX = candidateX;
          endY = candidateY;
        }
      }
    }
    if (closestDistanceSquared === 1 / 0) {
      return [];
    }
  }
  if (endX === startX && endY === startY) {
    return [];
  } else {
    return reconstructBfsPath(backtrackGrid, gridOriginX, gridOriginY, startX, startY, endX, endY);
  }
}
function computePlayerStepToNpc(playerTile, npcTile, npcSize, isRunning = true) {
  const npcBounds = {
    minX: npcTile[0],
    minY: npcTile[1],
    maxX: npcTile[0] + npcSize - 1,
    maxY: npcTile[1] + npcSize - 1,
  };
  if (null !== getArenaCollisionMap() || getArenaWalkableTiles() !== null) {
    return takeStepsAlongPath(
      playerTile,
      findBfsPathToAttackRange(playerTile, npcTile, npcSize, 1, true),
      isRunning,
    );
  }
  const npcX = npcTile[0];
  const npcY = npcTile[1];
  const footprintSize = npcSize;
  let destinationX = Math.max(npcX - 1, Math.min(playerTile[0], npcX + footprintSize));
  let destinationY = Math.max(npcY - 1, Math.min(playerTile[1], npcY + footprintSize));
  if (destinationX >= npcBounds.minX && destinationX <= npcBounds.maxX && destinationY >= npcBounds.minY && destinationY <= npcBounds.maxY) {
    const distanceToWestEdge = destinationX - npcBounds.minX;
    const distanceToEastEdge = npcBounds.maxX - destinationX;
    const distanceToSouthEdge = destinationY - npcBounds.minY;
    const distanceToNorthEdge = npcBounds.maxY - destinationY;
    const nearestEdgeDistance = Math.min(distanceToWestEdge, distanceToEastEdge, distanceToSouthEdge, distanceToNorthEdge);
    if (nearestEdgeDistance === distanceToWestEdge) {
      destinationX = npcBounds.minX - 1;
    } else if (nearestEdgeDistance === distanceToEastEdge) {
      destinationX = npcBounds.maxX + 1;
    } else {
      destinationY = nearestEdgeDistance === distanceToSouthEdge ? npcBounds.minY - 1 : npcBounds.maxY + 1;
    }
  }
  if (
    (destinationX < npcX ? npcX - destinationX : destinationX > npcBounds.maxX ? destinationX - npcBounds.maxX : 0) > 0 &&
    (destinationY < npcY ? npcY - destinationY : destinationY > npcBounds.maxY ? destinationY - npcBounds.maxY : 0) > 0
  ) {
    const eastWestSideTile = [destinationX, destinationY < npcY ? npcY : npcBounds.maxY];
    const northSouthSideTile = [destinationX < npcX ? npcX : npcBounds.maxX, destinationY];
    if (
      Math.abs(playerTile[0] - eastWestSideTile[0]) + Math.abs(playerTile[1] - eastWestSideTile[1]) <=
      Math.abs(playerTile[0] - northSouthSideTile[0]) + Math.abs(playerTile[1] - northSouthSideTile[1])
    ) {
      [destinationX, destinationY] = eastWestSideTile;
    } else {
      [destinationX, destinationY] = northSouthSideTile;
    }
  }
  return computePlayerStepToTile(playerTile, [destinationX, destinationY], isRunning);
}
export { computePlayerStepToTile, computePlayerStepToNpc };
