import { isArenaTileWalkable, isInsideArenaBounds } from "../../engine/arena.js";
import { createSeededRandom, hashInteger } from "../../engine/random.js";
import { startScriptedNpcDeath } from "../../engine/npcState.js";
import { createRandomDecisions } from "../../engine/decisions.js";
import { emitInfernoVisual } from "./events.js";
import { zukMagerNpcTypeId, zukRangerNpcTypeId, zukHealerNpcTypeId, zukGlyphIntroMoveStartTickOffset, zukGlyphIntroMoveEndTickOffset, zukGlyphIntroPosition } from "./constants.js";
import { chooseDistinctValues } from "./monsterHelpers.js";
import { createInfernoActor } from "./actors.js";
import { buildJadAttackVisual, createJadHealer, jadNpcDefinition, removeJadIfDue, createJad } from "./jad.js";
import { buildMagerRangerAttackVisual, createMager } from "./mager.js";
import { buildZukHealVisual, zukHealerNpcDefinition, rollZukSparkVolley, ZukSparks } from "./zukHealers.js";
import { createRanger } from "./ranger.js";
import { planZukShieldMove, createZukShield, zukNpcDefinition, zukJadHpThreshold, zukHealersHpThreshold, zukCastIntervalTicks } from "./zuk.js";
import { ZukSetClock } from "./zukSetClock.js";
var zukShieldPatrol = {
  endpoints: [
    [17, 48],
    [43, 48],
  ],
  endpointPauseTicks: 4,
};
var zukShieldSpawnPoint = {
  position: [30, 48],
};
var zukActorId = "zuk";
var zukSpawnPosition = [28, 52];
var zukShieldActorId = "zuk_shield";
var zukJadHealerSpawnMinOffsetX = 0;
var zukJadHealerSpawnMaxOffsetX = 2;
var zukJadHealerSpawnMinOffsetY = 5;
var zukJadHealerSpawnMaxOffsetY = 8;
var zukSetSpawns = {
  mager: {
    position: [26, 39],
    initialDelayTicks: 6,
    attackRange: 15,
  },
  ranger: {
    position: [35, 39],
    initialDelayTicks: 8,
  },
};
var zukMinionRemovalDelayTicks = {
  [zukRangerNpcTypeId]: 2,
  [zukMagerNpcTypeId]: 2,
  [zukHealerNpcTypeId]: 2,
};
function createZukActor(bossSetup) {
  const baseActor = createInfernoActor("zuk", bossSetup.id, bossSetup.position);
  baseActor.spawnTick = bossSetup.spawnTick;
  return zukNpcDefinition.createActor(
    {
      ...baseActor,
      lockedFacing: 0,
    },
    {
      lastCastTick: null,
      enragedAt: null,
      jadSpawned: false,
      healersSpawned: false,
      firstCastTick: bossSetup.spawnTick + bossSetup.openingDelayTicks,
      glyphId: bossSetup.glyphId,
    },
  );
}
function createZukHealerActor(healerSetup) {
  const baseActor = createInfernoActor("healer", healerSetup.id, healerSetup.position);
  baseActor.spawnTick = healerSetup.spawnTick;
  baseActor.combat.attackSpeed = 3;
  baseActor.combat.retaliation = {
    mode: "one-tick",
    pending: [],
    lastIncomingAttackTick: null,
  };
  return zukHealerNpcDefinition.createActor(baseActor, {
    supportTargetId: healerSetup.supportTargetId,
    firstEngagementTick: null,
    pendingHeals: [],
  });
}
// Zuk's first cast comes 13 ticks after his spawn tick (the shield's, when
// the cast clock is set again).
var zukOpeningCastDelayTicks = 13;
function getZukFirstCastTick(glyphSpawnTick, openingDelayTicks, tick) {
  const openingCastTick = glyphSpawnTick + openingDelayTicks;
  if (tick < openingCastTick) {
    return openingCastTick;
  } else {
    return openingCastTick + (Math.floor((tick - openingCastTick) / zukCastIntervalTicks) + 1) * zukCastIntervalTicks;
  }
}
var ZukFight = class {
  // The tick the fight counts from: the offsets of the wave-69 intro
  // (constants.js) are relative to it, Zuk's `spawnTick` is set to it, and the
  // set clock runs only after it.
  controlTick;
  attacksEnabled = true;
  random;
  jadHealerDecisions;
  nextActorId = 0;
  outcome = {
    phase: "active",
  };
  boss = null;
  glyph = null;
  initialGlyphTargetEndpoint;
  seed;
  sparks = new ZukSparks();
  sets = new ZukSetClock();
  constructor(seed, randomSeed, controlTick, shieldStart) {
    this.seed = seed;
    this.random = createSeededRandom(randomSeed);
    this.jadHealerDecisions = createRandomDecisions(createSeededRandom(hashInteger((randomSeed ^ 1246252114) >>> 0)));
    this.controlTick = controlTick;
    this.initialGlyphTargetEndpoint = this.getGlyphTargetEndpoint(shieldStart);
  }
  createNpcs() {
    const hasIntro = this.controlTick > 0;
    this.boss = createZukActor({
      id: zukActorId,
      position: [...zukSpawnPosition],
      spawnTick: this.controlTick,
      openingDelayTicks: zukOpeningCastDelayTicks,
      glyphId: zukShieldActorId,
    });
    this.glyph = createZukShield({
      id: zukShieldActorId,
      position: hasIntro ? [...zukGlyphIntroPosition] : zukShieldSpawnPoint.position,
      targetEndpoint: this.initialGlyphTargetEndpoint,
      spawnTick: this.controlTick,
    });
    return [this.glyph, this.boss];
  }
  setShieldStart(shieldStart) {
    this.initialGlyphTargetEndpoint = this.getGlyphTargetEndpoint(shieldStart);
    if (this.glyph) {
      this.glyph.state.targetEndpoint = this.initialGlyphTargetEndpoint;
    }
  }
  get bossAndGlyphIds() {
    return [this.glyph?.id, this.boss?.id].filter((npcId) => npcId !== undefined);
  }
  getOutcome() {
    return this.outcome;
  }
  resolveHazards(context) {
    return this.sparks.resolve(context);
  }
  prepareNpcBand(context, mechanics) {
    if (
      this.outcome.phase === "resolving" &&
      context.tick >= this.outcome.completionTick
    ) {
      this.outcome = {
        ...this.outcome,
        phase: "victory",
      };
    }
    this.attacksEnabled = mechanics.zukAttacks !== false;
  }
  processPostTick(context, mechanics) {
    if (!(context.tick <= this.controlTick)) {
      if (this.boss?.alive) {
        if (
          this.sets.advance(
            this.boss.vitals.hp,
            this.boss.state.jadSpawned,
            mechanics.zukSets !== false,
          )
        ) {
          this.spawnSet(context);
        }
      } else {
        this.sets.stop();
      }
    }
  }
  removeNpcIfDue(npc, context) {
    if (removeJadIfDue(npc, context)) {
      return;
    }
    const despawnDelayTicks = zukMinionRemovalDelayTicks[npc.npcTypeId];
    if (
      despawnDelayTicks !== undefined &&
      npc.death?.status === "started" &&
      npc.deathAnimationTick !== undefined &&
      context.tick >= npc.deathAnimationTick + despawnDelayTicks
    ) {
      context.despawnNpc(npc.id);
    }
  }
  moveNpc(npc, context, definitions) {
    if (!this.boss?.alive) {
      return [];
    }
    const ticksSinceControl = context.tick - this.controlTick;
    if (npc === this.glyph && ticksSinceControl >= zukGlyphIntroMoveStartTickOffset && ticksSinceControl <= zukGlyphIntroMoveEndTickOffset) {
      return [
        {
          npcId: npc.id,
          path: [[npc.position[0], npc.position[1] - 1]],
        },
      ];
    } else {
      return definitions.move(npc, this.buildNpcDefinitionContext(context));
    }
  }
  buildNpcDefinitionContext(context) {
    return {
      ...context,
      random: this.random,
    };
  }
  getZukSnapshot(request) {
    const liveGlyph =
      this.boss?.alive === true &&
      request.world.getNpc(this.boss.id) === this.boss &&
      this.glyph?.alive &&
      request.world.getNpc(this.glyph.id) === this.glyph
        ? this.glyph
        : null;
    const nextGlyphTile = liveGlyph && planZukShieldMove(liveGlyph, zukShieldPatrol, request.tick + 1)?.movement.path.at(-1);
    return {
      ...this.sets.getSnapshot(
        request.mechanics.zukSets !== false && this.boss !== null && this.boss.alive,
      ),
      enraged: this.boss !== null && this.boss.state.enragedAt !== null,
      jadSpawned: this.boss?.state.jadSpawned ?? false,
      shieldX: this.glyph?.position[0] ?? zukShieldSpawnPoint.position[0],
      shieldMovingEast:
        (this.glyph?.state.targetEndpoint ??
          this.initialGlyphTargetEndpoint) === 1,
      shieldNextX: liveGlyph === null ? null : (nextGlyphTile?.[0] ?? liveGlyph.position[0]),
    };
  }
  isBossAliveInWorld(context) {
    return this.boss?.alive === true && context.world.getNpc(this.boss.id) === this.boss;
  }
  syncBossHp(bossHp, context) {
    const boss = this.boss;
    if (boss && this.isBossAliveInWorld(context)) {
      boss.state.jadSpawned = bossHp < zukJadHpThreshold;
      boss.state.healersSpawned = bossHp < zukHealersHpThreshold;
    }
  }
  enterBossHpPhase(bossHp, context) {
    const boss = this.boss;
    const player = context.world.getPlayer();
    if (boss?.alive && player && !(bossHp <= 0)) {
      for (const npc of context.world.getNpcs()) {
        context.world.removePendingHitsFromSource(npc.id);
      }
      this.despawnMinions(context);
      this.sparks.clear();
      if (this.glyph?.alive && context.world.getNpc(this.glyph.id)) {
        this.glyph.vitals.hp = this.glyph.vitals.maxHp;
      } else {
        if (this.glyph) {
          context.despawnNpc(this.glyph.id);
        }
        this.glyph = createZukShield({
          id: this.allocateActorId("shield"),
          ...zukShieldSpawnPoint,
          targetEndpoint: this.initialGlyphTargetEndpoint,
          spawnTick: context.tick,
        });
        context.spawnNpc(this.glyph);
      }
      this.syncCastClock(boss, context);
      boss.state.glyphId = this.glyph.id;
      boss.combat.targetId = null;
      this.syncBossHp(bossHp, context);
      boss.state.enragedAt = null;
      this.sets.reset();
      this.sets.advance(bossHp, boss.state.jadSpawned, false);
    }
  }
  onNpcDefeated(defeat, context, completionOwnership, definitions) {
    if (defeat.npcId !== zukActorId) {
      return;
    }
    this.sparks.clear();
    this.sets.stop();
    const completionActorIds = [zukActorId];
    for (const npc of context.world.getNpcs()) {
      if (npc.role === "minion" && npc.alive) {
        npc.vitals.hp = 0;
        startScriptedNpcDeath(npc, defeat.tick);
        definitions.notifyDeathStarted(npc, this.buildNpcDefinitionContext(context));
        context.world.removePendingHitsFromSource(npc.id);
        context.tickEvents.emit({
          type: "actor_died",
          actorId: npc.id,
        });
        definitions.notifyDefeated(
          npc,
          {
            npcId: npc.id,
            tick: defeat.tick,
          },
          completionOwnership,
          this.buildNpcDefinitionContext(context),
        );
        completionActorIds.push(npc.id);
      }
    }
    if (completionOwnership === "encounter-owned") {
      this.outcome = {
        phase: "resolving",
        decisiveTick: defeat.tick,
        completionTick: defeat.tick + 6,
        primaryActorId: zukActorId,
        completionActorIds: completionActorIds,
      };
    }
  }
  executeCommand(command, context) {
    const boss = this.boss;
    if (!boss?.alive) {
      return {};
    }
    let visual;
    switch (command.type) {
      case "emit-spark-volley":
        visual = this.sparks.emit(command, context.tick);
        break;
      case "spawn-set":
        this.spawnSet(context);
        break;
      case "replace-set":
        this.despawnMinions(context, [7703, 7702]);
        this.spawnSet(context);
        return {
          gameEvents: [
            {
              type: "inferno_clear_minions",
              npcTypeIds: [7703, 7702],
            },
          ],
        };
      case "spawn-mager":
        this.spawnSetMember("mager", context);
        break;
      case "spawn-ranger":
        this.spawnSetMember("ranger", context);
        break;
      case "spawn-jad":
        this.spawnJad(boss.id, context);
        break;
      case "spawn-healers":
        this.spawnHealers(boss.id, context);
        break;
      case "spawn-jad-healers": {
        const jad =
          context.world.getNpcs().find((npc) => jadNpcDefinition.isActor(npc) && npc.alive) ??
          this.spawnJad(boss.id, context);
        this.spawnJadHealers(jad.id, context);
        break;
      }
      case "respawn-glyph": {
        const previousGlyphId = this.glyph?.id;
        if (this.glyph) {
          context.despawnNpc(this.glyph.id);
        }
        this.glyph = createZukShield({
          id: this.allocateActorId("shield"),
          ...zukShieldSpawnPoint,
          targetEndpoint: this.initialGlyphTargetEndpoint,
          spawnTick: context.tick,
        });
        boss.state.glyphId = this.glyph.id;
        if (boss.state.enragedAt === null) {
          this.syncCastClock(boss, context);
        }
        context.spawnNpc(this.glyph);
        for (const npc of context.world.getNpcs()) {
          if (npc.combat.targetId === previousGlyphId) {
            npc.combat.targetId = this.glyph.id;
          }
        }
        break;
      }
      case "clear-spawns":
        this.despawnMinions(context);
        return {
          gameEvents: [
            {
              type: "inferno_clear_minions",
              npcTypeIds: [7703, 7702, 7704, 7705, 7708],
            },
          ],
        };
      case "demonstrate-jad": {
        const player = context.world.getPlayer();
        if (player) {
          visual = buildJadAttackVisual(this.spawnDemonstrationActor("jad", [30, 35], context), player, command.style);
        }
        break;
      }
      case "demonstrate-set":
        if (this.glyph?.alive) {
          visual = buildMagerRangerAttackVisual(
            [this.spawnDemonstrationActor("mager", [26, 39], context), this.spawnDemonstrationActor("ranger", [35, 39], context)],
            this.glyph,
          );
        }
        break;
      case "demonstrate-heal":
        visual = buildZukHealVisual(
          [22, 26, 36, 40].map((x) => this.spawnDemonstrationActor("healer", [x, 51], context)),
          boss,
        );
        break;
      case "inspect-ranged-graphic":
        visual = {
          animations: [],
          projectiles: [],
          graphics: [
            {
              spotAnimId: 451,
              target: {
                kind: "tile",
                position: [...context.playerPos],
              },
              height: 92,
              delayCycles: 0,
            },
          ],
        };
        break;
      default:
        return throwUnknownZukCommand(command);
    }
    if (visual) {
      return {
        gameEvents: [
          {
            type: "inferno_visual",
            ...structuredClone(visual),
          },
        ],
      };
    } else {
      return {};
    }
  }
  castSparks(healer, target, context) {
    const visual = this.sparks.emit(
      {
        sparks: rollZukSparkVolley({
          source: healer.position,
          player: target.position,
          random: context.random,
        }),
      },
      context.tick,
    );
    if (visual) {
      emitInfernoVisual(context.tickEvents, visual);
    }
  }
  spawnJad(bossId, context) {
    const boss = context.world.getNpc(bossId);
    const bossState = boss && zukNpcDefinition.getState(boss);
    if (!bossState) {
      throw new TypeError(`Missing Zuk spawn source ${bossId}`);
    }
    const jad = createJad({
      id: this.allocateActorId("jad"),
      position: [30, 35],
      spawnTick: context.tick,
      targetId: bossState.glyphId,
    });
    context.spawnNpc(jad);
    return jad;
  }
  spawnHealers(bossId, context) {
    return [22, 26, 36, 40].map((x) => {
      const healer = createZukHealerActor({
        id: this.allocateActorId("healer"),
        position: [x, 51],
        spawnTick: context.tick,
        supportTargetId: bossId,
      });
      context.spawnNpc(healer);
      return healer;
    });
  }
  spawnJadHealers(jadId, context) {
    const jad = context.world.getNpc(jadId);
    if (!jad) {
      return [];
    }
    const [jadX, jadY] = jad.position;
    const playerTile = context.world.getPlayer()?.position;
    const candidateTiles = [];
    for (let x = jadX + zukJadHealerSpawnMinOffsetX; x <= jadX + zukJadHealerSpawnMaxOffsetX; x++) {
      for (let y = jadY + zukJadHealerSpawnMinOffsetY; y <= jadY + zukJadHealerSpawnMaxOffsetY; y++) {
        if (!playerTile || playerTile[0] !== x || playerTile[1] !== y) {
          candidateTiles.push([x, y]);
        }
      }
    }
    const walkableTiles = candidateTiles.filter(([x, y]) => isInsideArenaBounds(x, y) && isArenaTileWalkable(x, y));
    const jadHealers = chooseDistinctValues(
      this.jadHealerDecisions,
      {
        site: "zuk.jad_healer.tile",
        tick: context.tick,
        actorId: jadId,
      },
      walkableTiles.length >= 3 ? walkableTiles : candidateTiles,
      3,
    ).map((spawnTile) => {
      const jadHealer = createJadHealer({
        id: this.allocateActorId("jad_healer"),
        position: spawnTile,
        spawnTick: context.tick,
        parentId: jadId,
      });
      context.spawnNpc(jadHealer);
      return jadHealer;
    });
    const jadState = jadNpcDefinition.getState(jad);
    if (jadState) {
      jadState.healersSpawned = true;
    }
    return jadHealers;
  }
  getGlyphTargetEndpoint(shieldStart) {
    if (shieldStart === "left") {
      return 0;
    } else if (shieldStart === "right" || hashInteger(this.seed) & 1) {
      return 1;
    } else {
      return 0;
    }
  }
  syncCastClock(boss, context) {
    const glyph = this.glyph;
    if (!glyph) {
      throw new TypeError("Cannot sync Zuk cast clock without a shield");
    }
    if (glyph.spawnTick === undefined) {
      throw new TypeError("Shield is missing its spawn tick");
    }
    boss.state.lastCastTick = null;
    boss.state.firstCastTick = getZukFirstCastTick(glyph.spawnTick, zukOpeningCastDelayTicks, context.tick);
  }
  allocateActorId(kind) {
    return `zuk_${kind}_${this.nextActorId++}`;
  }
  spawnDemonstrationActor(kind, spawnTile, context) {
    const npc = createInfernoActor(kind, this.allocateActorId(kind), spawnTile);
    npc.spawnTick = context.tick;
    context.spawnNpc(npc);
    return npc;
  }
  spawnSet(context) {
    return [this.spawnSetMember("mager", context), this.spawnSetMember("ranger", context)];
  }
  spawnSetMember(kind, context) {
    const spawnSetup = {
      id: this.allocateActorId(kind),
      position: [...zukSetSpawns[kind].position],
      spawnTick: context.tick,
      initialTargetId: this.glyph?.id ?? null,
    };
    let minion;
    switch (kind) {
      case "mager":
        minion = createMager({
          ...zukSetSpawns.mager,
          ...spawnSetup,
        });
        break;
      case "ranger":
        minion = createRanger({
          variant: "zuk",
          ...zukSetSpawns.ranger,
          ...spawnSetup,
        });
        break;
      default:
        return throwUnknownZukCommand(kind);
    }
    context.spawnNpc(minion);
    return minion;
  }
  despawnMinions(context, npcTypeIds) {
    for (const npc of context.world.getNpcs()) {
      if (npc.role === "minion" && (!npcTypeIds || !!npcTypeIds.includes(npc.npcTypeId))) {
        context.despawnNpc(npc.id);
      }
    }
  }
};
function throwUnknownZukCommand(command) {
  throw new TypeError(`Unknown Zuk command: ${JSON.stringify(command)}`);
}
export { zukShieldPatrol, ZukFight };
