// The Inferno: waves 1-68 and TzKal-Zuk on wave 69.
//
// Scripts keep no state of their own: what they do at a tick depends only on
// the tick and on what they read from the engine, so a scenario can run twice
// in one process and give the same digests.
import { attack, command, equip, item, magicGear, meleeGear, offensive, protect, rangedGear, setBossHp, special, use } from "./common.mjs";

// ---------------------------------------------------------------------------
// Reading the fight.

/** "nibbler", "bat", "blob", "blob_mage", "meleer", "ranger", "mager", "jad", "jad_healer", "healer", "shield", "zuk", "pillar", ... */
const kindOf = (npc) => npc.archetypeId.replace(/^(inferno|zuk)_/, "");
/** The NPCs of the given kinds that a click can land on: alive, not already dying, not a pillar. */
const targets = (api, ...kinds) =>
  api.npcs().filter((npc) => !npc.untargetable && npc.death === undefined && (kinds.length === 0 || kinds.includes(kindOf(npc))));
/** The encounter as the interface reads it: wave, pillars, and under `zuk` the shield and the set clock. */
const encounter = (api) => api.engine.getEncounterSnapshot().state;
/** Distance in tiles from the player to the nearest tile of an NPC. */
function distanceTo(api, npc) {
  const [x, y] = api.player().position;
  return Math.max(npc.position[0] - x, x - (npc.position[0] + npc.size - 1), npc.position[1] - y, y - (npc.position[1] + npc.size - 1), 0);
}

// ---------------------------------------------------------------------------
// Inputs.

/** Clicks an NPC, unless it is already the player's target. */
function attackOnce(api, npc) {
  if (npc && api.player().attackTarget !== npc.id) attack(api, npc.id);
}
/** Attacks the first living monster in the order of `kinds`. */
function attackFirst(api, kinds) {
  for (const kind of kinds) {
    const [npc] = targets(api, kind);
    if (npc) return attackOnce(api, npc);
  }
}
/** A click on the ground: drops the attack target and walks. */
function walkTo(api, x, y) {
  if (api.player().attackTarget !== null) attack(api, null);
  api.moveTo(x, y);
}
/** Turns a protection prayer on (the action is a toggle, so it is sent only on a change); null turns it off. */
function pray(api, prayer) {
  const active = api.player().activePrayer;
  if (prayer !== active) protect(api, prayer ?? active);
}
const applyPreset = (api, hp) => api.act({ type: "applyBossHpPreset", hp });

const protectionAgainst = { magic: "ProtectMagic", range: "ProtectRange", melee: "ProtectMelee" };
/** The attack style of each monster that has one style, the most dangerous first. */
const styleOfKind = {
  mager: "magic", ranger: "range", bat: "range", blob_mage: "magic", blob_range: "range",
  meleer: "melee", blob_melee: "melee", jad_healer: "melee",
};
/**
 * The prayer a careful player has up this tick: against the Jad attack that is
 * released soonest, else against the attack a blob is charging, else against
 * the most dangerous monster that has turned on the player. Null: none needed.
 */
function prayerNeeded(api) {
  const npcs = api.npcs().filter((npc) => npc.death === undefined);
  const jads = npcs.filter((npc) => kindOf(npc) === "jad" && npc.state.pendingAttack?.targetId === "player");
  if (jads.length > 0) {
    jads.sort((a, b) => a.state.pendingAttack.releaseTick - b.state.pendingAttack.releaseTick);
    return protectionAgainst[jads[0].state.pendingAttack.style];
  }
  const blob = npcs.find((npc) => kindOf(npc) === "blob" && npc.state.pendingRelease);
  if (blob) return protectionAgainst[blob.state.pendingRelease.style];
  for (const kind of Object.keys(styleOfKind)) {
    if (npcs.some((npc) => kindOf(npc) === kind && npc.combat.targetId === "player")) return protectionAgainst[styleOfKind[kind]];
  }
  return null;
}
/** Keeps the prayer `prayerNeeded` asks for; leaves the last one on when none is needed. */
function prayCarefully(api) {
  const prayer = prayerNeeded(api);
  if (prayer) pray(api, prayer);
}

const restoreDoses = [3024, 3026, 3028, 3030]; // super restore (4) to (1)
const restores = [item.superRestore, item.superRestore, item.superRestore, item.superRestore];
/** Drinks a dose of super restore when prayer runs low. */
function keepPrayerUp(api) {
  const player = api.player();
  if (player.prayerState.points > 25) return;
  const slot = player.inventory.findIndex((held) => held !== null && restoreDoses.includes(held.id));
  if (slot >= 0) use(api, slot);
}

