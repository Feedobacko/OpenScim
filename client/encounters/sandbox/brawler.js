// The one behaviour of every sandbox NPC: walk toward a target, attack it
// when one of its attacks reaches, wait its attack speed, again. Which
// target is the encounter's to say (`config.selectTarget`): the player
// alone, or in "ffa" the nearest NPC or player of another team. Attacks on
// an NPC are the engine's own NPC-on-NPC attacks (the Inferno's nibblers hit
// the pillars the same way), rolled with the monster table's stats of both.
//
// What the player sees of an attack is announced twice: as an
// "inferno_visual" event, which the default scene (InfernoScene and the
// scenes built on it) plays, and as a "colosseum_visual" one, which Sol
// Heredit's and Yama's scenes play (the arena's host draws with those). No
// scene plays both.
//
// Random numbers come from `context.random`, the encounter's seeded
// generator; nothing else is random.
import { canNpcActAtTick, isActorAlive } from "../../engine/npcState.js";
import { getProjectileFlightCycles } from "../../engine/projectiles.js";
import { getNpcPursuitMoves, isArenaFootprintWalkable } from "../shared/npcMovement.js";
import { findNpcRouteToMeleeRange } from "../shared/npcRoutes.js";
import { defineNpc } from "../shared/npcDefinitions.js";
import { rollNpcAttack, isNpcInAttackRange, getDistanceFromNpcCentre } from "../shared/npcAttack.js";
import { scheduleNextActionTick, buildNpcProjectileVisual, getProjectileSourcePosition, buildActorVisualTarget, faceActorToward } from "../shared/npcHelpers.js";
import { emitInfernoNpcAttack, emitInfernoVisual } from "../inferno/events.js";
import { emitColosseumVisual } from "../sol-heredit/constants.js";
import { isCorrectProtectionPrayer } from "../../engine/damage.js";
import { hasLineOfSight } from "../../engine/attackRange.js";
import { healNpc } from "../shared/npcHelpers.js";

// What the formulas and the events call each style.
const planOfStyle = {
  melee: { formulaStyle: "melee_crush", damageType: "melee", attackKind: "melee_crush" },
  range: { formulaStyle: "ranged", damageType: "range", attackKind: "range_arrow" },
  magic: { formulaStyle: "magic", damageType: "magic", attackKind: "magic_fire" },
};
// inferred: a ranged or magic attack without a projectile of its own lands two ticks later.
const defaultDistantImpactTicks = 2;
const cyclesPerTick = 30;
// inferred: a graphic on a target tile at a body's height, as JalTok-Jad's ranged
// graphic (inferno/jad.js) and Zuk's (inferno/zukFight.js) are drawn.
const defaultTargetGraphicHeight = 92;

/** The reach that brings an NPC close enough for its longest attack. */
export const getApproachRange = (entry) => Math.max(...entry.attacks.map((attack) => attack.range));

