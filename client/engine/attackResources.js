import { getBaseItemId } from "../data/itemVariants.js";
import { weaponRequiresAmmo, isAmmoCompatibleWithWeapon } from "./ammunition.js";
import { checkSpellRequirements } from "./spells.js";
var NO_ATTACK_RESOURCES = {
  kind: "none",
  source: "none",
};
function isAmmoUsableWithWeapon(weaponId, ammo) {
  return ammo !== null && isAmmoCompatibleWithWeapon(weaponId, ammo.id);
}
function resolveAttackResources(attackSetup) {
  const activeSpell = "activeSpell" in attackSetup ? attackSetup.activeSpell : attackSetup.supplies.selectedSpell;
  const spellId = attackSetup.manualCastSpell ?? ("magic" === attackSetup.formulaStyle ? activeSpell : null);
  if (spellId) {
    if (
      checkSpellRequirements(spellId, {
        equipment: attackSetup.equipment,
        inventory: attackSetup.inventory,
        runePouch: attackSetup.supplies.runePouch,
        ...(undefined === attackSetup.magicLevel
          ? {}
          : {
              magicLevel: attackSetup.magicLevel,
            }),
      }).ok
    ) {
      return {
        kind: "spell",
        source: "none",
        spellId: spellId,
      };
    } else {
      return {
        kind: "unavailable",
        source: "none",
      };
    }
  }
  switch (undefined === attackSetup.weaponId ? undefined : getBaseItemId(attackSetup.weaponId)) {
    case 29000: // Eclipse atlatl
    case 29851: // Eclipse atlatl
      if (28991 === attackSetup.supplies.equippedAmmo?.id) { // Atlatl dart
        return {
          kind: "ammo",
          source: "equipped",
          ammoId: 28991,
        };
      } else {
        return {
          kind: "unavailable",
          source: "none",
        };
      }
    case 12926: // Toxic blowpipe
      return {
        kind: "ammo",
        source: "blowpipe",
        ammoId: 11230,
      };
    default: {
      const weaponId = attackSetup.weaponId;
      if (undefined !== weaponId && isAmmoUsableWithWeapon(weaponId, attackSetup.supplies.equippedAmmo)) {
        return {
          kind: "ammo",
          source: "equipped",
          ammoId: attackSetup.supplies.equippedAmmo.id,
        };
      } else if (
        weaponId !== undefined &&
        isAmmoUsableWithWeapon(weaponId, attackSetup.supplies.quiverAmmo)
      ) {
        return {
          kind: "ammo",
          source: "quiver",
          ammoId: attackSetup.supplies.quiverAmmo.id,
        };
      } else if (weaponRequiresAmmo(weaponId)) {
        return {
          kind: "unavailable",
          source: "none",
        };
      } else {
        return NO_ATTACK_RESOURCES;
      }
    }
  }
}
export { NO_ATTACK_RESOURCES, resolveAttackResources };
