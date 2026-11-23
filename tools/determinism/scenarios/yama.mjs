// Yama, phase 3 (kind "yama_p3") and its five contracts.
//
// The fight runs on a 7-tick beat that starts at tick 4; ten beats make a
// 70-tick cycle. On a beat Yama queues an attack for the next tick: melee if
// the player is next to him, otherwise magic and ranged in turn, which wind up
// for 3 ticks. Beats 0, 3 and 7 drop three fireballs on the player (and then
// Yama does not attack, unless a contract says so), beat 8 spawns void flares
// that explode 25 ticks later, and shadow waves sweep the arena every cycle.
import {
  attack, boss, castOn, command, equip, item, magicGear, meleeGear, nearestNpc, offensive, protect, rangedGear, setBossHp, special, use,
} from "./common.mjs";

// Arceuus is the default spellbook. Mark of Darkness needs a cosmic and a soul rune in the inventory, Dark Demonbane
// a fire and a soul rune.
const fireRune = 554;
const cosmicRune = 564;
const soulRune = 566;
const markOfDarknessRunes = [cosmicRune, soulRune];
const castMarkOfDarkness = (api) => api.act({ type: "castMarkOfDarkness" });

// The encounter's two debug actions, and the command the tutorial uses to fix Yama's first style.
const spawnFireball = (api) => command(api, { encounter: "yama_p3", type: "spawn-fireball" });
const spawnVoidFlare = (api) => command(api, { encounter: "yama_p3", type: "spawn-void-flare" });
const setOpeningStyle = (api, style) => command(api, { encounter: "yama_p3", type: "set-opening-style", style });

const snapshot = (api) => api.engine.getEncounterSnapshot();
const sameTile = (a, b) => a[0] === b[0] && a[1] === b[1];
/** Living void flares that can be attacked on this tick (they cannot for 3 ticks after they spawn). */
const voidFlares = (api, tick) => api.npcs().filter((npc) => npc.archetypeId === "voidflare" && npc.targetableFromTick <= tick);

/** Clicks a tile: the application drops the attack target, then walks. */
function walkTo(api, [x, y]) {
  api.act({ type: "attackTarget", targetId: null });
  api.moveTo(x, y);
}

/**
 * Clicks an NPC, with the weapon or with a spell, unless it is being attacked that way already. The application
 * also forgets the tile clicked before.
 */
function target(api, npc, spell = null) {
  const player = api.player();
  if (!npc || (player.attackTarget === npc.id && player.manualCastSpell === spell)) return;
  if (spell) castOn(api, npc.id, spell);
  else attack(api, npc.id);
  api.moveTo(...player.position);
}

const PROTECTION = { magic: "ProtectMagic", range: "ProtectRange", melee: "ProtectMelee" };

/** Turns on the protection prayer for a style, unless it is on already (the same prayer again would turn it off). */
function protectFrom(api, style) {
  if (api.player().activePrayer !== PROTECTION[style]) protect(api, PROTECTION[style]);
}

/** Yama's magic or ranged attack between its start and its release 3 ticks later: { style, releaseTick }, or null. */
const windup = (api) => boss(api)?.state.windup ?? null;

/** Prays against the attack Yama is winding up, from the tick after it starts. */
function prayAgainstWindup(api) {
  if (windup(api)) protectFrom(api, windup(api).style);
}

// A fireball explodes along its line and around its centre, but not on the two
// tiles next to the centre and square on to the line. With Mark of Darkness
// active, standing on one of them is a "perfect dodge".
const BESIDE_LINE = { horizontal: [0, 1], vertical: [1, 0], diagonal: [1, 1], "diagonal-alt": [1, -1] };

/** The two tiles beside the line of a fireball that has just been dropped on the player, or null. */
function fireballSidesteps(api) {
  const [x, y] = api.player().position;
  const fresh = snapshot(api).visuals.fireballStates.find((fireball) => fireball.ticksIntoPhase <= 1 && sameTile(fireball.centerPosition, [x, y]));
  if (!fresh) return null;
  const [dx, dy] = BESIDE_LINE[fresh.angle];
  return [[x + dx, y + dy], [x - dx, y - dy]];
}

