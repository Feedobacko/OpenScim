import { zUnknown, zNumber, zObject, zString, zArray, zEnum } from "../assets/vendor.js";
import { getSpellDefinition } from "../data/combatSpells.js";
import { defaultSpellbook, isSpellbook } from "./playerState.js";
var itemRefSchema = zObject({
  id: zNumber().int().positive(),
});
var runePouchSchema = zObject({
  kind: zEnum(["standard", "divine"]),
  slots: zArray(zUnknown()),
});
var blowpipeAmmoWrapperSchema = zObject({
  ammo: itemRefSchema,
});
var combatSuppliesSchema = zObject({
  equippedAmmo: zUnknown().optional(),
  quiverAmmo: zUnknown().optional(),
  runePouch: zUnknown().optional(),
  blowpipe: zUnknown().optional(),
  selectedSpell: zUnknown().optional(),
  spellbook: zUnknown().optional(),
});
function createEmptyCombatSupplies() {
  return {
    equippedAmmo: null,
    quiverAmmo: null,
    runePouch: null,
    blowpipe: null,
    selectedSpell: null,
    spellbook: defaultSpellbook,
  };
}
function parseItemRef(input) {
  const parseResult = itemRefSchema.safeParse(input);
  if (parseResult.success) {
    return parseResult.data;
  } else {
    return null;
  }
}
function throwUnexpectedRunePouchKind(runePouchKind) {
  throw new TypeError("Unexpected rune pouch kind: " + String(runePouchKind));
}
function parseRunePouch(input) {
  const parseResult = runePouchSchema.safeParse(input);
  if (!parseResult.success) {
    return null;
  }
  const firstSlot = parseItemRef(parseResult.data.slots[0]);
  const secondSlot = parseItemRef(parseResult.data.slots[1]);
  const thirdSlot = parseItemRef(parseResult.data.slots[2]);
  switch (parseResult.data.kind) {
    case "standard":
      return {
        kind: "standard",
        slots: [firstSlot, secondSlot, thirdSlot],
      };
    case "divine":
      return {
        kind: "divine",
        slots: [firstSlot, secondSlot, thirdSlot, parseItemRef(parseResult.data.slots[3])],
      };
    default:
      return throwUnexpectedRunePouchKind(parseResult.data.kind);
  }
}
function parseBlowpipeAmmo(blowpipeInput) {
  const ammoWrapperParseResult = blowpipeAmmoWrapperSchema.safeParse(blowpipeInput);
  if (ammoWrapperParseResult.success) {
    return ammoWrapperParseResult.data.ammo;
  } else {
    return parseItemRef(blowpipeInput);
  }
}
function parseCombatSupplies(input) {
  const parseResult = combatSuppliesSchema.safeParse(input);
  if (!parseResult.success) {
    return createEmptyCombatSupplies();
  }
  const blowpipeAmmo = parseBlowpipeAmmo(parseResult.data.blowpipe);
  const selectedSpellParseResult = zString().min(1).safeParse(parseResult.data.selectedSpell);
  const spellbook = isSpellbook(parseResult.data.spellbook) ? parseResult.data.spellbook : defaultSpellbook;
  const selectedSpell =
    selectedSpellParseResult.success && getSpellDefinition(selectedSpellParseResult.data)?.spellbook === spellbook
      ? selectedSpellParseResult.data
      : null;
  return {
    equippedAmmo: parseItemRef(parseResult.data.equippedAmmo),
    quiverAmmo: parseItemRef(parseResult.data.quiverAmmo),
    runePouch: parseRunePouch(parseResult.data.runePouch),
    blowpipe: blowpipeAmmo,
    selectedSpell: selectedSpell,
    spellbook: spellbook,
  };
}
function cloneItemRef(itemRef) {
  if (itemRef) {
    return {
      ...itemRef,
    };
  } else {
    return null;
  }
}
function cloneRunePouch(runePouch) {
  if (!runePouch) {
    return null;
  }
  switch (runePouch.kind) {
    case "standard":
      return {
        kind: "standard",
        slots: [cloneItemRef(runePouch.slots[0]), cloneItemRef(runePouch.slots[1]), cloneItemRef(runePouch.slots[2])],
      };
    case "divine":
      return {
        kind: "divine",
        slots: [
          cloneItemRef(runePouch.slots[0]),
          cloneItemRef(runePouch.slots[1]),
          cloneItemRef(runePouch.slots[2]),
          cloneItemRef(runePouch.slots[3]),
        ],
      };
    default:
      return throwUnexpectedRunePouchKind(runePouch);
  }
}
function cloneCombatSupplies(combatSupplies) {
  return {
    equippedAmmo: cloneItemRef(combatSupplies.equippedAmmo),
    quiverAmmo: cloneItemRef(combatSupplies.quiverAmmo),
    runePouch: cloneRunePouch(combatSupplies.runePouch),
    blowpipe: cloneItemRef(combatSupplies.blowpipe),
    selectedSpell: combatSupplies.selectedSpell,
    spellbook: combatSupplies.spellbook,
  };
}
function isSameItemRef(itemRef, otherItemRef) {
  return itemRef?.id === otherItemRef?.id;
}
function withRunePouchSlot(runePouch, slotIndex, runeItemRef) {
  const slotItemAt = (index) => (index === slotIndex ? runeItemRef : (runePouch.slots[index] ?? null));
  switch (runePouch.kind) {
    case "standard":
      return {
        kind: "standard",
        slots: [slotItemAt(0), slotItemAt(1), slotItemAt(2)],
      };
    case "divine":
      return {
        kind: "divine",
        slots: [slotItemAt(0), slotItemAt(1), slotItemAt(2), slotItemAt(3)],
      };
    default:
      return throwUnexpectedRunePouchKind(runePouch);
  }
}
function areRunePouchesEqual(runePouch, otherRunePouch) {
  if (runePouch?.kind !== otherRunePouch?.kind) {
    return false;
  }
  const slots = runePouch?.slots ?? [];
  const otherSlots = otherRunePouch?.slots ?? [];
  for (let slotIndex = 0; slotIndex < slots.length; slotIndex++) {
    if (!isSameItemRef(slots[slotIndex] ?? null, otherSlots[slotIndex] ?? null)) {
      return false;
    }
  }
  return true;
}
function areCombatSuppliesEqual(combatSupplies, otherCombatSupplies) {
  return (
    isSameItemRef(combatSupplies.equippedAmmo, otherCombatSupplies.equippedAmmo) &&
    isSameItemRef(combatSupplies.quiverAmmo, otherCombatSupplies.quiverAmmo) &&
    areRunePouchesEqual(combatSupplies.runePouch, otherCombatSupplies.runePouch) &&
    isSameItemRef(combatSupplies.blowpipe, otherCombatSupplies.blowpipe) &&
    combatSupplies.selectedSpell === otherCombatSupplies.selectedSpell &&
    combatSupplies.spellbook === otherCombatSupplies.spellbook
  );
}
function createEmptyInventory() {
  return new Array(28).fill(null);
}
function isItemStackable(itemId, quantity, objTypeLoader) {
  const stackableByQuantity = (quantity ?? 1) > 1;
  if (!objTypeLoader) {
    return stackableByQuantity;
  }
  try {
    return objTypeLoader.load(itemId).stackable;
  } catch {
    return stackableByQuantity;
  }
}
function normalizeInventory(inventory) {
  const normalizedInventory = createEmptyInventory();
  for (let slotIndex = 0; slotIndex < Math.min(inventory.length, 28); slotIndex++) {
    const itemRef = inventory[slotIndex];
    if (itemRef) {
      normalizedInventory[slotIndex] = {
        id: itemRef.id,
      };
    }
  }
  return normalizedInventory;
}
function clearInventorySlot(inventory, inventoryIndex) {
  if (!inventory[inventoryIndex]) {
    return inventory;
  }
  const nextInventory = inventory.map((itemRef) =>
    itemRef
      ? {
          ...itemRef,
        }
      : null,
  );
  nextInventory[inventoryIndex] = null;
  return nextInventory;
}
export {
  createEmptyCombatSupplies,
  parseCombatSupplies,
  cloneCombatSupplies,
  withRunePouchSlot,
  areCombatSuppliesEqual,
  createEmptyInventory,
  isItemStackable,
  normalizeInventory,
  clearInventorySlot,
};
