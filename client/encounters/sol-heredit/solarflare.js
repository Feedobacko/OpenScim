import { defineNpc } from "../shared/npcDefinitions.js";
import { createColosseumActor } from "./actors.js";
var CornerRoute = class {
  lapTicks;
  start;
  steps = [];
  constructor(corners, timing) {
    const { stepInterval: stepInterval, cornerPause: cornerPause } = timing;
    if (
      corners.length < 2 ||
      !Number.isInteger(stepInterval) ||
      stepInterval < 1 ||
      !Number.isInteger(cornerPause) ||
      cornerPause < 0
    ) {
      throw new TypeError("Invalid corner route timing");
    }
    this.start = [...corners[0]];
    let offset = 0;
    for (let cornerIndex = 0; cornerIndex < corners.length; cornerIndex++) {
      const [fromX, fromY] = corners[cornerIndex];
      const [toX, toY] = corners[(cornerIndex + 1) % corners.length];
      const dx = toX - fromX;
      const dy = toY - fromY;
      if (![fromX, fromY, toX, toY].every(Number.isInteger) || (dx === 0) == (dy === 0)) {
        throw new TypeError(
          "Corner routes require nonempty cardinal sides on integer tiles",
        );
      }
      const sideLength = Math.abs(dx) + Math.abs(dy);
      for (let distance = 1; distance <= sideLength; distance++) {
        this.steps.push({
          offset: offset,
          position: [fromX + Math.sign(dx) * distance, fromY + Math.sign(dy) * distance],
        });
        offset += distance === sideLength ? Math.max(stepInterval, cornerPause) : stepInterval;
      }
    }
    this.lapTicks = offset;
  }
  getPositionAfterTicks(elapsedTicks) {
    if (elapsedTicks < 0) {
      return [...this.start];
    }
    const lapOffset = elapsedTicks % this.lapTicks;
    for (let index = this.steps.length - 1; index >= 0; index--) {
      const step = this.steps[index];
      if (step.offset <= lapOffset) {
        return [...step.position];
      }
    }
    return [...this.start];
  }
};
var solarflareRouteTimingByTier = {
  1: {
    stepInterval: 2,
    cornerPause: 7,
  },
  2: {
    stepInterval: 2,
    cornerPause: 0,
  },
  3: {
    stepInterval: 1,
    cornerPause: 2,
  },
};
var solarflareNpcDefinition = defineNpc({
  id: "colosseum-solarflare",
  move: ({ actor: actor, context: context }) => {
    if (!actor.alive) {
      return [];
    }
    const routePosition = actor.state.route.getPositionAfterTicks(context.tick - actor.state.firstStepTick);
    if (routePosition[0] === actor.position[0] && routePosition[1] === actor.position[1]) {
      return [];
    } else {
      return [
        {
          npcId: actor.id,
          path: [routePosition],
          ...(actor.state.movementSpeed
            ? {
                movementSpeed: actor.state.movementSpeed,
              }
            : {}),
        },
      ];
    }
  },
});
function createSolarflareOrb(orbSpawn) {
  const route = new CornerRoute(orbSpawn.corners, solarflareRouteTimingByTier[orbSpawn.tier]);
  return solarflareNpcDefinition.createActor(
    {
      ...createColosseumActor("solarflare", orbSpawn.id, route.getPositionAfterTicks(-1)),
      spawnTick: orbSpawn.spawnTick,
    },
    {
      route: route,
      firstStepTick: orbSpawn.firstStepTick,
      ...(orbSpawn.tier < 3
        ? {
            movementSpeed: "crawl",
          }
        : {}),
    },
  );
}
var SolarflareDamage = class {
  pending = [];
  reset() {
    this.pending = [];
  }
  resolveTick(context, orbMovements, tier) {
    const damages = this.pending
      .filter((impactTick) => impactTick <= context.tick)
      .map(() => ({
        baseDamage: [10, 20],
        attackType: "typeless",
        source: "Solarflare",
        playerPosition: [...context.playerPos],
      }));
    this.pending = this.pending.filter((impactTick) => impactTick > context.tick);
    for (const movement of orbMovements) {
      if (
        movement.moved &&
        movement.from[0] === context.playerPos[0] &&
        movement.from[1] === context.playerPos[1]
      ) {
        this.pending.push(context.tick + 1);
        if (tier === 3 && context.world.getPlayer()?.activePrayer != null) {
          context.setProtectionPrayer?.(null);
        }
      }
    }
    return damages;
  }
};
export { solarflareNpcDefinition, createSolarflareOrb, SolarflareDamage };
