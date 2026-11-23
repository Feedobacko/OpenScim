// In a module of its own so that a presentation can import it:
// encounters/presentations.js imports every presentation, and a presentation
// that imported that module back would be in an import cycle with it.
//
// `context` is what a scene builder is handed: { cacheManager,
// eventAudioPlayer, frameSoundTracker, encounterRenderConfig }. Its
// `encounterRenderConfig` is the presentation's render config with the
// descriptor's map square put in where the config names none, and the
// descriptor's map square offsets.

// The scene of an encounter that draws nothing of its own: its NPCs, the
// player and the arena, from `renderConfig`. The same four calls set up a
// scene that extends BaseScene:
//   sceneBuilder: (context) => buildScene(BaseScene, renderConfig, context)
export function buildScene(Scene, renderConfig, context) {
  const scene = new Scene();
  scene.setEncounterRenderConfig(context?.encounterRenderConfig ?? renderConfig);
  scene.setEventAudioPlayer(context?.eventAudioPlayer ?? null);
  scene.setFrameSoundTracker(context?.frameSoundTracker ?? null);
  scene.setGroundItemLoaderSource(context?.cacheManager ?? null);
  return scene;
}
