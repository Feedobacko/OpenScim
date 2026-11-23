import { zUnknown, zNumber, zObject, zTuple, zString, zArray, zRecord, zBoolean } from "../assets/vendor.js";
import { ReplaySafetyError } from "./replayLimits.js";
var engineBootstrapSchema = zObject({
  version: zNumber().int(),
  startPosition: zTuple([zNumber().finite(), zNumber().finite()]),
  baseStats: zObject({
    agility: zObject({
      current: zNumber(),
      max: zNumber(),
    }).default({
      current: 99,
      max: 99,
    }),
  }).passthrough(),
  startHp: zNumber().finite().optional(),
  enableIntro: zBoolean(),
  encounterConfig: zRecord(zString(), zUnknown()).optional(),
  mechanicsConfig: zRecord(zString(), zUnknown()),
  inventory: zArray(zUnknown()),
  equipment: zObject({}).passthrough(),
  combatSupplies: zObject({}).passthrough(),
  attackStylePerCategory: zRecord(zString(), zNumber()),
  prepotApplied: zBoolean(),
  combatSeed: zNumber().int().nonnegative(),
});
function assertBootstrapWithinWorkLimits(input) {
  if ("object" == typeof input && input !== null && !Array.isArray(input)) {
    if (
      "inventory" in input &&
      Array.isArray(input.inventory) &&
      input.inventory.length > 28
    ) {
      throw new ReplaySafetyError("takeover-work-limit", {
        actual: input.inventory.length,
        limit: 28,
      });
    }
    if (
      "attackStylePerCategory" in input &&
      "object" == typeof input.attackStylePerCategory &&
      null !== input.attackStylePerCategory
    ) {
      const attackStyleCount = Object.keys(input.attackStylePerCategory).length;
      if (attackStyleCount > 256) {
        throw new ReplaySafetyError("takeover-work-limit", {
          actual: attackStyleCount,
          limit: 256,
        });
      }
    }
  }
}
function parseBootstrapInput(input) {
  try {
    assertBootstrapWithinWorkLimits(input);
  } catch (error) {
    if (error instanceof ReplaySafetyError) {
      return null;
    }
    throw error;
  }
  const parseResult = engineBootstrapSchema.safeParse(input);
  if (parseResult.success) {
    if (14 !== parseResult.data.version) {
      return null;
    } else {
      return parseResult.data;
    }
  } else {
    return null;
  }
}
function parseEngineBootstrap(recording) {
  if (recording) {
    return parseBootstrapInput(recording.bootstrap);
  } else {
    return null;
  }
}
export { assertBootstrapWithinWorkLimits, parseEngineBootstrap };
