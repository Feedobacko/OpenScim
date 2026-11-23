import { infernoSpawnTiles } from "./constants.js";
import { infernoWaveMonsterKinds, isInfernoWaveInRange, getInfernoWaveSpawnKinds } from "./waves.js";
var infernoMonsterDisplayNames = {
  mager: {
    one: "mager",
    many: "magers",
    game: "Jal-Zek",
  },
  ranger: {
    one: "ranger",
    many: "rangers",
    game: "Jal-Xil",
  },
  meleer: {
    one: "meleer",
    many: "meleers",
    game: "Jal-ImKot",
  },
  blob: {
    one: "blob",
    many: "blobs",
    game: "Jal-Ak",
  },
  bat: {
    one: "bat",
    many: "bats",
    game: "Jal-MejRah",
  },
  nibbler: {
    one: "nibbler",
    many: "nibblers",
    game: "Jal-Nib",
  },
  jad: {
    one: "Jad",
    many: "Jads",
    game: "JalTok-Jad",
  },
};
var infernoSpawnTileCount = infernoSpawnTiles.length;
function isInfernoSlotNpcKind(kind) {
  return kind !== "nibbler" && kind !== "jad";
}
function getInfernoWaveSlotNpcs(wave) {
  if (isInfernoWaveInRange(wave)) {
    return getInfernoWaveSpawnKinds(wave).filter(isInfernoSlotNpcKind);
  } else {
    return [];
  }
}
function getInfernoMonsterCountsKey(kinds) {
  return infernoWaveMonsterKinds.map((monsterKind) => kinds.filter((kind) => kind === monsterKind).length).join(",");
}
function formatInfernoMonsterCounts(kinds) {
  const countPhrases = infernoWaveMonsterKinds.flatMap((monsterKind) => {
    const count = kinds.filter((kind) => kind === monsterKind).length;
    if (count === 0) {
      return [];
    }
    const displayNames = infernoMonsterDisplayNames[monsterKind];
    return [`${count} ${count === 1 ? displayNames.one : displayNames.many}`];
  });
  if (countPhrases.length <= 1) {
    return countPhrases.join("");
  } else {
    return `${countPhrases.slice(0, -1).join(", ")} and ${countPhrases.at(-1)}`;
  }
}
function validateInfernoSpawnLayout(wave, slots) {
  if (!Number.isInteger(wave) || wave < 1 || wave > 66) {
    return {
      ok: false,
      error: "bad-wave",
      message: "Spawn layouts are for waves 1 to 66.",
    };
  }
  const waveSlotKinds = getInfernoWaveSlotNpcs(wave);
  if (waveSlotKinds.length === 0) {
    return {
      ok: false,
      error: "no-slot-npcs",
      message: `Wave ${wave} spawns only nibblers, so it has no spawns to set.`,
    };
  }
  if (slots.length !== infernoSpawnTileCount) {
    return {
      ok: false,
      error: "bad-slots",
      message: `A spawn layout has ${infernoSpawnTileCount} spawn tiles.`,
    };
  }
  const placedKinds = slots.filter((slotKind) => slotKind !== null);
  if (placedKinds.length === 0) {
    return {
      ok: false,
      error: "empty",
      message: "Place at least one monster.",
    };
  } else if (
    infernoWaveMonsterKinds.every(
      (monsterKind) => placedKinds.filter((placedKind) => placedKind === monsterKind).length <= waveSlotKinds.filter((waveSlotKind) => waveSlotKind === monsterKind).length,
    )
  ) {
    return {
      ok: true,
      layout: {
        wave: wave,
        slots: [...slots],
      },
    };
  } else {
    return {
      ok: false,
      error: "composition-mismatch",
      message: `Those spawns do not fit wave ${wave}, which has ${formatInfernoMonsterCounts(waveSlotKinds)}.`,
    };
  }
}
var infernoSpawnLayoutCodeByKind = {
  bat: "b",
  blob: "l",
  meleer: "m",
  ranger: "r",
  mager: "g",
};
var infernoSpawnLayoutKindByCode = Object.fromEntries(Object.entries(infernoSpawnLayoutCodeByKind).map(([kind, code]) => [code, kind]));
var infernoSpawnLayoutPattern = /^([1-9]\d?):([-blmrg]{9})$/;
function formatInfernoSpawnLayout(spawnLayout) {
  return `${spawnLayout.wave}:${spawnLayout.slots.map((slotKind) => (slotKind === null ? "-" : infernoSpawnLayoutCodeByKind[slotKind])).join("")}`;
}
function parseInfernoSpawnLayout(rawSpawnLayout) {
  if (typeof rawSpawnLayout != "string") {
    return null;
  }
  const match = infernoSpawnLayoutPattern.exec(rawSpawnLayout);
  if (!match) {
    return null;
  }
  const slots = [...match[2]].map((code) => (code === "-" ? null : infernoSpawnLayoutKindByCode[code]));
  const validation = validateInfernoSpawnLayout(Number(match[1]), slots);
  if (validation.ok) {
    return validation.layout;
  } else {
    return null;
  }
}
export {
  infernoMonsterDisplayNames,
  infernoSpawnTileCount,
  isInfernoSlotNpcKind,
  getInfernoWaveSlotNpcs,
  getInfernoMonsterCountsKey,
  formatInfernoMonsterCounts,
  validateInfernoSpawnLayout,
  formatInfernoSpawnLayout,
  parseInfernoSpawnLayout,
};
