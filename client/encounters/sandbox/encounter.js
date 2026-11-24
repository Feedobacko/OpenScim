// The sandbox: a scenario of the player's own (scenario.js) played in the
// room of another encounter (arenas.js). Its NPCs come from a catalog of
// monsters the client can already draw (catalog.js) and share one behaviour
// (brawler.js).
//
// Two modes:
//   "versus"  every NPC attacks the player; the run is won when all are dead.
//   "ffa"     everyone attacks the nearest enemy, NPCs included: an NPC's
//             enemies are the NPCs of other teams (an NPC without a team is
//             a team of its own) and, unless the scenario says otherwise,
//             the player. NPCs of the team "player" fight on his side. The
//             run is won when the player's side is the last standing; with
//             `ffaIncludesPlayer` off, when one team of NPCs is left (the
//             snapshot names it). An NPC that is hit turns on its attacker
//             if that is an enemy.
//
// The order of the hooks within a tick: the engine moves each NPC with the
// definition's `move` (the target is chosen there and again in `tick`),
// then `processNpcTick` passes the turn to the definition; `processPostTick`
// takes away the dead and decides the outcome. No timer, no hazard.
//
// The boss of the arena, when the scenario asks for it
// (`options.bossMechanics`) and the arena has one (arenas.js, `hostKind`):
// the arena's own encounter, made by its own factory, runs inside the
// sandbox as its host, with every mechanic it has. The sandbox hands it
// every hook the engine calls, adds the scenario's NPCs to its own, and
// keeps the run going until both the host's fight and the scenario's are
// won. The host's NPCs are a team of their own ("boss") in "ffa".
//
// Seeds: `encounterSeed`, the host's seeds, and the scenario itself, so that
// a replay or a restart with the same seeds plays the same scenario whatever
// the editor holds by then.
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { isActorAlive } from "../../engine/npcState.js";
import { NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { brawlerNpcDefinition, getApproachRange } from "./brawler.js";
import { getSandboxNpcEntry, getSandboxSpecialAttack, sandboxNpcCatalog } from "./catalog.js";
import { getSandboxArena, sandboxArenas, sandboxKind, sandboxVariantKind } from "./arenas.js";
import { createEmptyScenario, normalizeScenario, playerTeam } from "./scenario.js";
import { getActiveScenario } from "./activeScenario.js";
import { holdSandboxForStart, isSandboxHeld } from "./clock.js";
import { noteRunningScenario } from "./visit.js";
import { isArenaTileWalkable } from "../../engine/arena.js";
import { emitColosseumVisual } from "../sol-heredit/constants.js";
import { emitInfernoVisual } from "../inferno/events.js";

// inferred: a body stays four ticks after the kill (the Colosseum's monsters stay three or four).
const deathTicks = 4;
// inferred: the first attack two ticks after the start, as the fixture's.
const firstActionTick = 2;
// inferred: the victory screen three ticks after the last kill, once the
// body has begun to fall (not a game number: the sandbox is not in the game).
const ticksFromLastKillToVictory = 3;
const bossTeam = "boss";

const footprintGap = (a, b) => {
  const dx = Math.max(0, b.position[0] - (a.position[0] + a.size - 1), a.position[0] - (b.position[0] + b.size - 1));
  const dy = Math.max(0, b.position[1] - (a.position[1] + a.size - 1), a.position[1] - (b.position[1] + b.size - 1));
  return Math.max(dx, dy);
};
const isBrawler = (npc) => npc?.definition?.id === brawlerNpcDefinition.id;

// The host's hooks the engine calls only if they are there: the sandbox has
// each exactly when its host has it. Those that name an NPC skip the
// sandbox's own NPCs (the value is what they answer for one).
const hostHooks = [
  "prepareNpcBand", "completeNpcBand", "onPlayerAttackStarted", "onPlayerAttackResolved", "executeCommand", "acceptsInput",
  "approachRange", "moveDisplacedPlayer", "syncBossHp", "enterBossHpPhase", "planPracticeRestart", "planRestartStart",
  "getEngineRules", "refineArenaConfig", "configureRunStart",
];
const hostNpcHooks = { removeNpcIfDue: undefined, resolveNpcLocalEffects: [] };
// Every hook the sandbox hands its host: test/test-sandbox-wiring.mjs checks
// that each method the engine calls on an encounter is the sandbox's own or
// one of these, so that a hook the engine calls later is not skipped.
export const sandboxHostHooks = [...hostHooks, ...Object.keys(hostNpcHooks), "onNpcDefeated", "moveNpc"];

export class SandboxEncounter {
  // `createHost(kind)` makes the encounter of a kind (registry.js hands it in).
  constructor(arenaId, options, createHost) {
    this.arena = getSandboxArena(arenaId);
    this.kind = sandboxVariantKind(this.arena.id);
    this.createHost = createHost;
    // A scenario handed to the factory (the harness, a test) wins over the editor's.
    this.givenScenario = options?.scenario ? normalizeScenario(options.scenario) : null;
    this.brawlers = brawlerNpcDefinition.register({
      selectTarget: (actor, context) => this.selectTarget(actor, context),
      entryOf: (actor) => getSandboxNpcEntry(actor.state.entryId),
      queueStrike: (pending) => this.strikes.push(pending),
    });
    this.reset();
  }

  // --- what the engine always calls -------------------------------------
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.scenario = seeds?.scenario ? normalizeScenario(seeds.scenario) : this.pickScenario();
    // The scene follows the run's scenario, not the editor's (visit.js).
    noteRunningScenario(this.arena.id, this.scenario);
    this.outcome = { phase: "active" };
    this.winner = null;
    this.npcIds = [];
    this.ownNpcs = [];
    // Attacks of tiles that have not landed yet (brawler.js, special):
    // { landsAt, special, data, attackerId, targetId }.
    this.strikes = [];
    const hosted = this.scenario.options.bossMechanics && this.arena.hostKind && this.createHost;
    this.setHost(hosted ? this.createHost(this.arena.hostKind) : null, seeds?.host);
    // A new run or a restart waits for "Start encounter" (clock.js).
    holdSandboxForStart();
  }
  setHost(host, hostSeeds) {
    this.host = host;
    if (host && hostSeeds) host.reset(hostSeeds);
    for (const name of [...hostHooks, ...Object.keys(hostNpcHooks), "onNpcDefeated", "moveNpc", "runStartMechanicsKeys"]) delete this[name];
    const hostDefinitions = host?.getNpcDefinitions?.();
    this.definitions = new NpcDefinitionRegistry([...(hostDefinitions?.registrations.values() ?? []), this.brawlers]);
    if (!host) return;
    for (const name of hostHooks) if (host[name]) this[name] = (...args) => host[name](...args);
    for (const [name, answerForOwn] of Object.entries(hostNpcHooks)) {
      if (host[name]) this[name] = (npc, ...rest) => (isBrawler(npc) ? answerForOwn : host[name](npc, ...rest));
    }
    if (host.onNpcDefeated) {
      this.onNpcDefeated = (defeat, ...rest) => (this.npcIds.includes(defeat.npcId) ? undefined : host.onNpcDefeated(defeat, ...rest));
    }
    if (host.moveNpc) {
      this.moveNpc = (npc, context, mechanics) =>
        isBrawler(npc) ? this.definitions.move(npc, { ...context, random: this.random }) : host.moveNpc(npc, context, mechanics);
    }
    if (host.runStartMechanicsKeys) this.runStartMechanicsKeys = host.runStartMechanicsKeys;
  }
  // Asked by the application's tick loop only (not by the engine).
  isPaused() {
    return isSandboxHeld();
  }
  // The editor's scenario when it is for this arena; otherwise an empty one,
  // and the editor offers to go to the arena of its own.
  pickScenario() {
    const scenario = this.givenScenario ?? getActiveScenario();
    if (scenario && scenario.arena === this.arena.id) return scenario;
    return { ...createEmptyScenario(this.arena.id), meta: { name: `Empty: ${this.arena.name}`, author: "", description: "" } };
  }
  getSeeds() {
    return { encounterSeed: this.seed, scenario: structuredClone(this.scenario), ...(this.host ? { host: this.host.getSeeds() } : {}) };
  }
  getDefaultMechanicsConfig() {
    return this.host?.getDefaultMechanicsConfig() ?? {};
  }
  getDefaultPlayerStart(mechanics) {
    return [...(this.scenario.options.playerStart ?? this.host?.getDefaultPlayerStart(mechanics) ?? this.arena.playerStart)];
  }
  // The sandbox's run starts with "Start encounter"; a host's intro is left out.
  getIntroConfig() {
    return null;
  }
  getArenaConfig() {
    return this.host?.getArenaConfig() ?? { bounds: null, collisionMap: null, walkableTiles: null };
  }
  createNpcs(startTile) {
    const hostNpcs = this.host?.createNpcs(startTile) ?? [];
    // A scenario NPC whose id is a host NPC's (one called "yama", say) is
    // renamed, as normalizeNpc renames duplicates, never left out.
    const taken = new Set(hostNpcs.map((npc) => npc.id));
    const own = this.scenario.npcs.map((npc) => {
      let id = npc.id;
      for (let n = 2; taken.has(id); n++) id = `${npc.id}-${n}`;
      taken.add(id);
      return id === npc.id ? npc : { ...npc, id };
    });
    this.ownNpcs = own;
    this.npcIds = own.map((npc) => npc.id);
    return [...hostNpcs, ...own.map((npc) => this.createNpcActor(npc))];
  }
  createNpcActor(npc) {
    const entry = getSandboxNpcEntry(npc.npc);
    const formulaStats = structuredClone(getMonsterFormulaStats(entry.npcTypeId));
    if (npc.levels) formulaStats.levels = { ...formulaStats.levels, ...npc.levels };
    const hitpoints = npc.hp ?? getMonsterHitpoints(entry.npcTypeId);
    const attackSpeed = npc.attackSpeed ?? entry.attackSpeed;
    return brawlerNpcDefinition.createActor(
      {
        id: npc.id,
        kind: "npc",
        // Not "boss": the default scene plays the death of every other NPC by itself.
        role: "minion",
        npcTypeId: entry.npcTypeId,
        archetypeId: `sandbox_${entry.id}`,
        size: entry.size,
        alive: true,
        position: [...npc.position],
        previousPosition: [...npc.position],
        facing: 0,
        history: new Map(),
        vitals: { hp: hitpoints, maxHp: hitpoints },
        formulaStats,
        combat: {
          attackSpeed,
          attackRange: getApproachRange(entry),
          attackStyle: entry.attacks[0].style,
          nextActionTick: firstActionTick,
          targetId: null,
          lastAttackTick: null,
          animations: { idle: null, walk: null, run: null, attack: null, death: null },
        },
      },
      { entryId: entry.id, team: this.teamOf(npc), maxHit: npc.maxHit, lastAttackerId: null },
    );
  }
  resolveHazards(context, mechanics) {
    return [...(this.host?.resolveHazards(context, mechanics) ?? []), ...this.landStrikes(context)];
  }
  // The attacks of tiles due now land (brawler.js, special): the special's
  // own rules (catalog.js, getSandboxSpecialAttack) give the tiles, their
  // stomps and the damage, on the arena's floor; the stomps are drawn in
  // either scene, and the damage goes to the player as damage to apply, to an
  // NPC as a hit of the attacker. One whose attacker died first does not land.
  landStrikes(context) {
    const damages = [];
    const due = this.strikes.filter((pending) => pending.landsAt <= context.tick);
    this.strikes = this.strikes.filter((pending) => pending.landsAt > context.tick);
    for (const { special, data, attackerId, targetId } of due) {
      const attacker = context.world.getNpc(attackerId);
      if (!attacker || !isActorAlive(attacker)) continue;
      const found = context.world.actors.get(targetId);
      const target = found && isActorAlive(found) ? found : null;
      // A target that died is still aimed at (where it fell), but not hit.
      const landed = getSandboxSpecialAttack(special).land({ data, attacker, target: found ?? null, targetAlive: target !== null, random: this.random, isTileWalkable: isArenaTileWalkable });
      emitColosseumVisual(context.tickEvents, { animations: [], graphics: landed.stomps.map(({ spotAnimId, tile, delayCycles }) => ({ spotAnimId, position: [...tile], delayCycles })) });
      emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics: landed.stomps.map(({ spotAnimId, tile, delayCycles }) => ({ spotAnimId, target: { kind: "tile", position: [...tile] }, height: 0, delayCycles })) });
      if (!target || landed.damage === null) continue;
      if (target.kind === "player") {
        damages.push({ baseDamage: landed.damage, attackType: "typeless", source: this.getNpcDamageSourceLabel(attackerId), playerPosition: [...target.position] });
        continue;
      }
      context.queueNpcHit({
        attackerId, targetId, style: "typeless", attackKind: "typeless", rolledDamage: landed.damage,
        accuracySucceeded: true, impactDelayTicks: 0, sourceDeathPolicy: "cancel-before-impact",
      });
    }
    return damages;
  }
  processPostTick(context, mechanics) {
    const damages = this.host?.processPostTick(context, mechanics) ?? [];
    for (const npc of context.world.getNpcs()) {
      if (isBrawler(npc) && npc.death !== undefined && context.tick >= (npc.deathAnimationTick ?? npc.death.killTick) + deathTicks) context.despawnNpc(npc.id);
    }
    if (this.outcome.phase === "resolving") {
      if (context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    } else if (this.npcIds.length > 0) {
      this.decideOutcome(context);
    }
    return damages;
  }
  // With a host: won when its fight is won and the scenario's NPCs are too
  // (or there were none); the host's outcome times the victory.
  getOutcome() {
    if (!this.host) return this.outcome;
    const hostOutcome = this.host.getOutcome();
    if (hostOutcome.phase === "active") return hostOutcome;
    return this.npcIds.length === 0 || this.outcome.phase !== "active" ? hostOutcome : { phase: "active" };
  }
  // The sandbox's own state (its monsters alive, the free-for-all's winner)
  // is under `sandbox` in every snapshot, the host's included, whose scene
  // reads the rest; the editor names the winner from it (editor.js).
  getSnapshot(input = {}) {
    const world = input.world;
    const ownIds = new Set(this.npcIds);
    const alive = world ? world.getNpcs().filter((npc) => ownIds.has(npc.id) && isActorAlive(npc)).length : 0;
    const sandbox = {
      arena: this.arena.id,
      mode: this.scenario.mode,
      name: this.scenario.meta.name,
      npcsAlive: alive,
      npcsTotal: this.npcIds.length,
      // Set only when the player is left out of a free-for-all.
      winner: this.winner,
      ffaIncludesPlayer: this.scenario.options.ffaIncludesPlayer,
    };
    if (this.host) return { ...this.host.getSnapshot(input), sandbox };
    return { kind: this.kind, state: sandbox, sandbox, visuals: {} };
  }
  getNpcDamageSourceLabel(npcId) {
    const npc = this.ownNpcs.find((candidate) => candidate.id === npcId);
    if (npc) return getSandboxNpcEntry(npc.npc).name;
    return this.host?.getNpcDamageSourceLabel(npcId) ?? "Sandbox";
  }

  // --- what the engine calls if it is there -----------------------------
  getNpcDefinitions() {
    return this.definitions;
  }
  processNpcTick(npc, context, mechanics) {
    if (isBrawler(npc)) return this.definitions.tick(npc, { ...context, random: this.random });
    return this.host?.processNpcTick?.(npc, context, mechanics);
  }

  // --- the rules of the modes ---------------------------------------------
  teamOf(npc) {
    if (this.scenario.mode !== "ffa") return "enemies";
    return npc.team ?? `solo:${npc.id}`;
  }
  playerIsFair() {
    return this.scenario.mode === "versus" || this.scenario.options.ffaIncludesPlayer;
  }
  isEnemy(actor, other) {
    if (other === actor || !isActorAlive(other)) return false;
    if (other.kind === "player") return actor.state.team !== playerTeam && this.playerIsFair();
    if (this.scenario.mode !== "ffa") return false;
    const team = isBrawler(other) ? other.state.team : bossTeam;
    return team !== actor.state.team;
  }
  // The attacker that hit last, if it is an enemy; else the target it has;
  // else the nearest enemy (ties: the player, then the NPCs in the order of
  // the scenario).
  selectTarget(actor, context) {
    const world = context.world;
    const lastAttacker = actor.state.lastAttackerId ? world.actors.get(actor.state.lastAttackerId) : undefined;
    if (lastAttacker && this.isEnemy(actor, lastAttacker)) return lastAttacker;
    const current = actor.combat.targetId ? world.actors.get(actor.combat.targetId) : undefined;
    if (current && this.isEnemy(actor, current)) return current;
    let best = null;
    let bestGap = Infinity;
    for (const candidate of [world.getPlayer(), ...world.getNpcs()]) {
      if (!candidate || !this.isEnemy(actor, candidate)) continue;
      const gap = footprintGap(actor, candidate);
      if (gap < bestGap) {
        best = candidate;
        bestGap = gap;
      }
    }
    return best;
  }
  decideOutcome(context) {
    const player = context.world.getPlayer();
    if (!player?.alive) return;
    // The scenario's NPCs only: a host decides its own fight.
    const teams = new Set(context.world.getNpcs().filter((npc) => isBrawler(npc) && isActorAlive(npc)).map((npc) => npc.state.team));
    let won = false;
    if (this.playerIsFair()) {
      teams.delete(playerTeam);
      won = teams.size === 0;
    } else if (teams.size <= 1) {
      won = true;
      const [team] = teams;
      this.winner = team === undefined ? null : team.startsWith("solo:") ? this.getNpcDamageSourceLabel(team.slice(5)) : team;
    }
    if (won) {
      this.outcome = {
        phase: "resolving",
        decisiveTick: context.tick,
        completionTick: context.tick + ticksFromLastKillToVictory,
        primaryActorId: this.npcIds[this.npcIds.length - 1],
        completionActorIds: [...this.npcIds],
      };
    }
  }
}