/** The usual order to clear a wave in: what dies fast or hurts the pillars first, the mager and Jad last. */
const waveOrder = ["jad_healer", "nibbler", "bat", "blob_range", "blob_mage", "blob_melee", "blob", "ranger", "meleer", "mager", "jad"];

// The north-east pillar stands on (34..36, 39..41). A monster that walks north
// into it stays stuck south of it for as long as the player stands on the
// tile north of its middle, where neither can see the other.
const behindNorthEastPillar = "35,42";
/** Spawn layouts ("wave:" and a letter per spawn tile, r = ranger, m = meleer): on the tiles south of that pillar. */
const meleerSouthOfPillar = "9:------m--";
const rangersSouthOfPillar = "33:----r-r--";

// ---------------------------------------------------------------------------
// TzKal-Zuk. Zuk's blast hits a player who is north of row 44, or more than
// two tiles from the middle of the shield (gG in the engine), so the player
// stays on row 44 and walks with the shield.

const shieldRow = 44;
const bowRange = 10;
/** A bow reaches Zuk only from between these columns. */
const zukReach = { west: 18, east: 44 };

/** Walks when the shield is about to leave the player behind; returns whether it walked. */
function followShield(api) {
  const { shieldX, shieldNextX, shieldMovingEast } = encounter(api).zuk;
  const next = shieldNextX ?? shieldX; // null once the shield is destroyed
  const direction = next === shieldX ? 0 : shieldMovingEast ? 1 : -1;
  const middle = next + direction + 1; // of the shield, one tick from now
  const [x, y] = api.player().position;
  if (Math.abs(x - middle) <= 1 && y === shieldRow) return false;
  walkTo(api, Math.min(Math.max(middle + 2 * direction, zukReach.west), zukReach.east), shieldRow);
  return true;
}
/** The first monster of `kinds` that the bow reaches from where the player stands. */
function inReach(api, kinds) {
  for (const kind of kinds) {
    const npc = targets(api, kind).find((candidate) => distanceTo(api, candidate) <= bowRange);
    if (npc) return npc;
  }
  return undefined;
}
/** Healers heal until the player hits them once; the untagged ones have not turned on the player yet. */
const untagged = (api, ...kinds) => targets(api, ...kinds).filter((npc) => npc.combat.targetId !== "player" && distanceTo(api, npc) <= bowRange);

const practice = (api, type) => api.practice({ encounter: "inferno", type });

