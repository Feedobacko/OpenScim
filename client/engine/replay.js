import { logger } from "../util/logger.js";
import { ReplaySafetyError, snapshotWorkLimit, snapshotNpcLimit } from "./replayLimits.js";
import { getArenaDefaultWalkable, setArenaConfig, getCurrentArenaConfig } from "./arena.js";
import { assertBootstrapWithinWorkLimits, parseEngineBootstrap } from "./bootstrap.js";
import { buildSimulationEngine } from "./createSimulationEngine.js";
var defaultReplayTakeoverLimits = {
  maxActions: 16384,
  maxNpcs: snapshotNpcLimit * 2,
  maxSpawns: snapshotWorkLimit,
  maxNpcTicks: snapshotWorkLimit * 2,
  maxTicks: 65536,
};
var ReplayTakeoverWorkTracker = class {
  limits;
  frameIndex = 0;
  actions = 0;
  spawns = 0;
  npcTicks = 0;
  ticks = 0;
  inTick = false;
  failure;
  constructor(limitOverrides = {}) {
    this.limits = {
      ...defaultReplayTakeoverLimits,
      ...limitOverrides,
    };
    for (const limit of Object.values(this.limits)) {
      if (!Number.isSafeInteger(limit) || limit < 0) {
        throw new ReplaySafetyError("takeover-work-limit");
      }
    }
  }
  check(actual, limit) {
    if (this.failure) {
      throw this.failure;
    }
    if (!Number.isSafeInteger(actual) || actual > limit || actual < 0) {
      this.failure = new ReplaySafetyError("takeover-work-limit", {
        ...(Number.isSafeInteger(actual)
          ? {
              actual: actual,
            }
          : {}),
        limit: limit,
        frameIndex: this.frameIndex,
      });
      throw this.failure;
    }
  }
  checkReplayFrames(frames, targetFrameIndex) {
    this.check(targetFrameIndex, Math.min(frames.length - 1, this.limits.maxTicks));
    let actionCount = 0;
    for (let frameIndex = 1; frameIndex <= targetFrameIndex; frameIndex++) {
      this.frameIndex = frameIndex;
      actionCount += frames[frameIndex].actions.length;
      this.check(actionCount, this.limits.maxActions);
    }
    this.frameIndex = 0;
  }
  recordAction() {
    this.check(this.actions + 1, this.limits.maxActions);
    this.actions++;
  }
  recordNpcSpawns(npcCount, spawnCount) {
    this.check(npcCount + spawnCount, this.limits.maxNpcs);
    this.check(this.spawns + spawnCount, this.limits.maxSpawns);
    if (this.inTick) {
      this.check(this.npcTicks + spawnCount, this.limits.maxNpcTicks);
    }
    this.spawns += spawnCount;
    if (this.inTick) {
      this.npcTicks += spawnCount;
    }
  }
  beginTick(npcCount) {
    this.check(this.ticks + 1, this.limits.maxTicks);
    this.check(this.npcTicks + npcCount, this.limits.maxNpcTicks);
    this.ticks++;
    this.npcTicks += npcCount;
    this.inTick = true;
  }
  endTick() {
    this.inTick = false;
  }
  getStats() {
    return {
      actions: this.actions,
      spawns: this.spawns,
      npcTicks: this.npcTicks,
      ticks: this.ticks,
    };
  }
};
function buildEngineFromBootstrap(recording, bootstrap, objTypeLoader, replayTakeoverWork) {
  const engine = buildSimulationEngine(
    {
      encounterConfig: {
        kind: recording.encounter.kind,
        ...(bootstrap.encounterConfig === undefined
          ? {}
          : {
              options: bootstrap.encounterConfig,
            }),
        mechanics: bootstrap.mechanicsConfig,
      },
      objTypeLoader: objTypeLoader,
      enableIntro: bootstrap.enableIntro,
      stats: bootstrap.baseStats,
      ...(bootstrap.startHp === undefined
        ? {}
        : {
            startHp: bootstrap.startHp,
          }),
      inventory: bootstrap.inventory,
      equipment: bootstrap.equipment,
      combatSupplies: bootstrap.combatSupplies,
      attackStylePerCategory: bootstrap.attackStylePerCategory,
      startPosition: bootstrap.startPosition,
      combatSeed: bootstrap.combatSeed,
    },
    recording.encounter.seeds,
    replayTakeoverWork,
  );
  engine.setCompletionOwnership(recording.completionOwnership);
  if (bootstrap.prepotApplied) {
    engine.applyPrepot();
  }
  return engine;
}
function rebuildRecordedEngine(recording, objTypeLoader, replayTakeoverWork) {
  assertBootstrapWithinWorkLimits(recording.bootstrap);
  const bootstrap = parseEngineBootstrap(recording);
  if (!bootstrap) {
    return null;
  }
  try {
    return buildEngineFromBootstrap(recording, bootstrap, objTypeLoader, replayTakeoverWork);
  } catch (error) {
    if (error instanceof ReplaySafetyError) {
      throw error;
    }
    logger.warn("Replay", "Take Over could not rebuild the recorded engine", {
      error: error,
    });
    return null;
  }
}
function rebuildEngineAtReplayFrame(recording, frames, targetFrameIndex, objTypeLoader, replayTakeoverWork = new ReplayTakeoverWorkTracker()) {
  replayTakeoverWork.checkReplayFrames(frames, targetFrameIndex);
  assertBootstrapWithinWorkLimits(recording.bootstrap);
  const savedArenaConfig = getCurrentArenaConfig();
  const savedArenaDefaultWalkable = getArenaDefaultWalkable();
  try {
    const engine = rebuildRecordedEngine(recording, objTypeLoader, replayTakeoverWork);
    if (!engine) {
      return null;
    }
    if (engine.getState().introActive) {
      engine.completeIntro();
    }
    for (let frameIndex = 1; frameIndex <= targetFrameIndex; frameIndex++) {
      replayTakeoverWork.frameIndex = frameIndex;
      const frame = frames[frameIndex];
      if (frame.state.mechanicsConfig) {
        engine.setMechanicsConfig(frame.state.mechanicsConfig);
      }
      for (const action of frame.actions) {
        engine.injectAction(action);
      }
      engine.advanceTick(frame.input);
    }
    let maxEventId = 0;
    for (let frameIndex = 0; frameIndex <= targetFrameIndex; frameIndex++) {
      for (const event of frames[frameIndex].events) {
        maxEventId = Math.max(maxEventId, event.eventId);
      }
    }
    engine.advanceNextEventIdPast(maxEventId);
    engine.captureRunStartMechanics();
    return engine;
  } finally {
    setArenaConfig(savedArenaConfig, savedArenaDefaultWalkable);
  }
}
export { rebuildEngineAtReplayFrame };