/**
 * Whether a shadow wave of the standard fight covers the tile at that tick.
 * Each wave is two diagonal fronts, two tiles thick: one sweeps north-west
 * from 40 diagonals out, the other north-east from 20 out, two tiles a tick.
 * (The contracts shift each front by a seeded offset; that is not modelled.)
 */
function waveCovers(api, tick, [x, y]) {
  const waves = snapshot(api).state.waveConfig;
  return waves.deltas.some((delta) => {
    const elapsed = tick + 1 - delta - waves.startDelay;
    const cycle = Math.floor(elapsed / waves.periodTicks);
    if (cycle < 0 || (cycle === 0 && !waves.firstCycleDeltas.includes(delta))) return false;
    const travelled = waves.speedTilesPerTick * (elapsed - cycle * waves.periodTicks);
    const intoNorthWestwardFront = y - x + 40 - travelled;
    const intoNorthEastwardFront = x + y - 20 - travelled;
    return [0, 1].includes(intoNorthWestwardFront) || [0, 1].includes(intoNorthEastwardFront);
  });
}

const NEIGHBOURS = [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [1, 0], [-1, 0], [0, 1]];
const nearestFirst = ([hx, hy]) => (a, b) => Math.hypot(a[0] - hx, a[1] - hy) - Math.hypot(b[0] - hx, b[1] - hy);

/** Where to step this tick to stay clear of fireballs and (with `waves`) shadow waves, or null to stay. Prefers tiles near `home`. */
function dodge(api, tick, home, { waves = true } = {}) {
  const [x, y] = api.player().position;
  const sidesteps = fireballSidesteps(api)?.sort(nearestFirst(home));
  const clearOfWaves = (tile) => !waves || !waveCovers(api, tick + 1, tile);
  if (sidesteps) return sidesteps.find(clearOfWaves) ?? sidesteps[0];
  if (clearOfWaves([x, y])) return null;
  return NEIGHBOURS.map(([dx, dy]) => [x + dx, y + dy]).sort(nearestFirst(home)).find(clearOfWaves) ?? null;
}

/** Eats the first of that food in the inventory. */
function eat(api, foodId) {
  const slot = api.player().inventory.findIndex((held) => held?.id === foodId);
  if (slot >= 0) use(api, slot);
}

/** The equipment without the shield, for a two-handed weapon. */
const twoHanded = ({ shield, ...rest }) => rest;

const besideYama = [31, 33]; // he stands on 29..33 x 28..32; this tile is in reach of his melee
const flareSpawnTile = [38, 33]; // one of the four places a void flare can appear
const westFlareTile = [23, 33]; // another

