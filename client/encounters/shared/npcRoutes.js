import { canFootprintStepInArena } from "./npcMovement.js";
var routeGridSize = 128;
var routeGridTileCount = 16384;
var routeStepDeltas = [
  {
    deltaX: -1,
    deltaY: 0,
  },
  {
    deltaX: 1,
    deltaY: 0,
  },
  {
    deltaX: 0,
    deltaY: -1,
  },
  {
    deltaX: 0,
    deltaY: 1,
  },
  {
    deltaX: -1,
    deltaY: -1,
  },
  {
    deltaX: 1,
    deltaY: -1,
  },
  {
    deltaX: -1,
    deltaY: 1,
  },
  {
    deltaX: 1,
    deltaY: 1,
  },
];
function getDistanceToInterval(rangeMin, rangeMax, coordinate) {
  if (coordinate < rangeMin) {
    return rangeMin - coordinate;
  } else if (coordinate > rangeMax) {
    return coordinate - rangeMax;
  } else {
    return 0;
  }
}
function isTileInFootprint(southWestTile, size, tile) {
  return (
    getDistanceToInterval(southWestTile[0], southWestTile[0] + size - 1, tile[0]) === 0 && getDistanceToInterval(southWestTile[1], southWestTile[1] + size - 1, tile[1]) === 0
  );
}
function isTileCardinallyAdjacentToFootprint(southWestTile, size, tile) {
  return getDistanceToInterval(southWestTile[0], southWestTile[0] + size - 1, tile[0]) + getDistanceToInterval(southWestTile[1], southWestTile[1] + size - 1, tile[1]) === 1;
}
function getRouteGridIndex(windowX, windowY) {
  return windowX * routeGridSize + windowY;
}
function buildRouteSteps(endIndex, searchTree) {
  const steps = [];
  let cellIndex = endIndex;
  while (cellIndex !== searchTree.startIndex) {
    const windowX = Math.floor(cellIndex / routeGridSize);
    const windowY = cellIndex % routeGridSize;
    steps.push([searchTree.base[0] + windowX, searchTree.base[1] + windowY]);
    cellIndex = searchTree.parents[cellIndex];
  }
  steps.reverse();
  return steps;
}
function findNpcRouteToMeleeRange(pathRequest) {
  return findNpcRoute(pathRequest, "melee");
}
function findNearestReachedIndex(pathRequest, baseTile, stepCounts) {
  const { destination: destination, size: size } = pathRequest;
  const destinationWindowX = destination[0] - baseTile[0];
  const destinationWindowY = destination[1] - baseTile[1];
  let bestIndex = null;
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestStepCount = 100;
  for (let windowX = destinationWindowX - 10; windowX <= destinationWindowX + 10; windowX++) {
    for (let windowY = destinationWindowY - 10; windowY <= destinationWindowY + 10; windowY++) {
      if (windowX < 0 || windowY < 0 || windowX >= routeGridSize || windowY >= routeGridSize) {
        continue;
      }
      const cellIndex = getRouteGridIndex(windowX, windowY);
      const stepCount = stepCounts[cellIndex];
      if (stepCount < 0 || stepCount >= 100) {
        continue;
      }
      const tileX = baseTile[0] + windowX;
      const tileY = baseTile[1] + windowY;
      if (isTileInFootprint([tileX, tileY], size, destination)) {
        continue;
      }
      const dx = getDistanceToInterval(destination[0], destination[0], tileX);
      const dy = getDistanceToInterval(destination[1], destination[1], tileY);
      const distanceSquared = dx * dx + dy * dy;
      if (distanceSquared < bestDistanceSquared || (distanceSquared === bestDistanceSquared && stepCount < bestStepCount)) {
        bestIndex = cellIndex;
        bestDistanceSquared = distanceSquared;
        bestStepCount = stepCount;
      }
    }
  }
  return bestIndex;
}
function findNpcRoute(pathRequest, goal) {
  const {
    source: source,
    size: size,
    destination: destination,
    canOccupy: canOccupy,
  } = pathRequest;
  const baseTile = [source[0] - 64, source[1] - 64];
  const startIndex = getRouteGridIndex(64, 64);
  const parents = new Int32Array(routeGridTileCount);
  parents.fill(-1);
  parents[startIndex] = startIndex;
  const stepCounts = new Int16Array(routeGridTileCount);
  stepCounts.fill(-1);
  stepCounts[startIndex] = 0;
  const queue = new Int32Array(routeGridTileCount);
  queue[0] = startIndex;
  let queueHead = 0;
  let queueTail = 1;
  const maxWindowCoordinate = routeGridSize - size;
  const footprintDimensions = {
    width: size,
    height: size,
  };
  const searchTree = {
    startIndex: startIndex,
    parents: parents,
    base: baseTile,
  };
  while (queueHead < queueTail) {
    const cellIndex = queue[queueHead++];
    const windowX = Math.floor(cellIndex / routeGridSize);
    const windowY = cellIndex % routeGridSize;
    const currentTile = [baseTile[0] + windowX, baseTile[1] + windowY];
    if (
      goal === "tile"
        ? currentTile[0] === destination[0] && currentTile[1] === destination[1]
        : isTileCardinallyAdjacentToFootprint(currentTile, size, destination)
    ) {
      return {
        kind: "exact",
        steps: buildRouteSteps(cellIndex, searchTree),
      };
    }
    for (const { deltaX: deltaX, deltaY: deltaY } of routeStepDeltas) {
      const nextWindowX = windowX + deltaX;
      const nextWindowY = windowY + deltaY;
      if (nextWindowX < 0 || nextWindowY < 0 || nextWindowX > maxWindowCoordinate || nextWindowY > maxWindowCoordinate) {
        continue;
      }
      const nextIndex = getRouteGridIndex(nextWindowX, nextWindowY);
      if (parents[nextIndex] !== -1) {
        continue;
      }
      const nextTile = [currentTile[0] + deltaX, currentTile[1] + deltaY];
      if (goal !== "melee" || !isTileInFootprint(nextTile, size, destination)) {
        if (
          canOccupy(nextTile, size) &&
          canFootprintStepInArena(currentTile, nextTile, footprintDimensions) &&
          pathRequest.canStep?.(currentTile, nextTile, size) !== false
        ) {
          parents[nextIndex] = cellIndex;
          stepCounts[nextIndex] = stepCounts[cellIndex] + 1;
          queue[queueTail++] = nextIndex;
        }
      }
    }
  }
  if (goal === "tile" || pathRequest.moveNear === false) {
    return {
      kind: "failed",
    };
  }
  const nearestIndex = findNearestReachedIndex(pathRequest, baseTile, stepCounts);
  if (nearestIndex === null) {
    return {
      kind: "failed",
    };
  } else {
    return {
      kind: "alternative",
      steps: buildRouteSteps(nearestIndex, searchTree),
    };
  }
}
var moveNearByUnreachablePolicy = {
  "nearest-reachable": true,
  hold: false,
};
function isTileUnderFootprint(southWestTile, size, tile) {
  return isTileInFootprint(southWestTile, size, tile);
}
function throwUnhandledNpcRouteResult(unhandledResult) {
  throw new RangeError(`Unhandled NPC route result: ${JSON.stringify(unhandledResult)}`);
}
function findBossPursuitPath(pursuit) {
  const {
    bossSW: bossSW,
    size: size,
    player: playerTile,
    rng: random,
    maxSpeed: maxSpeed,
    canOccupy: canOccupy,
    canStep: canStep,
    underFootprint: underFootprint,
    unreachable: unreachable,
  } = pursuit;
  if (maxSpeed <= 0) {
    return [];
  }
  if (isTileUnderFootprint(bossSW, size, playerTile)) {
    switch (underFootprint) {
      case "hold":
        return [];
      case "random-cardinal": {
        const isHorizontalStep = random() < 0.5;
        const stepDelta = random() < 0.5 ? 1 : -1;
        const escapeTile = isHorizontalStep ? [bossSW[0] + stepDelta, bossSW[1]] : [bossSW[0], bossSW[1] + stepDelta];
        if (
          canOccupy(escapeTile, size) &&
          canStep?.(bossSW, escapeTile, size) !== false &&
          canFootprintStepInArena(bossSW, escapeTile, {
            width: size,
            height: size,
          })
        ) {
          return [escapeTile];
        } else {
          return [];
        }
      }
      default:
        return throwUnhandledNpcRouteResult(underFootprint);
    }
  }
  const route = findNpcRouteToMeleeRange({
    source: bossSW,
    size: size,
    destination: playerTile,
    canOccupy: canOccupy,
    canStep: canStep,
    moveNear: moveNearByUnreachablePolicy[unreachable],
  });
  switch (route.kind) {
    case "exact":
    case "alternative":
      return route.steps.slice(0, maxSpeed);
    case "failed":
      return [];
    default:
      return throwUnhandledNpcRouteResult(route);
  }
}
function getBossPursuitMoves(boss, playerTile, random, pursuitMovement) {
  const path = findBossPursuitPath({
    bossSW: boss.position,
    size: pursuitMovement.size,
    player: playerTile,
    rng: random,
    maxSpeed: pursuitMovement.maxSpeed,
    canOccupy: pursuitMovement.canOccupy,
    canStep: pursuitMovement.canStep,
    underFootprint: pursuitMovement.underFootprint,
    unreachable: pursuitMovement.unreachable,
  });
  if (path.length === 0) {
    return [];
  } else {
    return [
      {
        npcId: boss.id,
        path: path,
      },
    ];
  }
}
export {
  isTileInFootprint,
  findNpcRouteToMeleeRange,
  findNpcRoute,
  isTileUnderFootprint,
  getBossPursuitMoves,
};
