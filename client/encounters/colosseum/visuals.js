// The Fremennik warband's NPC definition is Sol Heredit's, and its hooks
// show what a warbander does (its attack, its flinch) as "colosseum_visual"
// tick events, which only his own scene, in client/assets/rendering.js,
// plays. The waves are drawn by the default scene, which plays
// "inferno_visual" events (docs/ADDING-AN-ENCOUNTER.md, section 6). The two
// kinds carry the same animations and projectiles. They differ in how a
// graphic names its place, and in that a "colosseum_visual" may leave out
// its projectiles and a graphic's height. So one is turned into the other on
// its way to the engine.
//
// Only what a definition's hooks emit passes through here. What Sol's
// modifiers emit from SolModifierEffects (the bees' spawn, the totem) does
// not.

function toInfernoGraphic(graphic, world) {
  // A graphic without a height is drawn on the ground.
  const { spotAnimId, delayCycles, height = 0 } = graphic;
  if (graphic.actorId === undefined) {
    return [{ spotAnimId, target: { kind: "tile", position: [...graphic.position] }, height, delayCycles }];
  }
  // A graphic on an actor that has left the world is dropped.
  const actor = world.actors.get(graphic.actorId);
  return actor ? [{ spotAnimId, target: { kind: "actor", actorId: actor.id, size: actor.size, position: [...actor.position] }, height, delayCycles }] : [];
}

/** A hook's context whose tick events turn "colosseum_visual" events into "inferno_visual" ones. */
export function withInfernoVisuals(context) {
  return {
    ...context,
    tickEvents: {
      emit(event) {
        context.tickEvents.emit(
          event.type === "colosseum_visual"
            ? {
                type: "inferno_visual",
                animations: event.animations,
                projectiles: event.projectiles ?? [],
                graphics: event.graphics.flatMap((graphic) => toInfernoGraphic(graphic, context.world)),
              }
            : event,
        );
      },
    },
  };
}

/**
 * An entry for an NpcDefinitionRegistry (what `definition.register(config)`
 * returns) whose hooks emit "inferno_visual" events where the definition
 * emits "colosseum_visual" ones. Every hook but `isActor` is handed its
 * context as the last argument.
 */
export function registerWithInfernoVisuals(registration) {
  return Object.fromEntries(
    Object.entries(registration).map(([name, hook]) => [
      name,
      typeof hook !== "function" || name === "isActor" ? hook : (...hookArguments) => hook(...hookArguments.slice(0, -1), withInfernoVisuals(hookArguments.at(-1))),
    ]),
  );
}