// The visual of an attack: its projectiles and the graphics on the target.
// A windup (Jad's three ticks) delays both, as it delays the hit.
function buildPlan(attack, maxHitOverride, attacker, target) {
  const plan = {
    ...planOfStyle[attack.style],
    sourceDeathPolicy: attack.style === "melee" ? "cancel-before-impact" : "persist",
  };
  const maxHit = maxHitOverride ?? attack.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  const windupCycles = (attack.windupTicks ?? 0) * cyclesPerTick;
  if (attack.windupTicks) {
    plan.windupTicks = attack.windupTicks;
    // The hit is queued as the animation starts, but the prayer is judged on
    // the release, when the windup ends, as JalTok-Jad's own fight does it
    // (inferno/jad.js; WIKI: after the release is too late): the player has
    // the windup to switch. Without this it was judged at the animation's
    // first tick, before anyone could react (issue #17).
    plan.prayerCheckAt = { afterLaunchTicks: attack.windupTicks };
  }
  let visual = [];
  const graphics = attack.targetGraphic
    ? [{ spotAnimId: attack.targetGraphic.spotAnimId, target: { kind: "tile", position: [...target.position] }, height: attack.targetGraphic.height ?? defaultTargetGraphicHeight, delayCycles: windupCycles }]
    : [];
  if (attack.parts) {
    // A projectile of several spot animations, each leaving and landing at
    // its own offset (Jad's magic: inferno/jad.js).
    plan.impactDelayTicks = 0;
    plan.projectile = attack.parts.timing;
    const distance = getDistanceFromNpcCentre(attacker, target);
    visual = attack.parts.spotAnims.map(({ spotAnimId, start, end }) => ({
      spotAnimId,
      sourcePosition: getProjectileSourcePosition(attacker),
      target: buildActorVisualTarget(target),
      startDelayCycles: windupCycles + start,
      endDelayCycles: windupCycles + end + distance * attack.parts.timing.stepMultiplier,
      slope: attack.parts.slope,
      startOffset: attack.parts.startOffset,
      startHeight: attack.parts.startHeight,
      endHeight: attack.parts.endHeight,
    }));
  } else if (attack.projectile) {
    plan.impactDelayTicks = 0;
    plan.projectile = attack.projectile.timing;
    const endDelayCycles = getProjectileFlightCycles(attack.projectile.timing, getDistanceFromNpcCentre(attacker, target));
    visual = [buildNpcProjectileVisual(attacker, target, attack.projectile, endDelayCycles)];
  } else if (attack.flight) {
    plan.impactDelayTicks = Math.ceil(attack.flight.endDelayCycles / cyclesPerTick);
    const { spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight } = attack.flight;
    visual = [{ spotAnimId, startDelayCycles, endDelayCycles, slope, startOffset, startHeight, endHeight, sourcePosition: getProjectileSourcePosition(attacker), target: buildActorVisualTarget(target) }];
  } else {
    plan.impactDelayTicks = attack.impactDelayTicks ?? (attack.style === "melee" ? 0 : defaultDistantImpactTicks);
  }
  if (windupCycles > 0 && !attack.parts) {
    visual = visual.map((projectile) => ({ ...projectile, startDelayCycles: projectile.startDelayCycles + windupCycles, endDelayCycles: projectile.endDelayCycles + windupCycles }));
  }
  return { plan, visual, graphics };
}

// When the straight walk is blocked (a pillar, a wall between them and no
// line of sight), one step along the route search toward the target, as the
// Colosseum's minotaur does with its modifier Red Flag (colosseum/minotaur.js).
function routeAround(actor, target, context) {
  const occupancy = context.world.occupancy;
  const [ownX, ownY] = actor.position;
  const isOwnTile = (x, y) => x >= ownX && x < ownX + actor.size && y >= ownY && y < ownY + actor.size;
  const isClearOfOthers = ([x, y], size) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (occupancy.isBlocked(x + dx, y + dy) && !isOwnTile(x + dx, y + dy)) return false;
      }
    }
    return true;
  };
  const route = findNpcRouteToMeleeRange({
    source: actor.position,
    destination: [...target.position],
    size: actor.size,
    canOccupy: (tile, size) => isArenaFootprintWalkable(tile, size) && isClearOfOthers(tile, size),
    moveNear: true,
  });
  const step = route.kind === "failed" ? undefined : route.steps[0];
  return step ? [{ npcId: actor.id, path: [step] }] : [];
}

