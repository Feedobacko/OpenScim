var defaultYamaFireballBeats = [0, 3, 7];
// The first fireball of a burst starts 3 ticks after the burst's beat.
function getFireballBurstStartTicks(attackPattern) {
  const beatStartTick = attackPattern?.beatStartTick ?? 4;
  const beatIntervalTicks = attackPattern?.beatIntervalTicks ?? 7;
  return (attackPattern?.fireballBeats ?? defaultYamaFireballBeats).map((beatIndex) => beatStartTick + beatIndex * beatIntervalTicks + 3);
}
function getFireballImpactLineOffset(angle) {
  switch (angle) {
    case "vertical":
      return {
        dx: 0,
        dy: 3,
      };
    case "horizontal":
      return {
        dx: 3,
        dy: 0,
      };
    case "diagonal":
      return {
        dx: 2,
        dy: -2,
      };
    case "diagonal-alt":
      return {
        dx: -2,
        dy: -2,
      };
  }
}
function getFireballImpactLine(center, angle) {
  const [x, y] = center;
  const { dx: dx, dy: dy } = getFireballImpactLineOffset(angle);
  return {
    center: center,
    side1: [x - dx, y - dy],
    side2: [x + dx, y + dy],
  };
}
// A fireball lives 5 ticks from its start: 3 falling, 1 of impact (the centre
// and two tiles 3 away from it along the angle, or 2 and 2 on a diagonal:
// getFireballImpactLine), 1 of explosion (getFireballExplosionTiles).
var fireballLifetimeTicks = 5;
function getFireballPhase(startTick, tick) {
  const ticksSinceStart = tick - startTick;
  if (ticksSinceStart < 3) {
    return {
      phase: "falling",
      progress: ticksSinceStart / 3,
    };
  } else if (ticksSinceStart < 4) {
    return {
      phase: "impact",
      progress: 0,
    };
  } else if (ticksSinceStart < 5) {
    return {
      phase: "explosion",
      progress: 1,
    };
  } else {
    return {
      phase: "done",
      progress: 1,
    };
  }
}
function getFireballOuterExplosionTiles(center, angle) {
  const [x, y] = center;
  if (angle === "horizontal") {
    return [
      [x - 3, y - 3],
      [x - 3, y - 2],
      [x - 3, y - 1],
      [x - 3, y],
      [x - 3, y + 1],
      [x - 3, y + 2],
      [x - 3, y + 3],
      [x - 2, y - 2],
      [x - 2, y - 1],
      [x - 2, y],
      [x - 2, y + 1],
      [x - 2, y + 2],
      [x + 2, y - 2],
      [x + 2, y - 1],
      [x + 2, y],
      [x + 2, y + 1],
      [x + 2, y + 2],
      [x + 3, y - 3],
      [x + 3, y - 2],
      [x + 3, y - 1],
      [x + 3, y],
      [x + 3, y + 1],
      [x + 3, y + 2],
      [x + 3, y + 3],
    ];
  } else if (angle === "vertical") {
    return [
      [x - 3, y - 3],
      [x - 2, y - 3],
      [x - 1, y - 3],
      [x, y - 3],
      [x + 1, y - 3],
      [x + 2, y - 3],
      [x + 3, y - 3],
      [x - 2, y - 2],
      [x - 1, y - 2],
      [x, y - 2],
      [x + 1, y - 2],
      [x + 2, y - 2],
      [x - 2, y + 2],
      [x - 1, y + 2],
      [x, y + 2],
      [x + 1, y + 2],
      [x + 2, y + 2],
      [x - 3, y + 3],
      [x - 2, y + 3],
      [x - 1, y + 3],
      [x, y + 3],
      [x + 1, y + 3],
      [x + 2, y + 3],
      [x + 3, y + 3],
    ];
  } else if (angle === "diagonal") {
    return [
      [x, y - 5],
      [x + 1, y - 4],
      [x, y - 4],
      [x + 2, y - 3],
      [x + 1, y - 3],
      [x, y - 3],
      [x + 3, y - 2],
      [x + 2, y - 2],
      [x + 1, y - 2],
      [x + 4, y - 1],
      [x + 3, y - 1],
      [x + 2, y - 1],
      [x + 5, y],
      [x + 4, y],
      [x + 3, y],
      [x - 3, y],
      [x - 4, y],
      [x - 5, y],
      [x - 2, y + 1],
      [x - 3, y + 1],
      [x - 4, y + 1],
      [x - 1, y + 2],
      [x - 2, y + 2],
      [x - 3, y + 2],
      [x, y + 3],
      [x - 1, y + 3],
      [x - 2, y + 3],
      [x, y + 4],
      [x - 1, y + 4],
      [x, y + 5],
    ];
  } else {
    return [
      [x, y - 5],
      [x - 1, y - 4],
      [x, y - 4],
      [x - 2, y - 3],
      [x - 1, y - 3],
      [x, y - 3],
      [x - 3, y - 2],
      [x - 2, y - 2],
      [x - 1, y - 2],
      [x - 4, y - 1],
      [x - 3, y - 1],
      [x - 2, y - 1],
      [x - 5, y],
      [x - 4, y],
      [x - 3, y],
      [x + 3, y],
      [x + 4, y],
      [x + 5, y],
      [x + 2, y + 1],
      [x + 3, y + 1],
      [x + 4, y + 1],
      [x + 1, y + 2],
      [x + 2, y + 2],
      [x + 3, y + 2],
      [x, y + 3],
      [x + 1, y + 3],
      [x + 2, y + 3],
      [x, y + 4],
      [x + 1, y + 4],
      [x, y + 5],
    ];
  }
}
function getFireballInnerExplosionTiles(center, angle) {
  const [x, y] = center;
  if (angle === "horizontal") {
    return [
      [x - 1, y - 1],
      [x - 1, y],
      [x - 1, y + 1],
      [x, y],
      [x + 1, y - 1],
      [x + 1, y],
      [x + 1, y + 1],
    ];
  } else if (angle === "vertical") {
    return [
      [x - 1, y - 1],
      [x, y - 1],
      [x + 1, y - 1],
      [x, y],
      [x - 1, y + 1],
      [x, y + 1],
      [x + 1, y + 1],
    ];
  } else if (angle === "diagonal") {
    return [
      [x, y - 2],
      [x + 1, y - 1],
      [x, y - 1],
      [x + 2, y],
      [x + 1, y],
      [x, y],
      [x - 1, y],
      [x - 2, y],
      [x, y + 1],
      [x - 1, y + 1],
      [x, y + 2],
    ];
  } else {
    return [
      [x, y - 2],
      [x - 1, y - 1],
      [x, y - 1],
      [x - 2, y],
      [x - 1, y],
      [x, y],
      [x + 1, y],
      [x + 2, y],
      [x, y + 1],
      [x + 1, y + 1],
      [x, y + 2],
    ];
  }
}
function getFireballImpactTiles(center, angle) {
  const impactLine = getFireballImpactLine(center, angle);
  return [impactLine.center, impactLine.side1, impactLine.side2];
}
// The explosion covers the centre and the impact line and widens towards both
// ends of the line. Of the eight tiles around the centre it leaves out two,
// the ones beside the centre across the line: they are the perfect-dodge
// tiles (getFireballPerfectDodgeTiles in fireballBursts.js).
function getFireballExplosionTiles(center, angle) {
  return [...getFireballOuterExplosionTiles(center, angle), ...getFireballInnerExplosionTiles(center, angle)];
}
export {
  defaultYamaFireballBeats,
  getFireballBurstStartTicks,
  fireballLifetimeTicks,
  getFireballImpactLine,
  getFireballPhase,
  getFireballImpactTiles,
  getFireballExplosionTiles,
};
