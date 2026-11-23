import { infernoArenaBounds } from "./constants.js";
import { infernoPillars, getInfernoPillarTiles } from "./pillars.js";
function canChooseInfernoStartTile(wave) {
  return wave > 1 && wave <= 68;
}
function parseTileString(rawTile) {
  if (typeof rawTile != "string") {
    return null;
  }
  const match = /^(\d{1,3}),(\d{1,3})$/.exec(rawTile);
  if (match) {
    return [Number(match[1]), Number(match[2])];
  } else {
    return null;
  }
}
function formatTileString(tile) {
  return `${tile[0]},${tile[1]}`;
}
function findStandingPillarAt([x, y], setup) {
  if (setup.startWave > 66) {
    return null;
  } else {
    return (
      infernoPillars.find(
        (pillar) =>
          !setup.destroyedPillars[pillar.key] &&
          getInfernoPillarTiles(pillar).some(([pillarX, pillarY]) => pillarX === x && pillarY === y),
      )?.key ?? null
    );
  }
}
function validateInfernoStartTile(startTile, setup, isOpenFloor) {
  const [x, y] = startTile;
  const { minX: minX, maxX: maxX, minY: minY, maxY: maxY } = infernoArenaBounds;
  const tileLabel = `[${x},${y}]`;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < minX ||
    x > maxX ||
    y < minY ||
    y > maxY
  ) {
    return {
      ok: false,
      reason: "out-of-bounds",
      message: `The start tile ${tileLabel} is outside the arena.`,
    };
  }
  if (
    findStandingPillarAt(startTile, setup) !== null
  ) {
    return {
      ok: false,
      reason: "pillar",
      message: `The start tile ${tileLabel} is under a standing pillar.`,
    };
  }
  const isPillarTile = infernoPillars.some((pillar) => getInfernoPillarTiles(pillar).some(([pillarX, pillarY]) => pillarX === x && pillarY === y));
  if (!isOpenFloor || isPillarTile || isOpenFloor(x, y)) {
    return {
      ok: true,
    };
  } else {
    return {
      ok: false,
      reason: "blocked",
      message: `The start tile ${tileLabel} is not open floor.`,
    };
  }
}
function clampInfernoWave(wave) {
  if (Number.isFinite(wave)) {
    return Math.min(Math.max(Math.round(wave), 1), 69);
  } else {
    return 1;
  }
}
function canPinInfernoWave(wave) {
  return wave >= 1 && wave <= 68 && wave !== 67;
}
export {
  canChooseInfernoStartTile,
  parseTileString,
  formatTileString,
  validateInfernoStartTile,
  clampInfernoWave,
  canPinInfernoWave,
};