export const brawlerNpcDefinition = defineNpc({
  id: "sandbox-brawler",
  // The scene plays the death; the encounter takes the body away (encounter.js).
  onDamageResolved: ({ actor, damage }) => {
    if (damage?.sourceId) actor.state.lastAttackerId = damage.sourceId;
  },
  move: ({ actor, context, config }) => {
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return [];
    // An NPC that never moves in its own fight (TzKal-Zuk) stays where it was placed.
    if (config.entryOf(actor).immobile) {
      actor.combat.targetId = config.selectTarget(actor, context)?.id ?? null;
      return [];
    }
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return [];
    // Still while an attack of tiles is on its way (special: Sol Heredit's spear and shield).
    if (context.tick < (actor.state.immobileUntilTick ?? 0)) return [];
    const moves = getNpcPursuitMoves(actor, context, target);
    if (moves.length > 0 || isNpcInAttackRange(actor, target, actor.combat.attackRange)) return moves;
    return routeAround(actor, target, context);
  },
  tick: ({ actor, context, config }) => {
    const idle = { environmentalDamages: [] };
    if (!canNpcActAtTick(actor, context.tick) || !isActorAlive(actor)) return idle;
    // A charged volley (the manticore's) runs on every tick: it draws its charge.
    const charged = config.entryOf(actor).attacks.find((attack) => attack.chargedVolley);
    if (charged) return chargedVolley(actor, charged, context, config);
    if (context.tick < actor.combat.nextActionTick) return idle;
    const target = config.selectTarget(actor, context);
    actor.combat.targetId = target?.id ?? null;
    if (!target) return idle;
    const entry = config.entryOf(actor);
    // An attack of `everyNth` comes on that attack of the count, and only then
    // (the javelin colossus's fifth); the others are drawn among the rest.
    const count = (actor.state.attackCount ?? 0) + 1;
    const inReach = entry.attacks.filter((attack) => isNpcInAttackRange(actor, target, attack.range) && (attack.everyNth ? count % attack.everyNth === 0 : true));
    const due = inReach.find((attack) => attack.everyNth);
    const plain = inReach.filter((attack) => !attack.everyNth);
    if (!due && plain.length === 0) {
      // Out of reach: a healer heals one of its side instead (the minotaur).
      return entry.heal ? heal(actor, target, entry.heal, context, config) : idle;
    }
    actor.state.attackCount = count;
    const attack = due ?? (plain.length === 1 ? plain[0] : plain[Math.floor(context.random() * plain.length)]);
    if (attack.special) return special(actor, target, attack, context, config);
    // One attack may be several hits, each rolled on its own and with a
    // hitsplat of its own: `hits` at once (the jaguar's three claws), or a
    // `volley` a tick apart (the manticore's three orbs). The engine
    // announces the first; the others continue it.
    const parts = attack.volley
      ? attack.volley.map((part, index) => ({ ...attack, ...part, windupTicks: (attack.windupTicks ?? 0) + index * (attack.volleySpacingTicks ?? 1) }))
      : Array.from({ length: attack.hits ?? 1 }, () => attack);
    const npcAttacks = [];
    const visual = [];
    const graphics = [];
    for (const part of parts) {
      const built = buildPlan(part, actor.state.maxHit, actor, target);
      const rolled = rollNpcAttack({ attacker: actor, target, plan: built.plan, random: context.random });
      // Null when an NPC has no stats: the catalog holds only NPCs of the monster table.
      if (!rolled) return idle;
      npcAttacks.push(npcAttacks.length === 0 ? rolled : { ...rolled, isContinuation: true });
      visual.push(...built.visual);
      graphics.push(...built.graphics);
    }
    const npcAttack = npcAttacks[0];
    emitInfernoNpcAttack(context, {
      actor,
      target,
      clipId: attack.clip,
      kind: `sandbox_${attack.style}`,
      impactDelayTicks: npcAttack.impactDelayTicks,
      projectiles: visual,
    });
    if (graphics.length > 0) emitInfernoVisual(context.tickEvents, { animations: [], projectiles: [], graphics });
    emitColosseumVisual(context.tickEvents, {
      animations: [{ actorId: actor.id, clipId: attack.clip, delayCycles: 0 }],
      projectiles: visual,
      // Its graphics name a tile as `position` (the schema of rendering.js).
      graphics: graphics.map(({ spotAnimId, target: on, height, delayCycles }) => ({ spotAnimId, position: [...on.position], delayCycles, height })),
    });
    actor.combat.attackStyle = attack.style;
    actor.combat.lastAttackTick = context.tick;
    scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
    return { environmentalDamages: [], npcAttacks };
  },
});

// With its target out of reach, a healer (`heal`, the minotaur's:
// colosseum/sandbox.js) heals to full, on its attack timer, the first NPC of
// its own side below `belowFraction` of its hitpoints whose centre is in
// sight and within `range` of its own.
const centreTile = (npc) => [npc.position[0] + Math.floor(npc.size / 2), npc.position[1] + Math.floor(npc.size / 2)];
function heal(actor, target, config_, context, config) {
  const idle = { environmentalDamages: [] };
  const [x, y] = centreTile(actor);
  const wounded = context.world.getNpcs().find((npc) => {
    if (npc === actor || !isActorAlive(npc) || npc.death !== undefined || !config.isAlly(actor, npc)) return false;
    if (npc.vitals.hp >= npc.vitals.maxHp * config_.belowFraction) return false;
    const [otherX, otherY] = centreTile(npc);
    return Math.max(Math.abs(otherX - x), Math.abs(otherY - y)) <= config_.range && hasLineOfSight(x, y, otherX, otherY);
  });
  if (!wounded) return idle;
  faceActorToward(actor, wounded);
  const animations = [{ actorId: actor.id, clipId: config_.clip, delayCycles: 0 }];
  emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics: [{ ...config_.graphic, target: buildActorVisualTarget(wounded), delayCycles: 0 }] });
  emitColosseumVisual(context.tickEvents, { animations, projectiles: [], graphics: [{ ...config_.graphic, actorId: wounded.id, delayCycles: 0 }] });
  healNpc(wounded, wounded.vitals.maxHp - wounded.vitals.hp, context.tickEvents);
  scheduleNextActionTick(actor.combat, context.tick, actor.combat.attackSpeed);
  return idle;
}

