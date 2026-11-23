import { createSeededRandom, hashInteger } from "../../engine/random.js";
import { createRandomDecisions } from "../../engine/decisions.js";
import { infernoSpawnTileCount, isInfernoSlotNpcKind, getInfernoWaveSlotNpcs, validateInfernoSpawnLayout } from "./spawnLayout.js";
import { infernoSpawnTiles, nibblerSpawnMinX, nibblerSpawnMaxX, nibblerSpawnMinY, nibblerSpawnMaxY, infernoJadSpawnTile, infernoTripleJadSpawnTiles } from "./constants.js";
var infernoWaveMonsterKinds = ["mager", "ranger", "meleer", "blob", "bat", "nibbler", "jad"];
// One entry per wave, in order: the first is wave 1 (getInfernoWaveComposition).
var infernoWaveCompositions = [
  {
    bat: 1,
    nibbler: 3,
  },
  {
    bat: 2,
    nibbler: 3,
  },
  {
    nibbler: 6,
  },
  {
    blob: 1,
    nibbler: 3,
  },
  {
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    blob: 2,
    nibbler: 3,
  },
  {
    nibbler: 6,
  },
  {
    meleer: 1,
    nibbler: 3,
  },
  {
    meleer: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    meleer: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    meleer: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    meleer: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    meleer: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    meleer: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    meleer: 2,
    nibbler: 3,
  },
  {
    nibbler: 6,
  },
  {
    ranger: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    ranger: 1,
    meleer: 2,
    nibbler: 3,
  },
  {
    ranger: 2,
    nibbler: 3,
  },
  {
    nibbler: 6,
  },
  {
    mager: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    meleer: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    blob: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    blob: 1,
    bat: 1,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    blob: 1,
    bat: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 1,
    blob: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 1,
    meleer: 2,
    nibbler: 3,
  },
  {
    mager: 1,
    ranger: 2,
    nibbler: 3,
  },
  {
    mager: 2,
    nibbler: 3,
  },
  {
    jad: 1,
  },
  {
    jad: 3,
  },
];
function isInfernoWaveInRange(wave) {
  return Number.isInteger(wave) && wave >= 1 && wave <= 68;
}
function getInfernoWaveComposition(wave) {
  if (!isInfernoWaveInRange(wave)) {
    throw new RangeError(`Inferno wave out of range: ${wave}`);
  }
  return infernoWaveCompositions[wave - 1];
}
function getInfernoWaveSpawnKinds(wave) {
  const kindCounts = getInfernoWaveComposition(wave);
  return infernoWaveMonsterKinds.flatMap((kind) =>
    Array.from(
      {
        length: kindCounts[kind] ?? 0,
      },
      () => kind,
    ),
  );
}
function isSpawnLayoutComplete(spawnLayout) {
  return spawnLayout.slots.filter(Boolean).length === getInfernoWaveSlotNpcs(spawnLayout.wave).length;
}
function buildSpawnLayoutFromSpawns(wave, spawns) {
  if (getInfernoWaveSlotNpcs(wave).length === 0) {
    return null;
  }
  const slots = Array.from(
    {
      length: infernoSpawnTileCount,
    },
    () => null,
  );
  for (const { kind: kind, position: position } of spawns) {
    if (!isInfernoSlotNpcKind(kind)) {
      continue;
    }
    const slotIndex = infernoSpawnTiles.findIndex(([x, y]) => x === position[0] && y === position[1]);
    if (slotIndex < 0 || slots[slotIndex] !== null) {
      return null;
    }
    slots[slotIndex] = kind;
  }
  const validation = validateInfernoSpawnLayout(wave, slots);
  if (validation.ok && isSpawnLayoutComplete(validation.layout)) {
    return validation.layout;
  } else {
    return null;
  }
}
var infernoJadWaveConfigs = {
  67: {
    openingDelayTicks: [4],
    rangedMagicPeriod: 8,
    healersPerJad: 5,
  },
  68: {
    openingDelayTicks: [4, 7, 10],
    rangedMagicPeriod: 9,
    healersPerJad: 3,
  },
};
function mixInfernoWaveSeed(seed, wave, salt) {
  return hashInteger((seed ^ Math.imul(wave, 2654435761) ^ salt) >>> 0);
}
function createWaveNpcRandom(seed, wave) {
  return createSeededRandom(mixInfernoWaveSeed(seed, wave, 1313882963));
}
function shuffleWithDecisions(items, decisions, site, tick) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = decisions.int(
      {
        site: site,
        tick: tick,
        ordinal: index,
      },
      0,
      index,
    );
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}
function createWaveLayoutRandom(runSeed, wave) {
  return createSeededRandom(mixInfernoWaveSeed(runSeed, wave, 1279351119));
}
function getLayoutSpawnTiles(waveKinds, spawnLayout, slotOrder) {
  const usedSlots = new Set();
  const freeSlots = slotOrder.filter((slotIndex) => spawnLayout.slots[slotIndex] === null);
  let freeSlotsTaken = 0;
  const spawnTiles = waveKinds
    .filter((kind) => kind !== "nibbler")
    .map((kind) => {
      const layoutSlotIndex = spawnLayout.slots.findIndex((slotKind, index) => slotKind === kind && !usedSlots.has(index));
      const slotIndex = layoutSlotIndex >= 0 ? layoutSlotIndex : freeSlots[freeSlotsTaken++];
      if (slotIndex === undefined) {
        throw new RangeError(
          `Wave ${spawnLayout.wave} has more slot NPCs than free spawn slots`,
        );
      }
      usedSlots.add(slotIndex);
      return infernoSpawnTiles[slotIndex];
    });
  if (spawnLayout.slots.some((slotKind, index) => slotKind !== null && !usedSlots.has(index))) {
    throw new RangeError(
      `Spawn layout places more NPCs than wave ${spawnLayout.wave} spawns`,
    );
  }
  return spawnTiles;
}
function buildInfernoWaveSpawns(runSeed, wave, openStream = createRandomDecisions, tick = -1, spawnLayout = null) {
  const decisions = openStream(
    createWaveLayoutRandom(runSeed, wave),
  );
  const waveKinds = getInfernoWaveSpawnKinds(wave);
  if (wave === 67 || wave === 68) {
    const jadWaveConfig = infernoJadWaveConfigs[wave];
    return (wave === 67 ? [infernoJadSpawnTile] : shuffleWithDecisions(infernoTripleJadSpawnTiles, decisions, "inferno.layout.jad", tick)).map(
      (spawnTile, jadIndex) => ({
        kind: "jad",
        position: [...spawnTile],
        jad: {
          openingDelayTicks: jadWaveConfig.openingDelayTicks[jadIndex],
          rangedMagicPeriod: jadWaveConfig.rangedMagicPeriod,
        },
      }),
    );
  }
  const slotOrder = shuffleWithDecisions(
    infernoSpawnTiles.map((spawnTile, index) => index),
    decisions,
    "inferno.layout.slot",
    tick,
  );
  const spawnTiles =
    spawnLayout?.wave === wave
      ? getLayoutSpawnTiles(waveKinds, spawnLayout, slotOrder)
      : slotOrder.map((slotIndex) => infernoSpawnTiles[slotIndex]);
  let slotNpcsPlaced = 0;
  let nibblersPlaced = 0;
  return waveKinds.map((kind) => {
    if (kind === "nibbler") {
      const nibblerOrdinal = nibblersPlaced++;
      return {
        kind: kind,
        position: [
          decisions.int(
            {
              site: "inferno.layout.nibbler_x",
              tick: tick,
              ordinal: nibblerOrdinal,
            },
            nibblerSpawnMinX,
            nibblerSpawnMaxX,
          ),
          decisions.int(
            {
              site: "inferno.layout.nibbler_y",
              tick: tick,
              ordinal: nibblerOrdinal,
            },
            nibblerSpawnMinY,
            nibblerSpawnMaxY,
          ),
        ],
      };
    }
    const spawnTile = spawnTiles[slotNpcsPlaced++];
    if (!spawnTile) {
      throw new RangeError(
        `Wave ${wave} has more slot NPCs than the nine spawn slots`,
      );
    }
    return {
      kind: kind,
      position: [...spawnTile],
    };
  });
}
export { infernoWaveMonsterKinds, isInfernoWaveInRange, getInfernoWaveComposition, getInfernoWaveSpawnKinds, buildSpawnLayoutFromSpawns, infernoJadWaveConfigs, mixInfernoWaveSeed, createWaveNpcRandom, buildInfernoWaveSpawns };