export const scenarios = [
  // Never moves, never prays: every attack, fireball, wave and flare explosion of three cycles lands. Random start tile.
  {
    name: "yama/stands-in-everything",
    kind: "yama_p3",
    seed: 100,
    ticks: 230,
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      if (tick === 1) attack(api, boss(api).id);
    },
  },

  // The fight played well, from 833 HP to the kill and the 7 ticks after it: prays against each windup, sidesteps
  // fireballs with Mark of Darkness up (perfect dodges), steps through waves, kills flares with Dark Demonbane,
  // eats and restores prayer.
  {
    name: "yama/dodges-and-wins",
    kind: "yama_p3",
    seed: 101,
    ticks: 266, // the kill is on tick 259
    start: [31, 37],
    ...magicGear,
    inventory: [...markOfDarknessRunes, item.superRestore, fireRune, item.shark, item.shark, item.shark],
    script(tick, api) {
      const home = [31, 36];
      const restoreSlot = 2;
      if (tick === 1) {
        castMarkOfDarkness(api);
        offensive(api, "Augury");
      }
      prayAgainstWindup(api);
      if (api.player().vitals.hp < 60) eat(api, item.shark);
      if (api.player().prayerState.points < 20) use(api, restoreSlot);
      const step = dodge(api, tick, home);
      if (step) return walkTo(api, step);
      // Two casts kill a flare; changing flare with every cast (5 ticks) keeps both dying at once.
      const flares = voidFlares(api, tick);
      const flare = flares[Math.floor(tick / 5) % flares.length];
      if (flare) target(api, flare, "Dark Demonbane");
      else target(api, boss(api));
    },
  },

  // Melee: stands next to Yama, so every beat is a melee hit (poison, one more flare each time, no fireballs), uses
  // special attacks, walks off to hit a flare (he shoots, fireballs fall, on player 2's diagonal), comes back and
  // dies without prayers.
  {
    name: "yama/melee-range-then-death",
    kind: "yama_p3",
    seed: 102,
    ticks: 150, // dead on the last
    start: besideYama,
    mechanics: { infiniteHealth: true, infiniteSpecialAttack: true, fireballStart: "horizontal", duoSide: "player2" },
    ...meleeGear,
    inventory: [item.dragonClaws],
    script(tick, api) {
      if (tick === 1) {
        offensive(api, "Piety");
        protectFrom(api, "melee");
      }
      if (tick === 30 || tick === 45) special(api); // the fang's
      if (tick === 60) equip(api, 0, "weapon");
      if (tick === 62 || tick === 70) special(api); // the claws'
      if (tick === 120) {
        api.mechanics({ infiniteHealth: false, infiniteSpecialAttack: false });
        protect(api, "ProtectMelee"); // off
        offensive(api, "Piety"); // off
      }
      // 84-103: away at the flare tile in the west. Beats 88 and 102 are shots, beat 95 a fireball burst.
      if (tick >= 84 && tick < 104) {
        const westFlare = voidFlares(api, tick).find((npc) => sameTile(npc.position, westFlareTile));
        return westFlare ? target(api, westFlare) : walkTo(api, [24, 34]);
      }
      target(api, boss(api));
    },
  },

  // The Elysian spirit shield: a hit of an NPC on the player that is above 0 is cut to three quarters with a chance
  // of 0.7 (CombatSystem.applyDamage). No other scenario wears the shield, so those lines never ran. Here: Yama's
  // attacks on a player beside him with no protection prayer; infinite health keeps him standing.
  {
    name: "yama/elysian-spirit-shield",
    kind: "yama_p3",
    seed: 131,
    ticks: 160,
    start: besideYama,
    mechanics: { infiniteHealth: true, fireballStart: "horizontal", duoSide: "player2" },
    equipment: { ...meleeGear.equipment, shield: 12817 /* Elysian spirit shield */ },
    script(tick, api) {
      target(api, boss(api));
    },
  },

  // Every mechanic off, then on one at a time, with the player placed to reach each branch of Yama's choice of
  // attack; the debug actions in every fireball orientation and for both duo sides; the intro; a scripted kill with
  // flares and fireballs live, and debug actions after it.
  {
    name: "yama/toggles-and-debug-actions",
    kind: "yama_p3",
    seed: 103,
    ticks: 124, // victory on the last
    intro: true,
    start: flareSpawnTile,
    startHp: 10,
    mechanics: {
      yamaMageRange: false, yamaMelee: false, waves: false, fireballs: false, voidFlares: false,
      fireballStart: "vertical", duoSide: "player2", infiniteHealth: true, infiniteSpecialAttack: true,
    },
    equipment: { ...rangedGear.equipment, weapon: item.toxicBlowpipe },
    supplies: { blowpipe: { id: item.dragonDart } },
    inventory: markOfDarknessRunes,
    script(tick, api) {
      const awayFromYama = [37, 36];
      const steps = {
        1: () => {
          api.mechanics({ yamaStartGlyphs: true }); // a setup toggle, changed before the first tick
          api.skipIntro(); // no tick passes while the intro plays
          castMarkOfDarkness(api);
          target(api, boss(api));
        },
        2: () => spawnFireball(api), // vertical, diagonal-alt, horizontal, falling from ticks 4, 7 and 10
        // Three flares, on the three spawn tiles the player is not standing on; a fourth has nowhere to go.
        3: () => spawnVoidFlare(api),
        4: () => spawnVoidFlare(api),
        5: () => spawnVoidFlare(api),
        6: () => spawnVoidFlare(api),
        7: () => walkTo(api, awayFromYama),
        9: () => spawnVoidFlare(api), // the fourth, now that the tile is free
        10: () => spawnVoidFlare(api), // refused: four is the most
        12: () => {
          api.mechanics({ fireballStart: "horizontal", duoSide: "player1" });
          spawnFireball(api); // horizontal, diagonal, vertical
          target(api, boss(api));
        },
        15: () => special(api),
        // This burst's first fireball explodes on tick 29, with the damage of the flare spawned on tick 3: at 10 HP
        // that damage would kill, so stepping beside the line is no perfect dodge. The second's is one.
        23: () => {
          api.mechanics({ fireballStart: "random" });
          spawnFireball(api);
        },
        37: () => target(api, boss(api)),
        40: () => api.mechanics({ yamaMageRange: true }), // beat 46: a ranged or magic attack from afar
        48: () => walkTo(api, [34, 33]), // next to Yama
        // Beat 53 (a fireball beat): he would melee, melee is off, and he does not shoot on a fireball beat.
        // Beat 60: he would melee, so shoots instead; switching the mechanic off drops that queued attack.
        61: () => api.mechanics({ yamaMageRange: false }),
        62: () => api.mechanics({ yamaMageRange: true }), // beat 67: shoots at point-blank range
        69: () => api.mechanics({ yamaMelee: true, yamaMageRange: false, voidFlares: true }),
        // Beat 74: melee, which owes a flare; switching flares off before the next tick drops it.
        75: () => api.mechanics({ voidFlares: false }),
        76: () => api.mechanics({ voidFlares: true }),
        77: () => spawnVoidFlare(api),
        78: () => spawnVoidFlare(api),
        79: () => spawnVoidFlare(api),
        80: () => spawnVoidFlare(api),
        // Beat 81: melee again, and with four flares alive the one it owes is not spawned.
        83: () => {
          api.mechanics({ waves: true });
          walkTo(api, awayFromYama); // beat 88: out of reach, and magic and ranged are off: nothing
        },
        89: () => {
          api.mechanics({ yamaMageRange: true });
          setOpeningStyle(api, "range"); // beat 102 opens with ranged
          target(api, boss(api));
        },
        // This burst's first fireball explodes on tick 102 and the sidestep is a perfect dodge, which also spares
        // the player the wave that crosses his tile on tick 103.
        96: () => {
          api.mechanics({ fireballStart: "vertical" });
          spawnFireball(api);
        },
        // Beat 95 would drop fireballs on ticks 98, 101 and 104; switched on at 100 they are not registered and never land.
        100: () => api.mechanics({ fireballs: true }),
        103: () => setOpeningStyle(api, "magic"), // beat 109 opens with magic
        // This burst's first fireball explodes on tick 115, as a wave crosses the tile beside its line: again no
        // perfect dodge at 10 HP.
        109: () => spawnFireball(api),
        113: () => spawnVoidFlare(api),
        114: () => spawnVoidFlare(api),
        118: () => setBossHp(api, 0), // with flares charging, fireballs in the air and Yama winding up
        119: () => spawnFireball(api), // nothing, he is dead
        120: () => spawnVoidFlare(api), // nothing
      };
      steps[tick]?.();
      // Steps beside the line of each fireball of the burst of tick 23, and of the first of those of 96 and 109.
      const sidestepping = (tick >= 24 && tick <= 36) || tick === 99 || tick === 112;
      const sidesteps = sidestepping && fireballSidesteps(api);
      if (sidesteps) walkTo(api, sidesteps[0]);
    },
  },

  // Divine Severance: protection prayers last two ticks and block fully, so each is flicked on for the tick the
  // attack lands; a flare spawns every 20 ticks and kills if it explodes. Sidesteps fireballs and shoots flares
  // until four at once are too many.
  {
    name: "yama/divine-severance",
    kind: "yama_p3_divine",
    seed: 104,
    ticks: 86, // dead on the last
    start: [31, 37],
    mechanics: { waves: false },
    ...magicGear,
    script(tick, api) {
      const home = [31, 36];
      if (tick === 1) offensive(api, "Augury");
      if (windup(api)?.releaseTick === tick) protectFrom(api, windup(api).style);
      const step = dodge(api, tick, home, { waves: false }); // no Mark of Darkness: a sidestep, not a perfect dodge
      if (step) return walkTo(api, step);
      const flares = voidFlares(api, tick);
      target(api, flares[Math.floor(tick / 5) % flares.length] ?? boss(api));
    },
  },

  // Forfeit Breath: run energy is lost with every hit taken and every fourth tick, and the run ends at none. With
  // infinite stamina (nothing is lost), without (the hits take most of it), with it again while running laps to
  // exhaustion and resting (out of breath, but allowed), then without: the next hit ends the run.
  {
    name: "yama/forfeit-breath",
    kind: "yama_p3_forfeit_breath",
    seed: 105,
    ticks: 86, // out of breath on the last
    start: [31, 37],
    mechanics: { infiniteStamina: true, infiniteHealth: true, fireballStart: "vertical" },
    equipment: { ...rangedGear.equipment, weapon: item.zaryteCrossbow },
    supplies: { equippedAmmo: { id: item.diamondDragonBoltsE } },
    script(tick, api) {
      const lap = [[20, 36], [42, 36]];
      const player = api.player();
      if (tick === 1) offensive(api, "Rigour");
      prayAgainstWindup(api);
      if (tick < 36) {
        if (tick === 30) api.mechanics({ infiniteStamina: false });
        return target(api, boss(api));
      }
      if (tick === 36) {
        api.mechanics({ infiniteStamina: true });
        return walkTo(api, lap[0]);
      }
      // The engine switches run off when the energy is spent; from then on the player rests where he is.
      if (player.isRunEnabled) {
        if (sameTile(player.position, lap[0])) walkTo(api, lap[1]);
        if (sameTile(player.position, lap[1])) walkTo(api, lap[0]);
        return;
      }
      api.moveTo(...player.position);
      const restedTo = 120; // five ticks of rest, in units of 0.01%
      if (player.runEnergy.energy >= restedTo && api.engine.getState().mechanicsConfig.infiniteStamina) api.mechanics({ infiniteStamina: false });
    },
  },

  // Sensory Clouding: Yama walks after the player and melees; weapon range is halved; flares are lethal. Kites him,
  // stands under him at the north wall so that he shuffles aside, then kills him from 1 HP.
  {
    name: "yama/sensory-clouding",
    kind: "yama_p3_sensory",
    seed: 106,
    ticks: 149, // victory on the last
    start: [31, 37],
    mechanics: { infiniteHealth: true },
    ...rangedGear,
    script(tick, api) {
      const farCorner = [20, 24];
      const northWall = [30, 40];
      if (tick === 1) protectFrom(api, "melee");
      if (tick === 15) return walkTo(api, farCorner); // he follows at a walk, and shoots while out of reach
      if (tick === 60) return walkTo(api, northWall);
      // 90-119: stands in the middle of his 5x5. Each tick he steps a random way, unless the wall is there.
      if (tick >= 90 && tick < 120) {
        const [x, y] = boss(api).position;
        return walkTo(api, [x + 2, y + 2]);
      }
      if (tick === 120) return walkTo(api, [31, 30]); // out from under him
      if (tick === 140) setBossHp(api, 1);
      // From tick 20 he is 6 tiles away, one more than the halved range of the bow: the player walks back in.
      const shooting = tick < 15 || (tick >= 20 && tick < 60) || tick >= 130;
      if (shooting) target(api, boss(api));
    },
  },

  // Bloodied Blows: starts at 10 HP; both sides hit harder the lower their health; four flares a cycle, which no
  // longer take a guaranteed maximum hit. Chases the flares with a scythe, uses the voidwaker's special on Yama.
  {
    name: "yama/bloodied-blows",
    kind: "yama_p3_bloodied",
    seed: 107,
    ticks: 200,
    start: [31, 34],
    startHp: 10,
    mechanics: { infiniteHealth: true },
    equipment: { ...twoHanded(meleeGear.equipment), weapon: item.scytheOfVitur },
    inventory: [item.voidwaker],
    script(tick, api) {
      if (tick === 1) offensive(api, "Piety");
      if (tick === 40 || tick === 52) equip(api, 0, "weapon"); // the voidwaker, then the scythe again
      if (tick === 41 || tick === 46) special(api);
      if (tick === 120) setBossHp(api, 150); // 5% of his health: his hits nearly double
      const swinging = tick >= 40 && tick < 52;
      target(api, (!swinging && nearestNpc(api, (npc) => voidFlares(api, tick).includes(npc))) || boss(api));
    },
  },

  // Glyphic Attenuation: only crush hurts Yama, prayer bonus adds damage and drains prayer faster. Slashes, then
  // crushes; lets the prayer run out, then drinks and prays again.
  {
    name: "yama/glyphic-attenuation",
    kind: "yama_p3_glyphic",
    seed: 108,
    ticks: 200,
    start: besideYama,
    mechanics: { infiniteHealth: true },
    equipment: { ...twoHanded(meleeGear.equipment), weapon: item.soulreaperAxe },
    inventory: [item.prayerPotion],
    script(tick, api) {
      const smash = 2; // the axe's crush style
      const pray = () => {
        offensive(api, "Piety");
        protectFrom(api, "melee");
      };
      if (tick === 1) pray();
      if (tick === 25) api.act({ type: "attackStyleChange", index: smash });
      if (tick === 150) use(api, 0);
      if (tick === 152) pray();
      target(api, boss(api));
    },
  },

  // The restart button. Dies quickly (30 HP, no prayers) and restarts with fresh seeds; then restarts twice with
  // the seeds of a recording, as practising a recorded fight does: all four, then the encounter seed alone, from
  // which the others derive. Each run spawns a flare and sees the first fireballs and attacks: what the seeds decide.
  {
    name: "yama/restarts",
    kind: "yama_p3",
    seed: 109,
    ticks: 110,
    startHp: 30,
    ...rangedGear,
    script(tick, api) {
      if (!api.player().alive) {
        api.mechanics({ infiniteHealth: true });
        return api.restart();
      }
      if (tick === 50) return api.restart({ encounterSeed: 123456789, fireballSeed: 987654321, voidFlareSeed: 2, firstRangeMageType: "range" });
      if (tick === 80) return api.restart({ encounterSeed: 123456789 });
      if (tick === 81) {
        // Before the first tick of a run the player may walk to another start tile: two steps, here.
        api.prepareStart(31, 37);
        api.prepareStart(31, 37);
        api.finalizeStart();
      }
      const tickOfRun = api.engine.getState().currentTick + 1;
      if (tickOfRun === 1) target(api, boss(api));
      if (tickOfRun === 2) spawnVoidFlare(api);
    },
  },
  // Fireball phases and tiles and shadow wave tiles, beyond the default attack pattern.
  { name: "yama/scene-geometry", pure: (engine, objTypeLoader, registry, controlsOf, rendering) => yamaSceneGeometry(rendering) },
];