// A charged volley (`chargedVolley`, the manticore's: colosseum/sandbox.js,
// after colosseum/manticore.js). With a target in reach for the first time
// it chooses the order of its orbs, once, and charges for its attack speed;
// the charge animation and the orbs it holds over itself show as the charge
// runs out; then it throws one orb a tick at the target of the first, each
// rolled and with a hitsplat of its own, and charges again. It walks on as
// it charges, and holds its volley until a target is in reach.
function chargedVolley(actor, attack, context, config) {
  const idle = { environmentalDamages: [] };
  const charge = attack.chargedVolley;
  const state = actor.state;
  // The second and third orb leave one and two ticks after the first, at its target.
  if (state.volleyTick !== undefined && state.volleyTick !== null) {
    const orbIndex = context.tick - state.volleyTick;
    if (orbIndex >= 2) state.volleyTick = null;
    if (orbIndex === 1 || orbIndex === 2) {
      const volleyTarget = context.world.actors.get(state.volleyTargetId);
      return volleyTarget && isActorAlive(volleyTarget) ? throwOrb(actor, volleyTarget, orbIndex, attack, context) : idle;
    }
  }
  const target = config.selectTarget(actor, context);
  actor.combat.targetId = target?.id ?? null;
  const inReach = target !== null && target !== undefined && isNpcInAttackRange(actor, target, attack.range);
  if (!state.orbOrder) {
    if (inReach && context.tick >= actor.combat.nextActionTick) {
      state.orbOrder = [...charge.orders[Math.floor(context.random() * charge.orders.length)]];
      state.orbShownTicks = [];
      actor.combat.nextActionTick = context.tick + actor.combat.attackSpeed;
    }
    return idle;
  }
  const ticksLeft = actor.combat.nextActionTick - context.tick;
  if (ticksLeft === charge.chargeClipTicksLeft) {
    const animations = [{ actorId: actor.id, clipId: charge.chargeClip, delayCycles: 0 }];
    emitInfernoVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
    emitColosseumVisual(context.tickEvents, { animations, projectiles: [], graphics: [] });
  }
  if (ticksLeft > 0 || !inReach) {
    drawHeldOrbs(actor, charge, ticksLeft, context);
    return idle;
  }
  actor.combat.nextActionTick = context.tick + actor.combat.attackSpeed;
  state.volleyTick = context.tick;
  state.volleyTargetId = target.id;
  state.orbShownTicks = [];
  faceActorToward(actor, target);
  // The third orb leaves two ticks from now: its last drawing over the manticore.
  return throwOrb(actor, target, 0, attack, context, [heldOrbGraphic(actor, charge, 2)]);
}

const heldOrbGraphic = (actor, charge, orbIndex) => ({
  spotAnimId: charge.orbs[actor.state.orbOrder[orbIndex]].spotAnimId,
  actorId: actor.id,
  height: charge.heights[orbIndex],
});

// The orbs held over it as the charge runs out, one more at each of the
// last ticks; a held orb is drawn every `heldOrbGraphicTicks`, and once more
// before it leaves (colosseum/manticore.js, drawHeldOrbs).
function drawHeldOrbs(actor, charge, ticksLeft, context) {
  const state = actor.state;
  state.orbShownTicks ??= [];
  while (state.orbShownTicks.length < state.orbOrder.length && ticksLeft <= charge.firstOrbShownTicksLeft - state.orbShownTicks.length) {
    state.orbShownTicks.push(context.tick);
  }
  const held = state.orbShownTicks.flatMap((shownTick, orbIndex) => {
    const ticksUntilItLeaves = ticksLeft > 0 ? ticksLeft + orbIndex : Infinity;
    const isDrawn = (context.tick - shownTick) % charge.heldOrbGraphicTicks === 0
      ? ticksUntilItLeaves >= charge.heldOrbGraphicTicks
      : ticksUntilItLeaves === charge.heldOrbGraphicTicks;
    return isDrawn ? [heldOrbGraphic(actor, charge, orbIndex)] : [];
  });
  if (held.length > 0) emitHeldGraphics(context, held);
}

