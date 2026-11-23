import { getConsumableDefinition, applyItemConsumption, isCooldownTrackReady, withCooldownTrackDelay } from "./consumables.js";
import { applyPrayerActionEntries, hasEnhancedPrayerRestoration, computePrayerRestoreAmount } from "./prayers.js";
function isPrayerInputOp(inputOp) {
  return (
    "protection" === inputOp.type ||
    "offensive" === inputOp.type ||
    inputOp.type === "independent" ||
    "quickPrayers" === inputOp.type
  );
}
function projectPendingPrayerOps(projectionInput) {
  let hasPrayerPoints = projectionInput.hasPrayerPoints;
  let inventory = projectionInput.inventory;
  let cooldownTracks = projectionInput.cooldownTracks;
  let usedUntrackedItem = false;
  const prayerActionEntries = [];
  for (const inputOp of projectionInput.ops) {
    if (isPrayerInputOp(inputOp)) {
      prayerActionEntries.push({
        action: inputOp,
        hasPrayerPoints: hasPrayerPoints,
      });
      continue;
    }
    if ("use_item" !== inputOp.type) {
      continue;
    }
    const itemRef = inventory[inputOp.inventoryIndex];
    if (!itemRef) {
      continue;
    }
    const consumable = getConsumableDefinition(itemRef.id, inputOp.option);
    if (!consumable) {
      continue;
    }
    const { track: track, delayTicks: delayTicks } = consumable;
    const hasCooldown = track !== undefined && delayTicks > 0;
    if (!hasCooldown || !!isCooldownTrackReady(cooldownTracks, track, projectionInput.inputTick)) {
      if (
        (!(undefined === track) || !usedUntrackedItem) &&
        (consumable.minHpToUse === undefined || !(projectionInput.playerHp < consumable.minHpToUse))
      ) {
        if (!hasPrayerPoints && canEffectsRestorePrayer(consumable.effects, projectionInput)) {
          hasPrayerPoints = true;
        }
        inventory = applyItemConsumption(inventory, inputOp.inventoryIndex, consumable.consume);
        if (hasCooldown) {
          cooldownTracks = withCooldownTrackDelay(cooldownTracks, track, projectionInput.inputTick, delayTicks);
        }
        usedUntrackedItem ||= undefined === track;
      }
    }
  }
  return applyPrayerActionEntries(projectionInput.start, prayerActionEntries);
}
function canEffectsRestorePrayer(effects, projectionInput) {
  if (!projectionInput.restoreRules.allowed) {
    return false;
  }
  const enhancedPrayerRestoration = hasEnhancedPrayerRestoration({
    equipment: projectionInput.equipment,
    inventory: projectionInput.inventory,
  });
  const restoreMultiplier = projectionInput.restoreRules.multiplier ?? 1;
  for (const effect of effects) {
    const restoreAmount =
      "restore_prayer_formula" === effect.op
        ? computePrayerRestoreAmount(effect.formula, projectionInput.prayerLevel, enhancedPrayerRestoration)
        : 0;
    if (restoreAmount > 0 && Math.floor(restoreAmount * restoreMultiplier) > 0) {
      return true;
    }
  }
  return false;
}
function buildPrayerProjectionInput(player, tick, restoreRules) {
  return {
    start: {
      protection: player.activePrayer,
      offensive: player.offensivePrayer,
      independent: player.independentPrayers,
      quickPrayersActive: player.quickPrayersActive,
    },
    hasPrayerPoints: player.prayerState.points > 0,
    ops: player.pendingInputOps,
    inventory: player.inventory,
    equipment: player.equipment,
    cooldownTracks: player.cooldownTracks,
    prayerLevel: player.stats.prayer.max,
    playerHp: player.vitals.hp,
    inputTick: tick + 1,
    restoreRules: restoreRules,
  };
}
export { projectPendingPrayerOps, buildPrayerProjectionInput };
