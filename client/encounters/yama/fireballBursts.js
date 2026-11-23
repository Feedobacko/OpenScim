import { hashInteger } from "../../engine/random.js";
import { getFireballBurstStartTicks, fireballLifetimeTicks } from "./fireballGeometry.js";
var fireballBurstTickOffsets = [0, 3, 6];
function isDuoSide(duoSide) {
  return duoSide === "player1" || duoSide === "player2";
}
var fireballAnglesByDuoSide = {
  player1: {
    vertical: ["vertical", "diagonal", "horizontal"],
    horizontal: ["horizontal", "diagonal", "vertical"],
  },
  player2: {
    vertical: ["vertical", "diagonal-alt", "horizontal"],
    horizontal: ["horizontal", "diagonal-alt", "vertical"],
  },
};
function isFireballBurstVertical(burstIndex, seed, start = "random") {
  if (start !== "random") {
    return start === "vertical";
  } else {
    return !(hashInteger(burstIndex ^ seed) & 1);
  }
}
function getFireballAngle(burstIndex, indexInBurst, seed, start = "random", side = "player1") {
  const startsVertical = isFireballBurstVertical(burstIndex, seed, start);
  return fireballAnglesByDuoSide[side][startsVertical ? "vertical" : "horizontal"][indexInBurst];
}
// The id of a scheduled fireball: nine to a cycle, three bursts of three. A
// fireball spawned by a command has a negative id (spawnManualBurst).
function getFireballInstanceId(cycleIndex, beatSlot, indexInBurst) {
  return cycleIndex * 9 + beatSlot * 3 + indexInBurst;
}
function toBurstShapeLookup(startOrShapeLookup) {
  if (typeof startOrShapeLookup == "function") {
    return startOrShapeLookup;
  } else {
    return () => ({
      start: startOrShapeLookup,
      side: "player1",
    });
  }
}
function getCycleTicks(attackPattern) {
  const beatIntervalTicks = attackPattern?.beatIntervalTicks ?? 7;
  return (attackPattern?.beatsPerCycle ?? 10) * beatIntervalTicks;
}
function getScheduledFireballs(tick, seed, attackPattern, startOrShapeLookup = "random") {
  const shapeForBurst = toBurstShapeLookup(startOrShapeLookup);
  const beatStartTick = attackPattern?.beatStartTick ?? 4;
  const cycleTicks = getCycleTicks(attackPattern);
  const burstStartTicks = getFireballBurstStartTicks(attackPattern);
  if (tick < beatStartTick) {
    return [];
  }
  const activeFireballs = [];
  const ticksSinceFirstBeat = tick - beatStartTick;
  const currentCycleIndex = Math.floor(ticksSinceFirstBeat / cycleTicks);
  for (let cycleIndex = Math.max(0, currentCycleIndex - 1); cycleIndex <= currentCycleIndex; cycleIndex++) {
    for (let beatSlot = 0; beatSlot < burstStartTicks.length; beatSlot++) {
      const burstStartTick = cycleIndex * cycleTicks + burstStartTicks[beatSlot];
      const burstIndex = cycleIndex * burstStartTicks.length + beatSlot;
      const { start: start, side: side } = shapeForBurst(burstIndex);
      for (let indexInBurst = 0; indexInBurst < fireballBurstTickOffsets.length; indexInBurst++) {
        const startTick = burstStartTick + fireballBurstTickOffsets[indexInBurst];
        const endTick = startTick + fireballLifetimeTicks - 1;
        if (tick >= startTick && tick <= endTick) {
          activeFireballs.push({
            startTick: startTick,
            endTick: endTick,
            angle: getFireballAngle(burstIndex, indexInBurst, seed, start, side),
            instanceId: getFireballInstanceId(cycleIndex, beatSlot, indexInBurst),
          });
        }
      }
    }
  }
  return activeFireballs;
}
function getFireballPerfectDodgeTiles(center, angle) {
  const [x, y] = center;
  switch (angle) {
    case "horizontal":
      return [
        [x, y + 1],
        [x, y - 1],
      ];
    case "vertical":
      return [
        [x + 1, y],
        [x - 1, y],
      ];
    case "diagonal":
      return [
        [x + 1, y + 1],
        [x - 1, y - 1],
      ];
    case "diagonal-alt":
      return [
        [x + 1, y - 1],
        [x - 1, y + 1],
      ];
  }
}
function isFireballPerfectDodgeTile(playerPosition, center, angle) {
  return getFireballPerfectDodgeTiles(center, angle).some(([x, y]) => x === playerPosition[0] && y === playerPosition[1]);
}
export { fireballBurstTickOffsets, isDuoSide, isFireballBurstVertical, getFireballAngle, getFireballInstanceId, getScheduledFireballs, isFireballPerfectDodgeTile };
