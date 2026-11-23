import { Prayer } from "./prayerTables.js";
function resolveRolledDamage(damageOrRange, random = Math.random) {
  if (typeof damageOrRange == "number") {
    return damageOrRange;
  }
  const [minimum, maximum] = damageOrRange;
  if (minimum >= maximum) {
    return minimum;
  } else {
    return minimum + Math.floor(random() * (maximum - minimum + 1));
  }
}
// attackType here is the style of a hit as the protection prayers see it:
// "magic", "range", "melee" or "typeless" (the `style` of an attack, the
// `attackType` of a damage record). The `attackType` of a weapon style in
// data/weaponCategories.js is another thing: Stab, Slash, Crush, Ranged,
// Magic or None. activePrayer is the player's protection prayer, or null.
function isCorrectProtectionPrayer(attackType, activePrayer) {
  return (
    !!activePrayer &&
    ((attackType === "magic" && activePrayer === Prayer.ProtectMagic) ||
      (attackType === "range" && activePrayer === Prayer.ProtectRange) ||
      (attackType === "melee" && activePrayer === Prayer.ProtectMelee))
  );
}
function applyPrayerReduction(damage, attackType, activePrayer, prayerReduction) {
  if (damage === 0) {
    return 0;
  }
  if (!attackType || !activePrayer || attackType === "typeless") {
    return damage;
  }
  if (!isCorrectProtectionPrayer(attackType, activePrayer)) {
    return damage;
  }
  const reduction = prayerReduction ?? {
    type: "block",
  };
  switch (reduction.type) {
    case "block":
      return 0;
    case "cap":
      return Math.min(reduction.value ?? 0, damage);
    case "reduce":
      return Math.floor((damage * Math.round((reduction.value ?? 0) * 100)) / 100);
    case "bypass":
      return damage;
    default:
      reduction.type;
      return 0;
  }
}
export { resolveRolledDamage, isCorrectProtectionPrayer, applyPrayerReduction };
