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
// Seeds: `encounterSeed`, and the scenario itself, so that a replay or a
// restart with the same seeds plays the same scenario whatever the editor
// holds by then.
import { getMonsterFormulaStats, getMonsterHitpoints } from "../../engine/monsterStats.js";
import { createSeededRandom } from "../../engine/random.js";
import { isActorAlive } from "../../engine/npcState.js";
import { NpcDefinitionRegistry } from "../shared/npcDefinitions.js";
import { brawlerNpcDefinition, getApproachRange } from "./brawler.js";
import { getSandboxNpcEntry, sandboxNpcCatalog } from "./catalog.js";
import { getSandboxArena, sandboxArenas, sandboxKind, sandboxVariantKind } from "./arenas.js";
import { createEmptyScenario, normalizeScenario, playerTeam } from "./scenario.js";
import { getActiveScenario } from "./activeScenario.js";

// inferred: a body stays four ticks after the kill (the Colosseum's monsters stay three or four).
const deathTicks = 4;
// inferred: the first attack two ticks after the start, as the fixture's.
const firstActionTick = 2;
const ticksFromLastKillToVictory = 3;

const footprintGap = (a, b) => {
  const dx = Math.max(0, b.position[0] - (a.position[0] + a.size - 1), a.position[0] - (b.position[0] + b.size - 1));
  const dy = Math.max(0, b.position[1] - (a.position[1] + a.size - 1), a.position[1] - (b.position[1] + b.size - 1));
  return Math.max(dx, dy);
};

export class SandboxEncounter {
  constructor(arenaId, options) {
    this.arena = getSandboxArena(arenaId);
    this.kind = sandboxVariantKind(this.arena.id);
    // A scenario handed to the factory (the harness, a test) wins over the editor's.
    this.givenScenario = options?.scenario ? normalizeScenario(options.scenario) : null;
    this.definitions = new NpcDefinitionRegistry([
      brawlerNpcDefinition.register({
        selectTarget: (actor, context) => this.selectTarget(actor, context),
        entryOf: (actor) => getSandboxNpcEntry(actor.state.entryId),
      }),
    ]);
    this.reset();
  }

  // --- what the engine always calls -------------------------------------
  reset(seeds) {
    this.seed = seeds?.encounterSeed ?? Math.floor(Math.random() * 2 ** 32);
    this.random = createSeededRandom(this.seed);
    this.scenario = seeds?.scenario ? normalizeScenario(seeds.scenario) : this.pickScenario();
    this.outcome = { phase: "active" };
    this.winner = null;
    this.npcIds = [];
  }
  // The editor's scenario when it is for this arena; otherwise an empty one,
  // and the editor offers to go to the arena of its own.
  pickScenario() {
    const scenario = this.givenScenario ?? getActiveScenario();
    if (scenario && scenario.arena === this.arena.id) return scenario;
    return { ...createEmptyScenario(this.arena.id), meta: { name: `Empty: ${this.arena.name}`, author: "", description: "" } };
  }
  getSeeds() {
    return { encounterSeed: this.seed, scenario: structuredClone(this.scenario) };
  }
  getDefaultMechanicsConfig() {
    return {};
  }
  getDefaultPlayerStart() {
    return [...(this.scenario.options.playerStart ?? this.arena.playerStart)];
  }
  getIntroConfig() {
    return null;
  }
  getArenaConfig() {
    return { bounds: null, collisionMap: null, walkableTiles: null };
  }
  createNpcs() {
    this.npcIds = this.scenario.npcs.map((npc) => npc.id);
    return this.scenario.npcs.map((npc) => this.createNpcActor(npc));
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
  resolveHazards() {
    return [];
  }
  processPostTick(context) {
    for (const npc of context.world.getNpcs()) {
      if (npc.death !== undefined && context.tick >= (npc.deathAnimationTick ?? npc.death.killTick) + deathTicks) context.despawnNpc(npc.id);
    }
    if (this.outcome.phase === "resolving") {
      if (context.tick >= this.outcome.completionTick) this.outcome = { ...this.outcome, phase: "victory" };
    } else if (this.npcIds.length > 0) {
      this.decideOutcome(context);
    }
    return [];
  }
  getOutcome() {
    return this.outcome;
  }
  getSnapshot({ world } = {}) {
    const alive = world ? world.getNpcs().filter(isActorAlive).length : 0;
    return {
      kind: this.kind,
      state: {
        arena: this.arena.id,
        mode: this.scenario.mode,
        name: this.scenario.meta.name,
        npcsAlive: alive,
        npcsTotal: this.npcIds.length,
        winner: this.winner,
      },
      visuals: {},
    };
  }
  getNpcDamageSourceLabel(npcId) {
    const npc = this.scenario.npcs.find((candidate) => candidate.id === npcId);
    return npc ? getSandboxNpcEntry(npc.npc).name : "Sandbox";
  }

  // --- what the engine calls if it is there -----------------------------
  getNpcDefinitions() {
    return this.definitions;
  }
  processNpcTick(npc, context) {
    return this.definitions.tick(npc, { ...context, random: this.random });
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
    return other.state?.team !== undefined && other.state.team !== actor.state.team;
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
    const teams = new Set(context.world.getNpcs().filter(isActorAlive).map((npc) => npc.state.team));
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
const controls = { defaultMechanicsConfig: {}, mechanicsToggles: [], debugActions: [] };
const [firstArena, ...otherArenas] = sandboxArenas;

export const sandboxDefinition = {
  kind: sandboxKind,
  factory: (options) => new SandboxEncounter(firstArena.id, options),
  descriptor: {
    kind: sandboxKind,
    displayName: "Sandbox",
    description: `Place monsters of the other fights in an arena of your choice and fight them, or watch them fight each other. ${sandboxNpcCatalog.length} monsters, ${sandboxArenas.length} arenas.`,
    ...describeArena(firstArena),
    loadsMapLocs: true,
    isWorkInProgress: true,
    variants: sandboxArenas.map((arena) => ({
      id: arena.id,
      encounterKind: sandboxVariantKind(arena.id),
      name: arena.name,
      subtitle: "Arena",
      available: true,
      presetsKey: sandboxKind,
    })),
    variantLabel: "Arena",
    victory: { eyebrow: "Sandbox", title: "VICTORY", narrative: "SCENARIO CLEARED", accent: "gold" },
  },
  controls,
  variantFactories: Object.fromEntries(otherArenas.map((arena) => [sandboxVariantKind(arena.id), (options) => new SandboxEncounter(arena.id, options)])),
  variantControls: Object.fromEntries(otherArenas.map((arena) => [sandboxVariantKind(arena.id), controls])),
};
// Each arena's own map square and collision (registry.js, variantDescriptors);
// its kind stays the sandbox's, as the Doom's deeper room's does.
sandboxDefinition.variantDescriptors = Object.fromEntries(
  otherArenas.map((arena) => [sandboxVariantKind(arena.id), { ...sandboxDefinition.descriptor, ...describeArena(arena) }]),
);
