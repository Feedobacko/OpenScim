import { infernoNpcTypeIds } from "./constants.js";
import { createInfernoActor, createRetaliationState } from "./actors.js";
import { batNpcDefinition } from "./bat.js";
import { blobNpcDefinition, blobChildAttacksBySpecies, blobChildNpcDefinition, blobSplitSpawns } from "./blob.js";
import { createJadHealer, waveJadExecution, jadNpcDefinition, removeJadIfDue, createJad } from "./jad.js";
import { meleerNpcDefinition } from "./meleer.js";
import { nibblerNpcDefinition } from "./nibbler.js";
import { createMager } from "./mager.js";
import { createRanger } from "./ranger.js";
var corpseSpeciesByNpcTypeId = {
  [infernoNpcTypeIds.bat]: "bat",
  [infernoNpcTypeIds.blob]: "blob",
  [infernoNpcTypeIds.meleer]: "meleer",
  [infernoNpcTypeIds.ranger]: "ranger",
  [infernoNpcTypeIds.mager]: "mager",
};
var waveMonsterRemovalDelayTicks = {
  [infernoNpcTypeIds.nibbler]: 2,
  [infernoNpcTypeIds.bat]: 2,
  [infernoNpcTypeIds.blob]: 2,
  [infernoNpcTypeIds.blob_mage]: 2,
  [infernoNpcTypeIds.blob_range]: 2,
  [infernoNpcTypeIds.blob_melee]: 3,
  [infernoNpcTypeIds.meleer]: 5,
  [infernoNpcTypeIds.ranger]: 4,
  [infernoNpcTypeIds.mager]: 2,
};
function isBlob(npc) {
  return npc.npcTypeId === infernoNpcTypeIds.blob && blobNpcDefinition.isActor(npc);
}
function removeWaveMonsterIfDue(npc, context, spawnSplit) {
  if (jadNpcDefinition.isActor(npc)) {
    if (removeJadIfDue(npc, context)) {
      return {
        actorId: npc.id,
        npcTypeId: npc.npcTypeId,
        splits: [],
      };
    } else {
      return null;
    }
  }
  const removalDelayTicks = waveMonsterRemovalDelayTicks[npc.npcTypeId];
  if (
    removalDelayTicks === undefined ||
    npc.death?.status !== "started" ||
    npc.deathAnimationTick === undefined
  ) {
    return null;
  }
  if (context.tick < npc.deathAnimationTick + removalDelayTicks) {
    return null;
  }
  const splits = isBlob(npc)
    ? blobSplitSpawns.map(({ species: species, offset: offset }) => ({
        species: species,
        position: [npc.position[0] + offset[0], npc.position[1] + offset[1]],
      }))
    : [];
  if (spawnSplit) {
    for (const split of splits) {
      spawnSplit(split);
    }
  }
  context.despawnNpc(npc.id);
  return {
    actorId: npc.id,
    npcTypeId: npc.npcTypeId,
    splits: splits,
  };
}
function createNibblerActor(nibblerSetup) {
  const baseActor = createInfernoActor("nibbler", nibblerSetup.id, nibblerSetup.position);
  baseActor.spawnTick = nibblerSetup.spawnTick;
  baseActor.combat.attackSpeed = 4;
  baseActor.combat.attackRange = 1;
  baseActor.combat.attackStyle = "melee";
  baseActor.passThruNpcs = true;
  baseActor.blocksNpcMovement = false;
  return nibblerNpcDefinition.createActor(baseActor, {
    firstActionTick: nibblerSetup.spawnTick + (nibblerSetup.initialDelayTicks ?? 1),
    targetsPlayer: false,
    arrivedTargetId: null,
  });
}
function createBatActor(batSetup) {
  const baseActor = createInfernoActor("bat", batSetup.id, batSetup.position);
  baseActor.spawnTick = batSetup.spawnTick;
  baseActor.combat.attackSpeed = 3;
  baseActor.combat.attackRange = 4;
  baseActor.combat.attackStyle = "range";
  baseActor.combat.targetId = batSetup.targetId;
  baseActor.combat.retaliation = createRetaliationState();
  return batNpcDefinition.createActor(baseActor, {
    firstActionTick: batSetup.spawnTick + (batSetup.initialDelayTicks ?? 1),
  });
}
function createBlobActor(blobSetup) {
  const baseActor = createInfernoActor("blob", blobSetup.id, blobSetup.position);
  baseActor.spawnTick = blobSetup.spawnTick;
  baseActor.combat.attackSpeed = 3;
  baseActor.combat.attackRange = 15;
  baseActor.combat.attackStyle = "range";
  baseActor.combat.meleeReach = "diagonal";
  baseActor.combat.targetId = blobSetup.targetId;
  baseActor.combat.retaliation = createRetaliationState();
  return blobNpcDefinition.createActor(baseActor, {
    nextDecisionTick: blobSetup.spawnTick + (blobSetup.initialDelayTicks ?? 1),
    pendingRelease: null,
  });
}
function createBlobChildActor(blobChildSetup) {
  const baseActor = createInfernoActor(blobChildSetup.species, blobChildSetup.id, blobChildSetup.position);
  baseActor.spawnTick = blobChildSetup.spawnTick;
  baseActor.combat.attackSpeed = 4;
  baseActor.combat.attackRange = blobChildSetup.species === "blob_melee" ? 1 : 15;
  baseActor.combat.attackStyle = blobChildAttacksBySpecies[blobChildSetup.species].plan.damageType;
  baseActor.combat.targetId = blobChildSetup.targetId;
  baseActor.combat.retaliation = createRetaliationState();
  const firstActionTick = blobChildSetup.spawnTick + (blobChildSetup.initialDelayTicks ?? 3);
  baseActor.combat.nextActionTick = firstActionTick;
  return blobChildNpcDefinition.createActor(baseActor, {
    species: blobChildSetup.species,
    firstActionTick: firstActionTick,
  });
}
function createMeleerActor(meleerSetup) {
  const baseActor = createInfernoActor("meleer", meleerSetup.id, meleerSetup.position);
  baseActor.spawnTick = meleerSetup.spawnTick;
  baseActor.combat.attackSpeed = 4;
  baseActor.combat.attackRange = 1;
  baseActor.combat.attackStyle = "melee";
  baseActor.combat.targetId = meleerSetup.targetId;
  baseActor.combat.retaliation = createRetaliationState();
  return meleerNpcDefinition.createActor(baseActor, {
    firstActionTick: meleerSetup.spawnTick + (meleerSetup.initialDelayTicks ?? 1),
    nextDigCheckTick: meleerSetup.spawnTick + (meleerSetup.resurrected ? 49 : 50),
    dig: null,
    walkFromTick: meleerSetup.spawnTick,
  });
}
function createWaveMonsterActor(species, monsterSetup) {
  const {
    id: npcId,
    position: position,
    spawnTick: spawnTick,
    targetId: targetId,
  } = monsterSetup;
  const resurrected = monsterSetup.origin === "resurrection";
  const initialDelayOverride = resurrected
    ? {
        initialDelayTicks: resurrectedInitialDelayTicks,
      }
    : {};
  switch (species) {
    case "nibbler":
      return createNibblerActor({
        id: npcId,
        position: position,
        spawnTick: spawnTick,
      });
    case "bat":
      return createBatActor({
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        targetId: targetId,
        ...initialDelayOverride,
      });
    case "blob":
      return createBlobActor({
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        targetId: targetId,
        ...initialDelayOverride,
      });
    case "blob_mage":
    case "blob_range":
    case "blob_melee":
      return createBlobChildActor({
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        targetId: targetId,
        species: species,
      });
    case "meleer":
      return createMeleerActor({
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        targetId: targetId,
        resurrected: resurrected,
        ...initialDelayOverride,
      });
    case "ranger":
      return createRanger({
        variant: "ordinary",
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        initialTargetId: targetId,
        initialDelayTicks: resurrected ? resurrectedInitialDelayTicks : 1,
      });
    case "mager":
      return createMager({
        variant: "ordinary",
        id: npcId,
        position: position,
        spawnTick: spawnTick,
        initialTargetId: targetId,
        initialDelayTicks: resurrected ? resurrectedInitialDelayTicks : 1,
        attackRange: 15,
      });
    default:
      return (function (unknownSpecies) {
        throw new TypeError(`Unknown Inferno wave species: ${String(unknownSpecies)}`);
      })(species);
  }
}
function createWaveMonster(species, monsterSetup) {
  const npc = createWaveMonsterActor(species, monsterSetup);
  if (monsterSetup.origin === "resurrection") {
    npc.vitals.hp = Math.floor(npc.vitals.maxHp / 2) + 1;
  }
  return npc;
}
var resurrectedInitialDelayTicks = 4;
var infernoPlayerActorId = "player";
var defaultWaveJadOpeningDelayTicks = waveJadExecution.initialDelayTicks ?? 4;
var createWaveMonsterFactory =
  (species) =>
  ({ id: npcId, position: position, spawnTick: spawnTick, origin: origin }) =>
    createWaveMonster(species, {
      id: npcId,
      position: [...position],
      spawnTick: spawnTick,
      targetId: infernoPlayerActorId,
      origin: origin === "healer" ? "wave" : origin,
    });