/**
 * What Yama's encounter shares with its scene: the phases and tiles of a fireball, and the tiles of the shadow waves.
 * The fights run these with the default attack pattern; here they also get a pattern of their own, random offsets,
 * no pattern at all, and an angle that is none.
 */
function yamaSceneGeometry(rendering) {
  const caught = (run) => {
    try {
      return run();
    } catch (error) {
      return { threw: error.name };
    }
  };
  const tiles = (list) => list.map((tile) => tile.join()).join(" ");
  const waveText = (list) => list.map((tile) => tile.x + "," + tile.y + tile.waveType + tile.waveIndex + tile.layer).join(" ");
  const pattern = { periodTicks: 35, deltas: [0, 5, 11, 20], speedTilesPerTick: 3, startDelay: 2, firstCycleDeltas: [5, 20], seed: 77, randomOffsets: true };
  const angles = ["vertical", "horizontal", "diagonal", "diagonal-alt"];
  return {
    fireballs: {
      beats: rendering.defaultYamaFireballBeats,
      burstStarts: [rendering.getFireballBurstStartTicks(), rendering.getFireballBurstStartTicks({}), rendering.getFireballBurstStartTicks({ beatStartTick: 1, beatIntervalTicks: 5, fireballBeats: [2, 9] })],
      phases: [-1, 0, 1, 2, 2.5, 3, 4, 5, 6, 60].map((tick) => rendering.getFireballPhase(10, 10 + tick)),
      impact: angles.map((angle) => tiles(rendering.getFireballImpactTiles([30, 30], angle))),
      explosion: angles.map((angle) => tiles(rendering.getFireballExplosionTiles([30, 30], angle))),
      explosionAtOrigin: angles.map((angle) => tiles(rendering.getFireballExplosionTiles([0, 0], angle))),
      unknownAngle: [caught(() => tiles(rendering.getFireballImpactTiles([30, 30], "sideways"))), caught(() => tiles(rendering.getFireballExplosionTiles([30, 30], "sideways")))],
    },
    waves: {
      defaults: [rendering.defaultYamaWaveDeltas, rendering.defaultYamaFirstCycleWaveDeltas],
      cyclePositions: [[0, 0, 70, 7], [6, 0, 70, 7], [7, 0, 70, 7], [20, 14, 70, 7], [200, 21, 70, 7], [3, 21, 35, 2]].map((args) => rendering.getYamaWaveCyclePosition(...args)),
      active: [[0, -1, [14]], [0, 0, [14]], [14, 0, [14]], [0, 1, [14]], [21, 3, []]].map((args) => rendering.isYamaWaveActiveInCycle(...args)),
      diamond: [[-20, 60], [-19, 40], [0, 39], [19, 81], [20, 81], [0, 82]].map((args) => rendering.isInsideYamaWaveDiamond(...args)),
      sealedRows: [18, 19, 20].map((y) => rendering.isYamaSealedRow(y)),
      randomOffsets: [[1, 0, 0, 0], [1, 0, 14, 0], [1, 1, 14, 0], [1, 1, 14, 1], [2, 1, 14, 1], [77, 3, 20, 5], [-5, 2, 21, 9]].map((args) => rendering.getYamaWaveRandomOffset(...args).join()),
      // Over the whole arena, tick by tick: with no pattern, with the default numbers spelled out, and with a pattern of its own.
      noPattern: [0, 8, 21, 30, 44, 78, 100, 151].map((tick) => waveText(rendering.getYamaWaveTiles(tick, 14, 44, 14, 44))),
      emptyPattern: [21, 100].map((tick) => waveText(rendering.getYamaWaveTiles(tick, 14, 44, 14, 44, {}))),
      seededWithoutOffsets: [21, 100].map((tick) => waveText(rendering.getYamaWaveTiles(tick, 14, 44, 14, 44, { seed: 5 }))),
      offsetsWithoutSeed: [21, 100].map((tick) => waveText(rendering.getYamaWaveTiles(tick, 14, 44, 14, 44, { randomOffsets: true }))),
      ownPattern: [0, 3, 9, 17, 26, 38, 61, 90].map((tick) => waveText(rendering.getYamaWaveTiles(tick, 14, 44, 14, 44, pattern))),
      narrow: waveText(rendering.getYamaWaveTiles(30, 29, 29, 0, 99)),
      nothing: rendering.getYamaWaveTiles(30, 40, 20, 14, 44).length,
    },
    constants: [rendering.yamaBasePosition, rendering.detonatedDeathCause, rendering.yamaSpawnFireballCommand, rendering.yamaSpawnVoidFlareCommand],
  };
}
