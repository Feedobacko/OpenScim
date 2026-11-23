import { tripleShortHitTickOffsets, tripleLongHitTickOffsets, tripleShortHitDamages, tripleLongHitDamages, isSolArenaTile } from "./constants.js";
function getSolCentreTile(bossPosition) {
  return [bossPosition[0] + 2, bossPosition[1] + 2];
}
function getChebyshevTileDistance(fromTile, toTile) {
  return Math.max(Math.abs(fromTile[0] - toTile[0]), Math.abs(fromTile[1] - toTile[1]));
}
// A tile as a straight spear sees it, from its offset to Sol's south-west
// tile: the lane (0 to 4 across his 5 x 5 footprint) and the rows in front of
// the footprint's leading edge (1 is the row next to it, 0 down to -4 are the
// rows under Sol).
function getSpearLaneAndDepth(dx, dy, direction) {
  switch (direction) {
    case "south":
      return [dx, -dy];
    case "north":
      return [dx, dy - 4];
    case "west":
      return [dy, -dx];
    case "east":
      return [dy, dx - 4];
  }
}
// The lanes a straight spear keeps beyond the first row in front of Sol.
var spearLanesByVariant = {
  1: [1, 3],
  2: [0, 2, 4],
};
// The lanes of a diagonal spear. Each is three tiles running diagonally away
// from Sol's corner. A shift of 0 starts at the corner's diagonal neighbour;
// a shift of +n starts n tiles back along y, a shift of -n n tiles back
// along x.
var diagonalSpearShiftsByVariant = {
  1: [-1, 1],
  2: [-3, 0, 3],
};
function isDiagonalDirection(direction) {
  return direction.includes("-");
}
function getDiagonalSpearAttackTiles(bossPosition, direction, variant, arena) {
  const stepX = direction.endsWith("east") ? 1 : -1;
  const stepY = direction.startsWith("north") ? 1 : -1;
  const cornerX = bossPosition[0] + (stepX > 0 ? 4 : 0);
  const cornerY = bossPosition[1] + (stepY > 0 ? 4 : 0);
  const tiles = [];
  for (let dx = 0; dx < 5; dx++) {
    for (let dy = 0; dy < 5; dy++) {
      const footprintTile = [bossPosition[0] + dx, bossPosition[1] + dy];
      if (isSolArenaTile(footprintTile, arena)) {
        tiles.push(footprintTile);
      }
    }
  }
  for (const laneOffset of diagonalSpearShiftsByVariant[variant]) {
    for (let step = 1; step <= 3; step++) {
      const laneTile = [
        cornerX + stepX * (laneOffset >= 0 ? step : step + laneOffset),
        cornerY + stepY * (laneOffset >= 0 ? step - laneOffset : step),
      ];
      if (isSolArenaTile(laneTile, arena)) {
        tiles.push(laneTile);
      }
    }
  }
  return tiles;
}
function getSpearAttackTiles(bossPosition, direction, variant, arena) {
  if (
    isDiagonalDirection(direction)
  ) {
    return getDiagonalSpearAttackTiles(bossPosition, direction, variant, arena);
  }
  const spearLanes = spearLanesByVariant[variant];
  const tiles = [];
  for (let x = arena.minX; x <= arena.maxX; x++) {
    for (let y = arena.minY; y <= arena.maxY; y++) {
      if (!isSolArenaTile([x, y], arena)) {
        continue;
      }
      const [lane, rowsAhead] = getSpearLaneAndDepth(x - bossPosition[0], y - bossPosition[1], direction);
      if (!(lane < 0) && !(lane > 4)) {
        if ((rowsAhead >= -4 && rowsAhead <= 1) || (rowsAhead >= 2 && spearLanes.includes(lane))) {
          tiles.push([x, y]);
        }
      }
    }
  }
  return tiles;
}
function getShieldSafeDistance(variant) {
  if (variant === 1) {
    return 4;
  } else {
    return 5;
  }
}
function getShieldAttackTiles(bossPosition, variant, arena) {
  const centre = getSolCentreTile(bossPosition);
  const safeDistance = getShieldSafeDistance(variant);
  const tiles = [];
  for (let x = arena.minX; x <= arena.maxX; x++) {
    for (let y = arena.minY; y <= arena.maxY; y++) {
      if (!isSolArenaTile([x, y], arena)) {
        continue;
      }
      const distance = getChebyshevTileDistance([x, y], centre);
      // Every tile up to 10 from Sol's centre, except the ring at the safe distance.
      if (distance !== safeDistance && distance <= 10) {
        tiles.push([x, y]);
      }
    }
  }
  return tiles;
}
function getGroundAttackTiles(bossPosition, direction, style, variant, arena) {
  if (style === "spear") {
    return getSpearAttackTiles(bossPosition, direction, variant, arena);
  } else {
    return getShieldAttackTiles(bossPosition, variant, arena);
  }
}
function getGroundAttackDelayCycles(tile, centre) {
  return getChebyshevTileDistance(tile, centre) * 2;
}
var initialSolAttackMemory = {
  lastAction: null,
  lastVariant: 1,
};
function createSolAttackMemory(lastAction, lastVariant) {
  return {
    lastAction: lastAction,
    lastVariant: lastVariant,
  };
}
function getDirectionFromCentre(centre, targetTile) {
  const dx = targetTile[0] - centre[0];
  const dy = targetTile[1] - centre[1];
  const eastOrWest = dx < 0 ? "west" : "east";
  const northOrSouth = dy < 0 ? "south" : "north";
  const shortAxis = Math.min(Math.abs(dx), Math.abs(dy));
  const longAxis = Math.max(Math.abs(dx), Math.abs(dy));
  if (longAxis === 0) {
    return "south";
  } else if (shortAxis * 2 > longAxis) {
    return `${northOrSouth}-${eastOrWest}`;
  } else if (Math.abs(dx) > Math.abs(dy)) {
    return eastOrWest;
  } else {
    return northOrSouth;
  }
}
function getSolAttackDirection(bossPosition, targetTile) {
  const [targetX, targetY] = targetTile;
  const footprintMaxX = bossPosition[0] + 5 - 1;
  const footprintMaxY = bossPosition[1] + 5 - 1;
  if (targetX >= bossPosition[0] && targetX <= footprintMaxX) {
    if (targetY < bossPosition[1]) {
      return "south";
    }
    if (targetY > footprintMaxY) {
      return "north";
    }
  }
  if (targetY >= bossPosition[1] && targetY <= footprintMaxY) {
    if (targetX < bossPosition[0]) {
      return "west";
    }
    if (targetX > footprintMaxX) {
      return "east";
    }
  }
  return getDirectionFromCentre(getSolCentreTile(bossPosition), targetTile);
}
function isFasterAttackPhase(phase) {
  return phase >= 2;
}
function buildGroundAttackArea(pendingGround, geometry) {
  return {
    style: pendingGround.style,
    centre: getSolCentreTile(geometry.position),
    tiles: getGroundAttackTiles(
      geometry.position,
      getSolAttackDirection(geometry.position, geometry.target),
      pendingGround.style,
      pendingGround.variant,
      geometry.arena,
    ),
  };
}
function createSolAttackScheduler(firstAttackTick) {
  return {
    memory: {
      ...initialSolAttackMemory,
    },
    forceSpearNext: true,
    forcedSpecial: null,
    nextAttackTick: firstAttackTick,
    pendingGround: null,
    pendingTriple: [],
    regularsSinceSpecial: null,
  };
}
function isSolAttackDue(scheduler, tick) {
  return (
    scheduler.pendingGround === null &&
    scheduler.pendingTriple.length === 0 &&
    tick >= scheduler.nextAttackTick
  );
}
function getForcedSpecialAttack(scheduler, grappleAvailable) {
  if (scheduler.forcedSpecial !== "grapple" || grappleAvailable) {
    return scheduler.forcedSpecial;
  } else {
    return null;
  }
}
function areSpecialAttacksUnlocked(phase) {
  return phase >= 1;
}
function getSpecialAttackChance(regularsSinceSpecial) {
  if (regularsSinceSpecial === null) {
    return 0.25;
  }
  if (regularsSinceSpecial < 2) {
    return 0;
  }
  const rampedChance = 0.02 + (regularsSinceSpecial - 2) * 0.075;
  return Math.min(0.6, rampedChance);
}
function isGrappleUnlocked(phase) {
  return phase >= 2;
}
function getNextAttackVariant(memory, action) {
  if (memory.lastAction !== action) {
    return 1;
  } else if (memory.lastVariant === 1) {
    return 2;
  } else {
    return 1;
  }
}
function getRegularAttackIntervalTicks(style, phase) {
  return (style === "spear" ? 7 : 6) - (isFasterAttackPhase(phase) ? 1 : 0);
}
function scheduleSolAttack(scheduler, launchConditions) {
  const { tick: tick, phase: phase, random: random } = launchConditions;
  const forceSpearNext = scheduler.forceSpearNext;
  scheduler.forceSpearNext = false;
  const forcedSpecial = forceSpearNext ? null : getForcedSpecialAttack(scheduler, launchConditions.grappleAvailable);
  if (forcedSpecial !== null) {
    return scheduleSolSpecialAttack(scheduler, forcedSpecial, launchConditions);
  }
  const specialChance =
    forceSpearNext ||
    !areSpecialAttacksUnlocked(phase)
      ? 0
      : getSpecialAttackChance(scheduler.regularsSinceSpecial);
  if (specialChance > 0 && random() < specialChance) {
    return scheduleSolSpecialAttack(
      scheduler,
      isGrappleUnlocked(phase) &&
        launchConditions.grappleAvailable &&
        random() < 0.2631578947368421 // 5 in 19
        ? "grapple"
        : "triple",
      launchConditions,
    );
  }
  const rolledSpear = forceSpearNext || random() < 0.5;
  const style = launchConditions.stylePin ?? (rolledSpear ? "spear" : "shield");
  const variant = getNextAttackVariant(scheduler.memory, style);
  scheduler.memory = createSolAttackMemory(style, variant);
  if (scheduler.regularsSinceSpecial !== null) {
    scheduler.regularsSinceSpecial += 1;
  }
  scheduler.nextAttackTick =
    tick +
    getRegularAttackIntervalTicks(style, phase);
  const groundTick = tick + 3;
  scheduler.pendingGround = {
    style: style,
    variant: variant,
    resolveTick: groundTick,
  };
  return {
    kind: "regular",
    style: style,
    variant: variant,
    groundTick: groundTick,
  };
}
function isLongTriplePhase(phase) {
  return phase >= 3;
}
function scheduleSolSpecialAttack(scheduler, special, launchConditions) {
  const { tick: tick, phase: phase } = launchConditions;
  if (scheduler.forcedSpecial === special) {
    scheduler.forcedSpecial = null;
  }
  scheduler.regularsSinceSpecial = 0;
  scheduler.memory = createSolAttackMemory("special", scheduler.memory.lastVariant);
  if (special === "grapple") {
    scheduler.nextAttackTick = tick + 7;
    return {
      kind: "grapple",
    };
  }
  const longTriple = isLongTriplePhase(phase);
  const hitDelays = longTriple ? tripleLongHitTickOffsets : tripleShortHitTickOffsets;
  const hitDamages = longTriple ? tripleLongHitDamages : tripleShortHitDamages;
  scheduler.pendingTriple = hitDelays.map((hitDelay, index) => ({
    tick: tick + hitDelay,
    damage: hitDamages[index],
    index: index,
  }));
  scheduler.nextAttackTick = tick + (!longTriple && isFasterAttackPhase(phase) ? 11 : 12);
  return {
    kind: "triple",
    long: longTriple,
    hitTicks: scheduler.pendingTriple.map((tripleHit) => tripleHit.tick),
  };
}
function clearSolPendingAttacks(boss) {
  const scheduler = boss.state.scheduler;
  scheduler.pendingGround = null;
  scheduler.pendingTriple = [];
  boss.state.grapple.pending = null;
}
function clearSolAttackState(boss) {
  clearSolPendingAttacks(boss);
  boss.state.guaranteedMaxHitUntilTick = null;
}
export { getGroundAttackDelayCycles, buildGroundAttackArea, createSolAttackScheduler, isSolAttackDue, getForcedSpecialAttack, scheduleSolAttack, scheduleSolSpecialAttack, clearSolPendingAttacks, clearSolAttackState };