const describeArena = (arena) => ({
  mapSquare: arena.mapSquare,
  ...(arena.mapSquareOffsets ? { mapSquareOffsets: arena.mapSquareOffsets } : {}),
  playerStart: [...arena.playerStart],
  collision: arena.collision,
});
const emptyControls = { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] };
const [firstArena, ...otherArenas] = sandboxArenas;

/**
 * The sandbox's definition, given the other encounters' (registry.js): a
 * host is made by its own definition's factory, and an arena with a host
 * offers the host's controls (toggles, debug actions, boss hitpoints).
 */
export function buildSandboxDefinition(otherDefinitions) {
  const definitionOf = (kind) => otherDefinitions.find((definition) => definition.kind === kind || definition.variantFactories?.[kind]);
  const createHost = (kind) => {
    const definition = definitionOf(kind);
    return (definition.variantFactories?.[kind] ?? definition.factory)(undefined);
  };
  const controlsOf = (arena) => {
    const definition = arena.hostKind && definitionOf(arena.hostKind);
    return (definition && (definition.variantControls?.[arena.hostKind] ?? definition.controls)) || emptyControls;
  };
  const sandboxDefinition = {
  kind: sandboxKind,
  factory: (options) => new SandboxEncounter(firstArena.id, options, createHost),
  descriptor: {
    kind: sandboxKind,
    displayName: "Sandbox",
    description: `Place monsters of the other fights in an arena of your choice and fight them, or watch them fight each other. ${sandboxNpcCatalog.length} monsters, ${sandboxArenas.length} arenas.`,
    ...describeArena(firstArena),
    loadsMapLocs: true,
    isWorkInProgress: true,
    // The arenas are chosen in the sandbox's own editor, not in the menus:
    // `routeVariants` gives each its route (/sandbox/<arena>) and its
    // presets, and nothing else of the application lists them.
    routeVariants: sandboxArenas.map((arena) => ({
      id: arena.id,
      encounterKind: sandboxVariantKind(arena.id),
      name: arena.name,
      subtitle: "Arena",
      available: true,
      presetsKey: sandboxKind,
    })),
    victory: { eyebrow: "Sandbox", title: "VICTORY", narrative: "SCENARIO CLEARED", accent: "gold" },
  },
  controls: controlsOf(firstArena),
  variantFactories: Object.fromEntries(otherArenas.map((arena) => [sandboxVariantKind(arena.id), (options) => new SandboxEncounter(arena.id, options, createHost)])),
  variantControls: Object.fromEntries(otherArenas.map((arena) => [sandboxVariantKind(arena.id), controlsOf(arena)])),
  };
  // Each arena's own map square and collision (registry.js, variantDescriptors);
  // its kind stays the sandbox's, as the Doom's deeper room's does.
  sandboxDefinition.variantDescriptors = Object.fromEntries(
    otherArenas.map((arena) => [sandboxVariantKind(arena.id), { ...sandboxDefinition.descriptor, ...describeArena(arena) }]),
  );
  return sandboxDefinition;
}