// Graphics on an actor, in both schemas: the default scene's (a target) and
// the hosts' scenes' (an actor id).
function emitHeldGraphics(context, graphics, projectiles = [], animations = []) {
  emitInfernoVisual(context.tickEvents, {
    animations: [],
    projectiles,
    graphics: graphics.map(({ spotAnimId, actorId, height, delayCycles }) => ({ spotAnimId, target: buildActorVisualTarget(context.world.actors.get(actorId)), height, delayCycles: delayCycles ?? 0 })),
  });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles,
    graphics: graphics.map(({ spotAnimId, actorId, height, delayCycles }) => ({ spotAnimId, actorId, height, delayCycles: delayCycles ?? 0 })),
  });
}

// One orb leaves: an attack of its own, its projectile, and its impact on a
// target that does not pray against it.
function throwOrb(actor, target, orbIndex, attack, context, graphics = []) {
  const charge = attack.chargedVolley;
  const orb = charge.orbs[actor.state.orbOrder[orbIndex]];
  const plan = { ...planOfStyle[orb.style], impactDelayTicks: charge.impactDelayTicks, sourceDeathPolicy: "persist" };
  const maxHit = actor.state.maxHit ?? orb.maxHit;
  if (maxHit !== undefined) plan.maxHit = maxHit;
  const rolled = rollNpcAttack({ attacker: actor, target, plan, random: context.random });
  if (!rolled) return { environmentalDamages: [] };
  const projectile = {
    ...charge.flight,
    spotAnimId: orb.spotAnimId,
    startOffset: charge.startOffsets[orbIndex],
    startHeight: charge.heights[orbIndex],
    sourcePosition: getProjectileSourcePosition(actor),
    target: buildActorVisualTarget(target),
  };
  const prayedAgainst = target.kind === "player" && isCorrectProtectionPrayer(planOfStyle[orb.style].damageType, target.activePrayer);
  if (!prayedAgainst) graphics.push({ spotAnimId: orb.impactSpotAnimId, actorId: target.id, height: charge.impactHeight, delayCycles: charge.flight.endDelayCycles });
  if (orbIndex === 0) {
    emitInfernoNpcAttack(context, { actor, target, clipId: attack.clip, kind: "sandbox_volley", impactDelayTicks: plan.impactDelayTicks, projectiles: [projectile] });
    emitHeldGraphics(context, graphics, [], []);
    emitColosseumVisual(context.tickEvents, { animations: [{ actorId: actor.id, clipId: attack.clip, delayCycles: 0 }], projectiles: [projectile], graphics: [] });
  } else {
    emitHeldGraphics(context, graphics, [projectile]);
  }
  actor.combat.attackStyle = orb.style;
  actor.combat.lastAttackTick = context.tick;
  return { environmentalDamages: [], npcAttacks: [rolled] };
}

// An attack of the encounter's own that lands on tiles (`special`: Sol
// Heredit's spear and shield, sol-heredit/sandbox.js). It decides now; the
// encounter lands it when it is due (encounter.js, landStrikes) and draws
// it. The NPC stands still `holdTicks` and acts again `nextActionTicks` later.
function special(actor, target, attack, context, config) {
  const started = attack.special.start({ actor, target, random: context.random });
  config.queueStrike({ landsAt: context.tick + started.landsInTicks, special: attack.special.id, data: started.data, attackerId: actor.id, targetId: target.id });
  actor.state.immobileUntilTick = context.tick + started.holdTicks;
  faceActorToward(actor, target);
  const animations = [{ actorId: actor.id, clipId: started.clipId, delayCycles: 0 }];
  // What it draws as it starts: on itself (`on: "self"`) or on a tile.
  const graphics = started.graphics ?? [];
  emitInfernoVisual(context.tickEvents, {
    animations,
    projectiles: [],
    graphics: graphics.map(({ spotAnimId, on, tile, height, delayCycles }) => ({ spotAnimId, target: on === "self" ? buildActorVisualTarget(actor) : { kind: "tile", position: [...tile] }, height, delayCycles })),
  });
  emitColosseumVisual(context.tickEvents, {
    animations,
    projectiles: [],
    graphics: graphics.map(({ spotAnimId, on, tile, height, delayCycles }) => (on === "self" ? { spotAnimId, actorId: actor.id, height, delayCycles } : { spotAnimId, position: [...tile], height, delayCycles })),
  });
  actor.combat.attackStyle = attack.style;
  actor.combat.lastAttackTick = context.tick;
  scheduleNextActionTick(actor.combat, context.tick, started.nextActionTicks);
  return { environmentalDamages: [] };
}
