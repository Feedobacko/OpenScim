import { zObject, zUnion, zString, zRecord, zLiteral } from "../../assets/vendor.js";
import { getActiveSpell, getWeaponCategory } from "../../data/weaponCategories.js";
import { getWeaponFormulaStyle } from "../../engine/weapons.js";
import { solMessageColors } from "./constants.js";
var solHereditModifierDefinitions = [
  {
    id: "solarflare",
    name: "Solarflare",
    icon: "/assets/encounters/modifier-solarflare.png",
    summary: "An orb circles the pillars, dealing 10–20 damage.",
    tiers: [
      "The orb moves every 2 ticks, with 7-tick corner gaps. Departure hits land one tick later.",
      "The orb moves every 2 ticks without stopping. Departure hits land one tick later.",
      "The orb moves every tick, with 2-tick corner gaps, and disables protection prayers on departure. Hits land one tick later.",
    ],
  },
  {
    id: "volatility",
    name: "Volatility",
    icon: "/assets/encounters/modifier-volatility.png",
    summary: "Enemies explode when they die, dealing 16–24 damage.",
    tiers: [
      "The explosion reaches one tile beyond the enemy footprint.",
      "The explosion reaches two tiles beyond the enemy footprint.",
      "The explosion reaches two tiles beyond the enemy footprint. The center sand pool isn't simulated yet.",
    ],
  },
  {
    id: "doom",
    name: "Doom",
    icon: "/assets/encounters/modifier-doom.png",
    summary:
      "Every damaging enemy hit adds a Doom stack; enough stacks kill you.",
    tiers: [
      "Every damaging enemy hit adds a stack of Doom; 15 stacks kill you.",
      "Doom kills at 10 stacks.",
      "Doom kills at 5 stacks.",
    ],
  },
  {
    id: "frailty",
    name: "Frailty",
    icon: "/assets/encounters/modifier-frailty.png",
    summary: "Base Hitpoints are reduced and overhealing is disabled.",
    tiers: [
      "Base Hitpoints are reduced by 10%; overhealing is disabled.",
      "Base Hitpoints are reduced by 20%.",
      "Base Hitpoints are reduced by 40%.",
    ],
  },
  {
    id: "blasphemy",
    name: "Blasphemy",
    icon: "/assets/encounters/modifier-blasphemy.png",
    summary:
      "Each full 5 damage taken drains prayer points, except Solarflare, Volatility and Bees! hits.",
    tiers: [
      "Drain 1 prayer point per full 5 damage taken, excluding Solarflare, Volatility and Bees!.",
      "Drain 2 prayer points per full 5 damage taken, excluding Solarflare, Volatility and Bees!.",
      "Drain 3 prayer points per full 5 damage taken, excluding Solarflare, Volatility and Bees!.",
    ],
  },
  {
    id: "myopia",
    name: "Myopia",
    icon: "/assets/encounters/modifier-myopia.png",
    summary: "Attack range is reduced; manually cast spells are unaffected.",
    tiers: [
      "Attack range is reduced by 2 tiles; manually cast spells are unaffected.",
      "Attack range is reduced by 4 tiles; manually cast spells are unaffected.",
      "Attack range is reduced by 6 tiles; manually cast spells are unaffected.",
    ],
  },
  {
    id: "bees",
    name: "Bees!",
    icon: "/assets/encounters/modifier-bees.png",
    summary:
      "Bee swarms pursue you and sting when they catch you. Defeated swarms return after a delay.",
    tiers: ["1 bee swarm", "2 bee swarms", "3 bee swarms"],
  },
  {
    id: "quartet",
    name: "Quartet",
    icon: "/assets/encounters/modifier-quartet.png",
    summary: "A random Fremennik warbander joins the fight.",
    tiers: [
      "One berserker, archer or seer, chosen at random, sticks beside you and attacks every 6 ticks.",
    ],
  },
  {
    id: "totemic",
    name: "Totemic",
    icon: "/assets/encounters/modifier-totemic.png",
    summary:
      "A 1 HP healing totem appears beside a wounded enemy and heals it.",
    tiers: [
      "At half HP a totem appears beside the enemy and heals it every 6 ticks while it is hurt. A destroyed totem returns 2 minutes later.",
    ],
  },
  {
    id: "relentless",
    name: "Relentless",
    icon: "/assets/encounters/modifier-relentless.png",
    summary: "Enemies bypass part of your Defence level and hit harder.",
    tiers: [
      "Enemies bypass 33% of your Defence level, and their max hit is increased by 1.",
      "Enemies bypass 66% of your Defence level, and their max hit is increased by 3.",
      "Enemies ignore accuracy checks entirely, and their max hit is increased by 6.",
    ],
  },
];
var solHereditModifiers = [
  "bees",
  "blasphemy",
  "doom",
  "frailty",
  "myopia",
  "quartet",
  "relentless",
  "solarflare",
  "totemic",
  "volatility",
].map((modifierId) => solHereditModifierDefinitions.find((modifier) => modifier.id === modifierId));
var noxiousHalberdItemIds = [29796];
var solHereditSetupNotes = [
  {
    id: "halberd-without-myopia",
    message: "Noxious halberd in loadout, but Myopia is off.",
    applies: (setup) => {
      const loadout = setup;
      const itemIds = noxiousHalberdItemIds;
      return (
        (Object.values(loadout.equipment).some(
          (itemId) => itemId !== undefined && itemIds.includes(itemId),
        ) ||
          (loadout.inventory?.some((item) => item !== null && itemIds.includes(item.id)) ??
            false)) &&
        !setup.modifiers.myopia
      );
    },
  },
];
function buildDoomMessage(doomStacks, doomLimit) {
  return [
    {
      text: "You now have ",
    },
    {
      text: `${doomStacks}/${doomLimit} points`,
      color: solMessageColors.red,
    },
    {
      text: " of ",
    },
    {
      text: "doom!",
      color: solMessageColors.red,
    },
  ];
}
var SolModifierState = class {
  selection;
  doomStacks = 0;
  mechanics = {};
  constructor(selection = {}) {
    this.selection = Object.freeze({
      ...selection,
    });
  }
  // Only keeps the current mechanics; the encounter calls it every tick
  // (resolveHazards), not at the start of a run alone.
  configureRunStart(mechanics) {
    this.mechanics = mechanics;
  }
  reset() {
    this.doomStacks = 0;
  }
  getEngineRules() {
    const {
      doom: doom,
      blasphemy: blasphemy,
      frailty: frailty,
      myopia: myopia,
    } = this.selection;
    return {
      ...(frailty
        ? {
            playerMaxHpReduction: [0.1, 0.2, 0.4][frailty - 1],
            itemRestrictions: {
              blockOverheal: true,
            },
          }
        : {}),
      ...(myopia
        ? {
            modifyPlayerCombatParams: (combatParams, rulesContext) => {
              const player = rulesContext.player;
              if (player.manualCastSpell) {
                return combatParams;
              }
              const weaponId = player.equipment.weapon;
              const formulaStyle = getWeaponFormulaStyle(weaponId, player.selectedAttackStyleIndex);
              const autocastSpell = getActiveSpell({
                weaponId: weaponId,
                selectedStyleIndex: player.selectedAttackStyleIndex,
                selectedSpell: player.combatSupplies.selectedSpell,
                spellbook: player.combatSupplies.spellbook,
              });
              const reducedAttackRange = Math.max(1, combatParams.attackRange - myopia * 2);
              if (formulaStyle === "ranged" || formulaStyle === "magic" || autocastSpell) {
                return {
                  ...combatParams,
                  attackRange: reducedAttackRange,
                };
              } else if (getWeaponCategory(weaponId) !== "polearm") {
                return combatParams;
              } else {
                return {
                  ...combatParams,
                  attackRange: reducedAttackRange,
                  meleeReach: "diagonal",
                };
              }
            },
          }
        : {}),
      ...(doom || blasphemy
        ? {
            onPlayerDamageTaken: (hit) => {
              if (hit.effectiveDamage <= 0 || hit.damageOverTime) {
                return null;
              }
              const ruleOutcome = {};
              if (doom) {
                this.doomStacks++;
                const doomLimit = [15, 10, 5][doom - 1];
                ruleOutcome.playerHitsplats = [
                  {
                    amount: this.doomStacks,
                    hitsplatType: "doom",
                  },
                ];
                ruleOutcome.gameMessage = buildDoomMessage(this.doomStacks, doomLimit);
                if (this.doomStacks >= doomLimit && !this.mechanics.infiniteHealth) {
                  ruleOutcome.fail = "Doom";
                }
              }
              if (
                blasphemy &&
                !["Solarflare", "Volatility", "Bees"].includes(hit.source)
              ) {
                ruleOutcome.prayerPointsDelta =
                  -Math.floor(hit.effectiveDamage / 5) * blasphemy;
              }
              return ruleOutcome;
            },
          }
        : {}),
    };
  }
};
var solHereditOptionsSchema = zObject({
  modifiers: zRecord(
    zString().refine((modifierId) => solHereditModifiers.some((modifier) => modifier.id === modifierId)),
    zUnion([zLiteral(1), zLiteral(2), zLiteral(3)]),
  ).optional(),
}).strict();
export { solHereditModifiers, solHereditSetupNotes, SolModifierState, solHereditOptionsSchema };
