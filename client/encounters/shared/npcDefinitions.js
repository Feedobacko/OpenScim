import { markNpcDeathAnimationNotified } from "../../engine/npcState.js";
import { getNpcPursuitMoves } from "./npcMovement.js";
function defineNpc(options) {
  const identity = {
    id: options.id,
  };
  const isActor = (actor) => actor.definition === identity && actor.state !== undefined;
  const spawnUntargetableTicks = options.spawnUntargetableTicks ?? 0;
  if (!Number.isInteger(spawnUntargetableTicks) || spawnUntargetableTicks < 0) {
    throw new RangeError(
      `NPC definition '${options.id}' has invalid spawnUntargetableTicks ${spawnUntargetableTicks}`,
    );
  }
  const buildUntargetableWindow = (baseActor) => {
    if (spawnUntargetableTicks === 0) {
      return {};
    }
    if (baseActor.spawnTick === undefined) {
      throw new TypeError(
        `NPC definition '${options.id}' needs a spawnTick to time its untargetable window`,
      );
    }
    return {
      targetableFromTick: baseActor.spawnTick + spawnUntargetableTicks,
    };
  };
  return {
    id: options.id,
    identity: identity,
    createActor: (baseActor, state) => ({
      ...baseActor,
      ...buildUntargetableWindow(baseActor),
      ...(options.deathPolicy === undefined
        ? {}
        : {
            deathPolicy: options.deathPolicy,
          }),
      definition: identity,
      state: state,
    }),
    getState: (actor) => (isActor(actor) ? actor.state : null),
    isActor: isActor,
    register: (config) => {
      const buildHook = (actor, context) =>
        isActor(actor)
          ? {
              actor: actor,
              config: config,
              context: context,
            }
          : null;
      return {
        definitionId: options.id,
        isActor: isActor,
        notifyDamageResolved: (actor, damage, context) => {
          const hook = buildHook(actor, context);
          if (!hook) {
            return false;
          }
          options.onDamageResolved?.({
            ...hook,
            damage: damage,
          });
          return true;
        },
        notifyDefeated: (actor, defeat, ownership, context) => {
          const hook = buildHook(actor, context);
          if (!hook) {
            return false;
          }
          options.onDefeated?.({
            ...hook,
            defeat: defeat,
            ownership: ownership,
          });
          return true;
        },
        notifyDespawn: (actor, context) => {
          const hook = buildHook(actor, context);
          if (!hook) {
            return false;
          }
          options.onDespawn?.(hook);
          return true;
        },
        notifyDeathStarted: (actor, context) => {
          const hook = buildHook(actor, context);
          if (!hook) {
            return false;
          }
          options.onDeathStarted?.(hook);
          if (markNpcDeathAnimationNotified(actor, context.tick)) {
            options.onDeathAnimation?.(hook);
          }
          return true;
        },
        notifyDeathAnimation: (actor, context) => {
          const hook = buildHook(actor, context);
          if (!hook) {
            return false;
          }
          if (markNpcDeathAnimationNotified(actor, context.tick)) {
            options.onDeathAnimation?.(hook);
          }
          return true;
        },
        releaseOnDeathAnimation: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook) {
            return options.releaseOnDeathAnimation?.(hook) ?? [];
          } else {
            return [];
          }
        },
        move: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook && options.move !== false) {
            if (options.move) {
              return options.move(hook);
            } else {
              return getNpcPursuitMoves(actor, context);
            }
          } else {
            return [];
          }
        },
        tick: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook) {
            return (
              options.tick?.(hook) ?? {
                environmentalDamages: [],
              }
            );
          } else {
            return {
              environmentalDamages: [],
            };
          }
        },
        postTick: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook) {
            return options.postTick?.(hook) ?? [];
          } else {
            return [];
          }
        },
        resolveLocalEffects: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook) {
            return options.resolveLocalEffects?.(hook) ?? [];
          } else {
            return [];
          }
        },
        attackTimer: (actor, context) => {
          const hook = buildHook(actor, context);
          if (hook) {
            return options.attackTimer?.(hook) ?? null;
          } else {
            return null;
          }
        },
      };
    },
  };
}
var NpcDefinitionRegistry = class {
  registrations;
  constructor(registrations = []) {
    const registrationsById = new Map();
    for (const registration of registrations) {
      if (registrationsById.has(registration.definitionId)) {
        throw new DuplicateNpcDefinitionError(registration.definitionId);
      }
      registrationsById.set(registration.definitionId, registration);
    }
    this.registrations = registrationsById;
  }
  assertDefinitionMatches(actor) {
    if (actor.definition) {
      if (!this.registrations.get(actor.definition.id)?.isActor(actor)) {
        throw new NpcDefinitionMismatchError(actor.id, actor.definition.id);
      }
    } else if (actor.state !== undefined) {
      throw new NpcDefinitionMismatchError(actor.id, "(missing)");
    }
  }
  notifyDamageResolved(actor, damage, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.notifyDamageResolved(actor, damage, context) ?? false
    );
  }
  notifyDefeated(actor, defeat, ownership, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.notifyDefeated(actor, defeat, ownership, context) ?? false
    );
  }
  notifyDespawn(actor, context) {
    return (
      this.registrations.get(actor.definition?.id ?? "")?.notifyDespawn(actor, context) ??
      false
    );
  }
  notifyDeathStarted(actor, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.notifyDeathStarted(actor, context) ?? false
    );
  }
  notifyDeathAnimation(actor, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.notifyDeathAnimation(actor, context) ?? false
    );
  }
  releaseOnDeathAnimation(actor, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.releaseOnDeathAnimation(actor, context) ?? []
    );
  }
  move(actor, context) {
    return this.registrations.get(actor.definition?.id ?? "")?.move(actor, context) ?? [];
  }
  tick(actor, context) {
    return (
      this.registrations.get(actor.definition?.id ?? "")?.tick(actor, context) ?? {
        environmentalDamages: [],
      }
    );
  }
  postTick(actor, context) {
    return this.registrations.get(actor.definition?.id ?? "")?.postTick(actor, context) ?? [];
  }
  resolveLocalEffects(actor, context) {
    return (
      this.registrations
        .get(actor.definition?.id ?? "")
        ?.resolveLocalEffects(actor, context) ?? []
    );
  }
  attackTimer(actor, context) {
    return (
      this.registrations.get(actor.definition?.id ?? "")?.attackTimer(actor, context) ?? null
    );
  }
};
var DuplicateNpcDefinitionError = class extends Error {
  definitionId;
  constructor(definitionId) {
    super(`Duplicate NPC definition id: ${definitionId}`);
    this.definitionId = definitionId;
    this.name = "DuplicateNpcDefinitionError";
  }
};
var NpcDefinitionMismatchError = class extends Error {
  actorId;
  definitionId;
  constructor(actorId, definitionId) {
    super(`NPC '${actorId}' has no matching registered definition '${definitionId}'`);
    this.actorId = actorId;
    this.definitionId = definitionId;
    this.name = "NpcDefinitionMismatchError";
  }
};
export { defineNpc, NpcDefinitionRegistry };