export const scenarios = [
  {
    // Members no fight calls: the arena made without the cache, an unknown debug action of the Zuk fight, and what the menus ask the controls
    // (which toggles and actions show at a stage, and what only applies later).
    name: "inferno/encounter-surface",
    pure(engine, objTypeLoader, registry, controlsOf) {
      const start = (mechanics) =>
        engine.createSimulationEngine({
          encounterConfig: { kind: "inferno", mechanics }, objTypeLoader, combatSeed: 1,
          inventory: engine.createEmptyInventory(), equipment: {}, combatSupplies: engine.createEmptyCombatSupplies(), attackStylePerCategory: {},
        });
      const waveNine = start({ infernoStartWave: "9" }), zuk = start({ infernoStartWave: "69" });
      let unknownZukAction;
      try {
        zuk.executeEncounterCommand({ encounter: "zuk", type: "no-such-action" });
      } catch (error) {
        unknownZukAction = `${error.name}: ${error.message}`;
      }
      const controls = controlsOf("inferno");
      const stages = [{ stage: 69, config: {} }, { stage: 9, config: { infernoStartWave: "9" } }, { stage: 9, config: { infernoStartWave: "69" } }];
      const snapshots = [waveNine.getEncounterSnapshot(), zuk.getEncounterSnapshot(), null];
      return {
        arena: waveNine.encounter.getArenaConfig(),
        unknownZukAction,
        toggles: controls.mechanicsToggles.map((toggle) => [toggle.key, stages.map((view) => [toggle.visibleInPractice?.(view) ?? "always", toggle.appliesLater?.(view) ?? null])]),
        actions: controls.debugActions.map((action) => [action.label, snapshots.map((encounterSnapshot) => action.visibleInPractice?.({ encounterSnapshot }) ?? "always")]),
      };
    },
  },
  {
    // The practice buttons and the restart button: each asks the encounter for a restart plan
    // (same wave again with the same spawns, with new spawns, with the spawns kept) and restarts with it.
    name: "inferno/practice-restarts",
    kind: "inferno",
    seed: 216,
    ticks: 200,
    mechanics: { infiniteHealth: true, infernoStartWave: "9" },
    ...rangedGear,
    script(tick, api) {
      if (tick % 10 === 3) attackFirst(api, waveOrder);
      if (tick === 30) practice(api, "retry-wave");
      if (tick === 70) practice(api, "reroll-wave");
      if (tick === 110) practice(api, "keep-spawns");
      if (tick === 150) api.restart();
      if (tick === 170) api.practice({ encounter: "zuk", type: "clear-spawns" }); // no plan: goes to the encounter as a command
    },
  },
  // ----- TzKal-Zuk --------------------------------------------------------
  {
    // Zuk from full health, default mechanics, the player behind the moving shield. The first set (tick 72) is killed
    // too slowly: it destroys the shield (tick 152) as the ranger dies; the mager and Zuk turn on the player, who dies.
    name: "inferno/zuk-set-destroys-shield-death",
    kind: "inferno",
    seed: 201,
    ticks: 200,
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) offensive(api, "Rigour");
      prayCarefully(api);
      if (followShield(api)) return;
      // The set shoots the shield until the player hits it, so one at a time: the ranger first.
      const [setMonster] = [...targets(api, "ranger"), ...targets(api, "mager")];
      attackOnce(api, setMonster && distanceTo(api, setMonster) <= bowRange ? setMonster : targets(api, "zuk")[0]);
    },
  },
  {
    // Zuk from the Pre-Jad preset to victory: Jad shoots the shield until hit, its three healers are tagged and Jad
    // killed; under 240 HP the four healers and the enrage; the healers, tagged, rain sparks; one is killed; Zuk dies
    // and the other three with him.
    name: "inferno/zuk-jad-healers-victory",
    kind: "inferno",
    seed: 202,
    ticks: 420,
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    inventory: restores,
    script(tick, api) {
      if (tick === 1) (offensive(api, "Rigour"), applyPreset(api, 480));
      keepPrayerUp(api);
      prayCarefully(api);
      if (followShield(api)) return;
      // Tag every healer, kill Jad, kill one of Zuk's four healers, then Zuk.
      const healers = targets(api, "healer");
      const oneHealer = healers.length === 4 && distanceTo(api, healers[0]) <= bowRange ? healers[0] : undefined;
      attackOnce(api, untagged(api, "jad_healer", "healer")[0] ?? inReach(api, ["jad"]) ?? oneHealer ?? inReach(api, ["zuk"]));
    },
  },
  {
    // The set clock and the boss HP controls, the player standing still in the open: a shot at the shield (it cannot
    // be hit), the slider to 590 (clock paused) and 700 (clock gives up), the Start preset (a set 72 ticks later,
    // which destroys the shield), 590 again (the running clock pauses), Pre-Healers with the shield gone (a new one;
    // healers and enrage on the next hit), Pre-Jad (Jad on the next hit), Zuk's attacks and sets switched off and on,
    // HP 0 with minions alive, a command after Zuk's death.
    name: "inferno/zuk-hp-presets-and-set-clock",
    kind: "inferno",
    seed: 203,
    ticks: 420,
    mechanics: { infiniteHealth: true, zukShieldStart: "right", zukSetTimer: true, zukShieldSafeTiles: true },
    ...rangedGear,
    script(tick, api) {
      const hitZuk = () => attackOnce(api, targets(api, "zuk")[0]);
      const at = {
        2: () => attack(api, "zuk_shield"),
        4: () => attack(api, null),
        5: () => setBossHp(api, 590),
        10: () => setBossHp(api, 700),
        15: () => applyPreset(api, 1200),
        100: () => setBossHp(api, 590), // the clock, running since the set of tick 86, pauses
        260: () => applyPreset(api, 240), // the set of tick 86 destroyed the shield at tick 133
        262: hitZuk,
        320: () => applyPreset(api, 480),
        322: hitZuk,
        360: () => api.mechanics({ zukAttacks: false, zukSets: false }),
        380: () => api.mechanics({ zukAttacks: true, zukSets: true }),
        400: () => setBossHp(api, 0),
        402: () => command(api, { encounter: "zuk", type: "spawn-set" }), // Zuk is dead: nothing happens
      };
      at[tick]?.();
    },
  },
  {
    // Every Zuk debug command, Zuk's own attacks off, the shield starting left. HP 470 at tick 1 makes the set clock
    // count as after Jad, so that it runs out at tick 525 and a set spawns by itself.
    name: "inferno/zuk-debug-commands",
    kind: "inferno",
    seed: 204,
    ticks: 545,
    mechanics: { infiniteHealth: true, zukAttacks: false, zukShieldStart: "left" },
    ...rangedGear,
    script(tick, api) {
      const zukCommand = (type, extra) => command(api, { encounter: "zuk", type, ...extra });
      const [x, y] = api.player().position;
      const spark = (dx, dy, landing) => ({ position: [x + dx, y + dy], amount: 7, ...(landing ? { landing: { height: 0, delayCycles: 0 } } : {}) });
      const at = {
        1: () => setBossHp(api, 470),
        2: () => zukCommand("spawn-set"),
        8: () => zukCommand("replace-set"),
        14: () => (zukCommand("spawn-mager"), zukCommand("spawn-ranger")),
        20: () => zukCommand("clear-spawns"),
        22: () => zukCommand("spawn-jad"),
        26: () => zukCommand("spawn-jad-healers"), // for the Jad that is there
        40: () => zukCommand("clear-spawns"),
        42: () => zukCommand("spawn-jad-healers"), // spawns its own Jad
        50: () => zukCommand("spawn-healers"),
        60: () => zukCommand("respawn-glyph"),
        64: () => zukCommand("demonstrate-jad", { style: "magic" }),
        66: () => zukCommand("demonstrate-jad", { style: "range" }),
        68: () => zukCommand("demonstrate-set"),
        70: () => zukCommand("demonstrate-heal"),
        72: () => zukCommand("inspect-ranged-graphic"),
        74: () => zukCommand("emit-spark-volley", { sparks: [spark(0, 0, true), spark(1, 1, false), spark(5, 0, true)] }), // two land on the player
        80: () => command(api, { encounter: "inferno", type: "retry-wave" }), // the interface restarts the run instead; as an action it does nothing
        82: () => command(api, { encounter: "yama_p3", type: "spawn-fireball" }), // another encounter's: dropped
        84: () => zukCommand("clear-spawns"),
        90: () => setBossHp(api, 245),
        91: () => attackOnce(api, targets(api, "zuk")[0]), // under 240: healers, enrage
        110: () => zukCommand("respawn-glyph"), // enraged: Zuk's cast clock is left alone
        112: () => (zukCommand("clear-spawns"), attack(api, null)),
      };
      at[tick]?.();
    },
  },
  {
    // Melee gear: clicks on the shield and on Zuk walk the player to the arena's north edge, where nothing is in
    // reach; the shield, starting left, moves away and Zuk's blasts kill the player.
    name: "inferno/zuk-melee-out-of-reach-death",
    kind: "inferno",
    seed: 205,
    ticks: 120,
    mechanics: { zukShieldStart: "left" },
    ...meleeGear,
    script(tick, api) {
      if (tick === 1) attack(api, "zuk_shield");
      if (tick === 3) attack(api, "zuk");
    },
  },

  // ----- Waves ------------------------------------------------------------
  {
    // Wave 1 from the intro: nibblers eat the west pillar until it collapses on them (tick 191); a bat drains run
    // energy and stats until Protect from Missiles goes up; the wave is cleared, wave 2 is cleared, wave 3 starts.
    name: "inferno/wave-1-intro-nibblers-eat-pillar",
    kind: "inferno",
    seed: 301,
    ticks: 262,
    intro: true,
    mechanics: { infernoStartWave: "1" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) api.skipIntro(); // the engine does not tick while the intro plays
      if (tick === 40) pray(api, "ProtectRange"); // until now the bat hits freely
      const { wave, pillars } = encounter(api);
      if (wave === 1 && pillars.every((pillar) => pillar.intact)) return; // wait for the nibblers to bring one down
      attackFirst(api, waveOrder);
    },
  },
  {
    // No pillar stands, so the nibblers of wave 3 bite the player (claw specials, infinite energy). On wave 4 the blob
    // reads the prayer: magic and missiles from afar, none and melee next to it (it may punch only without Protect
    // from Melee); it dies on the tick its charged attack is due, fires it anyway and splits into three. Wave 5 starts.
    name: "inferno/wave-3-no-pillars-blob-styles",
    kind: "inferno",
    seed: 302,
    ticks: 200,
    mechanics: {
      infiniteHealth: true,
      infiniteSpecialAttack: true,
      infernoStartWave: "3",
      infernoStartTile: "26,30",
      infernoWestPillarDestroyed: true,
      infernoSouthPillarDestroyed: true,
      infernoNorthEastPillarDestroyed: true,
    },
    equipment: { ...meleeGear.equipment, weapon: item.dragonClaws, shield: undefined },
    script(tick, api) {
      const player = api.player();
      const [blob] = targets(api, "blob");
      if (!blob || targets(api, "nibbler").length > 0) {
        if (!player.isSpecialAttackActive) special(api);
        return attackFirst(api, ["nibbler", "blob_range", "blob_mage", "blob_melee"]);
      }
      // Four spells of 24 ticks, from 12 ticks after the blob spawned (the nibblers are dead by then).
      const spell = Math.floor((tick - blob.spawnTick - 12) / 24);
      if (spell < 4) {
        pray(api, ["ProtectMagic", "ProtectRange", null, "ProtectMelee"][Math.max(spell, 0)]);
        if (spell >= 2 && distanceTo(api, blob) > 1) walkTo(api, blob.position[0] - 1, blob.position[1]);
        return;
      }
      // Then strike only two ticks before a charged attack is due: the hit lands a tick later, and a blob that it
      // kills starts dying on the very tick of the release.
      if (blob.state.pendingRelease?.releaseTick === tick + 2) attack(api, blob.id);
      else if (player.attackTarget !== null) attack(api, null);
    },
  },
  {
    // Wave 9 with magic: the meleer, stuck behind the north-east pillar, cannot reach the player; 50 ticks after it
    // spawned it digs down and comes up under them. It and the nibblers are killed, wave 10 starts.
    name: "inferno/wave-9-meleer-digs",
    kind: "inferno",
    seed: 303,
    ticks: 130,
    mechanics: { infernoStartWave: "9", infernoSpawnLayout: meleerSouthOfPillar, infernoStartTile: behindNorthEastPillar },
    ...magicGear,
    script(tick, api) {
      if (tick === 1) (offensive(api, "Augury"), pray(api, "ProtectMelee"));
      const [meleer] = targets(api, "meleer");
      // Wave 9's meleer is left alone until its first dig is over (the dig check moves on from spawn + 50).
      const firstDigAhead = meleer && (meleer.state.dig !== null || meleer.state.nextDigCheckTick === meleer.spawnTick + 50);
      if (encounter(api).wave === 9 && firstDigAhead) return;
      attackFirst(api, ["meleer", "nibbler", "bat"]);
    },
  },
  {
    // The same meleer, softened from round the pillar's corner (a click on it walks the player out and casts; the
    // next tick they step back and the meleer returns to its dead end), and killed by a cast that lands a tick after
    // it has dug down: it dies underground.
    name: "inferno/wave-9-meleer-dies-underground",
    kind: "inferno",
    seed: 310,
    ticks: 62,
    mechanics: { infernoStartWave: "9", infernoSpawnLayout: meleerSouthOfPillar, infernoStartTile: behindNorthEastPillar },
    ...magicGear,
    script(tick, api) {
      if (tick === 1) (offensive(api, "Augury"), pray(api, "ProtectMelee"));
      const [meleer] = targets(api, "meleer");
      if (!meleer) return;
      const lastCast = meleer.state.nextDigCheckTick - 3; // in flight for four ticks: lands when the meleer is underground
      const casts = [12, 18, 24, 30, 36, 42].filter(() => meleer.vitals.hp > 20).concat(lastCast);
      if (casts.includes(tick)) attack(api, meleer.id);
      else if (api.player().attackTarget !== null) walkTo(api, ...behindNorthEastPillar.split(",").map(Number));
    },
  },
  {
    // Wave 18 without prayers: the ranger kills the player. On the way, the inputs that are meant for Zuk: the boss HP
    // controls land on the first NPC in the world (the west pillar's stand-in: 100 HP, back to 255, then dead without
    // a collapse), a Zuk command does nothing. The start tile asked for is under a pillar: the default one instead.
    name: "inferno/wave-18-no-prayer-death",
    kind: "inferno",
    seed: 304,
    ticks: 120,
    mechanics: { infernoStartWave: "18", infernoStartTile: "27,24" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 2) setBossHp(api, 100);
      if (tick === 3) applyPreset(api, 480);
      if (tick === 4) command(api, { encounter: "zuk", type: "spawn-set" });
      if (tick === 5) setBossHp(api, 0);
    },
  },
  {
    // Wave 33 from behind the north-east pillar: two rangers without line of sight walk into the pillar and wait. The
    // player steps out, is shot (Protect from Missiles) and shoots back; at tick 90 they walk up to the second ranger,
    // which may now punch, and from tick 110 finish it with dragon claws specials. Wave 34 starts.
    name: "inferno/wave-33-rangers-line-of-sight",
    kind: "inferno",
    seed: 305,
    ticks: 162,
    mechanics: { infernoStartWave: "33", infernoSpawnLayout: rangersSouthOfPillar, infernoStartTile: behindNorthEastPillar },
    ...rangedGear,
    inventory: [item.dragonClaws],
    script(tick, api) {
      if (tick === 1) pray(api, "ProtectRange");
      if (tick < 30) return; // hidden
      if (tick === 30) return walkTo(api, 37, 42); // two tiles east: out of the pillar's shadow
      const [ranger] = targets(api, "ranger");
      if (ranger && tick >= 90) {
        const player = api.player();
        if (distanceTo(api, ranger) > 1) return walkTo(api, ranger.position[0] - 1, ranger.position[1]);
        if (tick < 110) return; // stands there, to be punched
        if (player.inventory[0]?.id === item.dragonClaws) return equip(api, 0, "weapon");
        if (!player.isSpecialAttackActive && player.specialAttack.energy >= 50) special(api);
      }
      attackFirst(api, ["ranger", "nibbler"]);
    },
  },
  {
    // Wave 62, every species at once, no prayers, infinite health: everything dies except the mager, which revives
    // both bats, the blob, the ranger and the meleer (they come back at half health and leave no corpse the second
    // time); the meleer digs on its own. From tick 380 the mager dies too and wave 63 starts.
    name: "inferno/wave-62-mager-revives",
    kind: "inferno",
    seed: 306,
    ticks: 450,
    mechanics: { infiniteHealth: true, infernoStartWave: "62" },
    ...rangedGear,
    script(tick, api) {
      attackFirst(api, tick < 380 ? waveOrder.filter((kind) => kind !== "mager") : waveOrder);
    },
  },
  {
    // Wave 66 to 68: one mager is killed and the other, left alone while unhurt, revives it; the revived one revives
    // the next corpse in turn. Clearing wave 66 collapses the three pillars; Jad on wave 67 with prayers switched on
    // its cue, the player next to it (so it also stomps), its five healers tagged one by one; Jad dies, wave 68 starts.
    name: "inferno/wave-66-pillars-fall-jad",
    kind: "inferno",
    seed: 307,
    ticks: 352,
    mechanics: { infiniteHealth: true, infernoStartWave: "66" },
    ...rangedGear,
    inventory: restores,
    script(tick, api) {
      if (tick === 1) offensive(api, "Rigour");
      keepPrayerUp(api);
      prayCarefully(api);
      const [jad] = targets(api, "jad");
      if (jad && encounter(api).wave === 67) {
        const [healer] = untagged(api, "jad_healer");
        if (healer) return attackOnce(api, healer);
        if (distanceTo(api, jad) > 1 && api.player().attackTarget === null) return walkTo(api, jad.position[0] - 1, jad.position[1] + 2);
        return attackOnce(api, jad);
      }
      const magers = targets(api, "mager");
      if (magers.length === 1 && tick < 200 && magers[0].vitals.hp === magers[0].vitals.maxHp) return attackFirst(api, ["nibbler"]);
      attackFirst(api, waveOrder);
    },
  },
  {
    // Wave 68 into wave 69: three Jads out of step (the prayer follows whichever releases next), nine healers; then
    // Zuk's entrance (input locked, the teleport, Zuk and the shield appearing, the shield coming down) and the first
    // ticks of a Zuk fight that began from the waves.
    name: "inferno/wave-68-triple-jad-into-zuk",
    kind: "inferno",
    seed: 308,
    ticks: 370,
    mechanics: { infiniteHealth: true, infernoStartWave: "68" },
    ...rangedGear,
    inventory: restores,
    script(tick, api) {
      if (tick === 1) offensive(api, "Rigour");
      keepPrayerUp(api);
      prayCarefully(api);
      if (encounter(api).zuk) {
        if (!followShield(api)) attackOnce(api, inReach(api, ["zuk"]));
        return;
      }
      const [healer] = untagged(api, "jad_healer");
      if (healer) attackOnce(api, healer);
      else attackFirst(api, ["jad", "jad_healer"]);
    },
  },
  {
    // The setup changed before the first tick, as the setup panel does: from wave 1 (intro) to Zuk (Zuk and the
    // shield appear, the player is moved), the shield's side, back to a wave (Zuk removed, the player moved; the start
    // tile asked for is outside the arena), then a spawn layout that places only the ranger, a pinned wave, another
    // start tile and the south pillar down. Then a minute of that wave.
    name: "inferno/setup-changed-before-start",
    kind: "inferno",
    seed: 309,
    ticks: 100,
    intro: true,
    mechanics: { infiniteHealth: true, infernoStartWave: "1" },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) {
        api.mechanics({ infernoStartWave: "69" });
        api.mechanics({ zukShieldStart: "left" });
        api.mechanics({ zukShieldStart: "right" });
        api.mechanics({ infernoStartWave: "21", infernoStartTile: "5,5" });
        api.mechanics({
          infernoStartTile: "30,30", // the run is already set up for waves, so the player is not moved again
          infernoSpawnLayout: "21:r--------", // the ranger north-west; the blob draws one of the other eight tiles
          infernoPinnedWave: "21",
          infernoSouthPillarDestroyed: true,
        });
        api.skipIntro();
      }
      prayCarefully(api);
      attackFirst(api, waveOrder);
    },
  },
  // The setup helpers the menus share with the encounter, with every refusal they can give.
  { name: "inferno/setup-helpers", pure: (engine, objTypeLoader, registry, controlsOf, rendering) => infernoSetupHelpers(rendering) },
];

