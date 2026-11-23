import { getMonsterHitpoints, getMonsterFormulaStats } from "../../engine/monsterStats.js";
var infernoRangerVariants = Object.freeze({
  zuk: Object.freeze({
    identity: Object.freeze({
      npcTypeId: 7702,
      size: 3,
      archetypeId: "zuk_ranger",
    }),
    attackRange: 16,
    attackSpeed: 4,
  }),
  ordinary: Object.freeze({
    identity: Object.freeze({
      npcTypeId: 7698,
      size: 3,
      archetypeId: "inferno_ranger",
    }),
    attackRange: 15,
    attackSpeed: 4,
  }),
});
var zukShieldFormulaStats = {
  levels: {
    attack: 1,
    strength: 1,
    defence: 1,
    ranged: 1,
    magic: 1,
  },
  offensive: {
    atk: 0,
    ranged: 0,
    magic: 0,
    str: 0,
    rangedStr: 0,
    magicStr: 0,
  },
  defensive: {
    stab: 0,
    slash: 0,
    crush: 0,
    rangedLight: 0,
    rangedStandard: 0,
    rangedHeavy: 0,
    magic: 0,
  },
  attributes: [],
};
var infernoVariantActorTemplates = {
  ranger: {
    zuk: infernoRangerVariants.zuk.identity,
    ordinary: infernoRangerVariants.ordinary.identity,
  },
  mager: {
    zuk: {
      npcTypeId: 7703,
      size: 4,
      archetypeId: "zuk_mager",
    },
    ordinary: {
      npcTypeId: 7699,
      size: 4,
      archetypeId: "inferno_mager",
    },
  },
  jad: {
    zuk: {
      npcTypeId: 7704,
      size: 5,
      archetypeId: "zuk_jad",
    },
    ordinary: {
      npcTypeId: 7700,
      size: 5,
      archetypeId: "inferno_jad",
    },
  },
  jad_healer: {
    zuk: {
      npcTypeId: 7705,
      size: 1,
      archetypeId: "zuk_jad_healer",
    },
    ordinary: {
      npcTypeId: 7701,
      size: 1,
      archetypeId: "inferno_jad_healer",
    },
  },
};
// A kind without a variant. "mager", "ranger", "jad" and "jad_healer" here
// are the ones of Zuk's fight; the monsters of the waves are the variant
// "ordinary" of infernoVariantActorTemplates.
var infernoActorTemplates = {
  zuk: {
    npcTypeId: 7706,
    size: 7,
    archetypeId: "zuk",
  },
  shield: {
    npcTypeId: 7707,
    size: 3,
    archetypeId: "zuk_shield",
  },
  mager: infernoVariantActorTemplates.mager.zuk,
  ranger: infernoVariantActorTemplates.ranger.zuk,
  jad: infernoVariantActorTemplates.jad.zuk,
  jad_healer: infernoVariantActorTemplates.jad_healer.zuk,
  healer: {
    npcTypeId: 7708,
    size: 1,
    archetypeId: "zuk_healer",
  },
  nibbler: {
    npcTypeId: 7691,
    size: 1,
    archetypeId: "inferno_nibbler",
  },
  bat: {
    npcTypeId: 7692,
    size: 2,
    archetypeId: "inferno_bat",
  },
  blob: {
    npcTypeId: 7693,
    size: 3,
    archetypeId: "inferno_blob",
  },
  blob_mage: {
    npcTypeId: 7694,
    size: 1,
    archetypeId: "inferno_blob_mage",
  },
  blob_range: {
    npcTypeId: 7695,
    size: 1,
    archetypeId: "inferno_blob_range",
  },
  blob_melee: {
    npcTypeId: 7696,
    size: 1,
    archetypeId: "inferno_blob_melee",
  },
  meleer: {
    npcTypeId: 7697,
    size: 4,
    archetypeId: "inferno_meleer",
  },
};
function getInfernoActorTemplate(kindOrVariant) {
  if (typeof kindOrVariant == "string") {
    return infernoActorTemplates[kindOrVariant];
  } else {
    return infernoVariantActorTemplates[kindOrVariant.kind][kindOrVariant.variant];
  }
}
// Hitpoints and combat stats of the actors made here come from the monster
// table (client/data/monsters.js) by NPC type id; Zuk's shield has its 600
// hitpoints here. A monster's own module may set its max hit, and the
// pillars are made in pillars.js with hitpoints and stats of their own.
function createInfernoActor(kindOrVariant, actorId, position) {
  const kind = typeof kindOrVariant == "string" ? kindOrVariant : kindOrVariant.kind;
  const identity = getInfernoActorTemplate(kindOrVariant);
  const maxHp = kind === "shield" ? 600 : getMonsterHitpoints(identity.npcTypeId);
  const formulaStats = kind === "shield" ? zukShieldFormulaStats : getMonsterFormulaStats(identity.npcTypeId);
  if (maxHp === undefined || formulaStats === undefined) {
    throw new TypeError(`Missing Inferno monster data for ${identity.npcTypeId}`);
  }
  return {
    ...identity,
    id: actorId,
    kind: "npc",
    role: kind === "zuk" ? "boss" : kind === "shield" ? "npc" : "minion",
    alive: true,
    position: [...position],
    previousPosition: [...position],
    facing: 0,
    vitals: {
      hp: maxHp,
      maxHp: maxHp,
    },
    history: new Map(),
    formulaStats: structuredClone(formulaStats),
    combat: {
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: "typeless",
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: {
        idle: null,
        walk: null,
        run: null,
        attack: null,
        death: null,
      },
    },
  };
}
function createRetaliationState(mode = "standard") {
  return {
    mode: mode,
    pending: [],
    lastIncomingAttackTick: null,
  };
}
export { infernoRangerVariants, getInfernoActorTemplate, createInfernoActor, createRetaliationState };