var waveMonsterFactories = {
  nibbler: createWaveMonsterFactory("nibbler"),
  bat: createWaveMonsterFactory("bat"),
  blob: createWaveMonsterFactory("blob"),
  blob_range: createWaveMonsterFactory("blob_range"),
  blob_melee: createWaveMonsterFactory("blob_melee"),
  blob_mage: createWaveMonsterFactory("blob_mage"),
  meleer: createWaveMonsterFactory("meleer"),
  ranger: createWaveMonsterFactory("ranger"),
  mager: createWaveMonsterFactory("mager"),
  jad: ({ id: npcId, position: position, spawnTick: spawnTick, jad: jadTiming }) =>
    createJad({
      variant: "ordinary",
      id: npcId,
      position: [...position],
      spawnTick: spawnTick,
      targetId: infernoPlayerActorId,
      initialDelayTicks: jadTiming?.openingDelayTicks ?? defaultWaveJadOpeningDelayTicks,
      rangedMagicPeriod: jadTiming?.rangedMagicPeriod ?? waveJadExecution.rangedMagicPeriod ?? 8,
    }),
  jad_healer: ({
    id: npcId,
    position: position,
    spawnTick: spawnTick,
    parentId: parentId,
  }) => {
    if (parentId === undefined) {
      throw new TypeError(`Jad healer ${npcId} needs a parent`);
    }
    return createJadHealer({
      variant: "ordinary",
      id: npcId,
      position: [...position],
      spawnTick: spawnTick,
      parentId: parentId,
      firstTurnTick: spawnTick + 1,
    });
  },
};
export { corpseSpeciesByNpcTypeId, removeWaveMonsterIfDue, waveMonsterFactories };