/** What an Inferno helper answered, or the error it threw. */
const caughtInferno = (run) => {
  try {
    return run();
  } catch (error) {
    return { threw: error.name, message: error.message };
  }
};

/**
 * The Inferno's setup helpers, which the menus share with the encounter: start tiles, wave numbers and spawn layouts.
 * No fight reaches their refusals (a start tile outside the arena, under a pillar or off the floor; a layout for a
 * wave without slots, with the wrong number of tiles, empty, or with monsters the wave does not have).
 */
function infernoSetupHelpers(rendering) {
  const setup = (startWave, destroyedPillars = {}) => ({ startWave, destroyedPillars });
  const allDestroyed = { west: true, north: true, south: true, nw: true, ne: true, s: true, w: true, n: true };
  // One letter per tile of a 64 x 64 square: how the start tile is judged for a wave-2 start with every pillar standing.
  const letter = { "out-of-bounds": " ", pillar: "P", blocked: "b" };
  const judge = (x, y, startSetup, walkable) => rendering.validateInfernoStartTile([x, y], startSetup, walkable);
  const rows = [];
  let pillarTile = null, floorTile = null;
  for (let y = 63; y >= 0; y--) {
    let row = "";
    for (let x = 0; x < 64; x++) {
      const verdict = judge(x, y, setup(2));
      row += verdict.ok ? "." : letter[verdict.reason];
      if (!verdict.ok && verdict.reason === "pillar") pillarTile ??= [x, y];
      if (verdict.ok) floorTile ??= [x, y];
    }
    rows.push(row);
  }
  const never = () => false, always = () => true;
  const slots = (...kinds) => Array.from({ length: rendering.infernoSpawnTileCount }, (_, index) => kinds[index] ?? null);
  const slotWaves = [];
  for (let wave = -1; wave <= 70; wave++) slotWaves.push(rendering.getInfernoWaveSlotNpcs(wave).join());
  const firstWaveWithoutSlots = slotWaves.findIndex((kinds, index) => index >= 2 && index <= 67 && kinds === "") - 1;
  const snapshot = (state) => ({ kind: "inferno", state });
  return {
    startTiles: {
      rows,
      pillarTile,
      floorTile,
      verdicts: [
        judge(-1, 30, setup(2)),
        judge(30.5, 30, setup(2)),
        judge(30, Number.NaN, setup(2)),
        pillarTile && judge(...pillarTile, setup(2)),
        pillarTile && judge(...pillarTile, setup(2), never),
        pillarTile && judge(...pillarTile, setup(66)),
        pillarTile && judge(...pillarTile, setup(67), never),
        pillarTile && judge(...pillarTile, setup(2, allDestroyed), never),
        floorTile && judge(...floorTile, setup(2), never),
        floorTile && judge(...floorTile, setup(2), always),
        floorTile && judge(...floorTile, setup(2), (x, y) => x === floorTile[0] && y === floorTile[1]),
      ],
      parsed: ["31,25", "0,0", "999,999", "1000,1", "31, 25", "31;25", "-1,2", "", 31, null, undefined, ["31,25"]].map((text) => rendering.parseTileString(text)),
      formatted: [rendering.formatTileString([31, 25]), rendering.formatTileString([0, -4])],
      choosable: [0, 1, 2, 66, 67, 68, 69].map((wave) => rendering.canChooseInfernoStartTile(wave)),
    },
    waves: {
      clamped: [Number.NaN, Infinity, -3, 0, 1, 33.4, 33.5, 68, 69, 70, "12"].map((wave) => rendering.clampInfernoWave(wave)),
      pinnable: [0, 1, 2, 66, 67, 68, 69].map((wave) => rendering.canPinInfernoWave(wave)),
      slotKinds: ["mager", "ranger", "meleer", "blob", "bat", "nibbler", "jad", "zuk"].map((kind) => rendering.isInfernoSlotNpcKind(kind)),
      slotWaves,
      firstWaveWithoutSlots,
    },
    spawnLayouts: {
      tileCount: rendering.infernoSpawnTileCount,
      validated: [
        rendering.validateInfernoSpawnLayout(0, slots("bat")),
        rendering.validateInfernoSpawnLayout(67, slots("bat")),
        rendering.validateInfernoSpawnLayout(1.5, slots("bat")),
        firstWaveWithoutSlots > 0 ? rendering.validateInfernoSpawnLayout(firstWaveWithoutSlots, slots("bat")) : "every wave has a slot monster",
        rendering.validateInfernoSpawnLayout(1, ["bat"]),
        rendering.validateInfernoSpawnLayout(1, slots()),
        rendering.validateInfernoSpawnLayout(1, slots("mager", "mager", "mager", "mager", "mager", "mager", "mager", "mager", "mager")),
        rendering.validateInfernoSpawnLayout(1, slots(...rendering.getInfernoWaveSlotNpcs(1))),
        rendering.validateInfernoSpawnLayout(35, slots("jad")),
        rendering.validateInfernoSpawnLayout(35, slots(null, null, ...rendering.getInfernoWaveSlotNpcs(35))),
        rendering.validateInfernoSpawnLayout(62, slots("bat", "blob", "meleer", "ranger", "mager", "mager")),
        rendering.validateInfernoSpawnLayout(66, slots(...rendering.getInfernoWaveSlotNpcs(66))),
      ],
      // The text of a layout and back: valid ones, a wave the letters do not fit, and what is no layout at all.
      parsed: ["1:b--------", "1:---------", "1:bbbbbbbbb", "35:--" + "-".repeat(7), "62:blmrgg---", "62:blmrg----", "67:b--------", "0:b--------", "1:b-------", "1:b---------", "1:x--------", "01:b--------", 7, null]
        .map((text) => caughtInferno(() => { const layout = rendering.parseInfernoSpawnLayout(text); return layout && { layout, text: rendering.formatInfernoSpawnLayout(layout) }; })),
      formatted: rendering.formatInfernoSpawnLayout({ wave: 9, slots: ["bat", null, "blob", "meleer", "ranger", "mager", null, null, "bat"] }),
    },
    // Which reroll command the wave menu offers for a snapshot of the encounter.
    spawnCommands: [
      null,
      { kind: "yama_p3", state: {} },
      snapshot({ wave: 1, startSpawnLayout: "1:b--------", pinnedWave: null }),
      snapshot({ wave: 2, startSpawnLayout: "1:b--------", pinnedWave: null }),
      snapshot({ wave: 2, startSpawnLayout: "", pinnedWave: 2 }),
      snapshot({ wave: 67, startSpawnLayout: "", pinnedWave: null }),
      snapshot({ wave: 68, startSpawnLayout: "nonsense", pinnedWave: 3 }),
      snapshot({ wave: 69, startSpawnLayout: undefined, pinnedWave: 69 }),
    ].map((encounterSnapshot) => rendering.getInfernoSpawnCommandType(encounterSnapshot)),
  };
}
