// What draws the sandbox: one presentation per arena kind, as the Doom's
// deeper room has its own (presentations.js keeps the last per kind), with
// every NPC of the catalog loaded, and the editor (editor.js) brought in step
// with the run every frame.
//
// When the scenario the visit starts with fights the arena's boss with its
// mechanics (encounter.js, the host), the scene is the host's own: Sol
// Heredit's and Yama's scenes are in client/assets/rendering.js, which hands
// every presentation `presentationOf(kind)` to reach them; the render config
// is the host's with the catalog's NPCs added. Which scene a visit gets is
// decided when it is built, so the editor reloads the page when the boss is
// switched on or off (editor.js).
import { buildScene } from "../shared/buildScene.js";
import { sandboxArenas, sandboxVariantKind } from "./arenas.js";
import { sandboxPreloadNpcTypes, sandboxSpotAnimIds } from "./catalog.js";
import { closeSandboxEditor, syncSandboxEditor } from "./editor.js";
import { isHostedVisit } from "./visit.js";

const withCatalog = (renderConfig) => ({
  ...renderConfig,
  preloadNpcTypes: [
    ...(renderConfig.preloadNpcTypes ?? []),
    ...sandboxPreloadNpcTypes.filter((entry) => !(renderConfig.preloadNpcTypes ?? []).some((own) => own.npcTypeId === entry.npcTypeId)),
  ],
  spotAnimIds: [...new Set([...(renderConfig.spotAnimIds ?? []), ...sandboxSpotAnimIds])],
});

// Brings the editor in step with a scene of any class, the host's included.
function withEditor(scene, kind) {
  const build = scene.build.bind(scene);
  const dispose = scene.dispose?.bind(scene);
  scene.build = (input, ...rest) => {
    syncSandboxEditor(kind, input.simulationState);
    return build(input, ...rest);
  };
  // The editor is the page's, not the scene's: it goes when the scene does.
  scene.dispose = (...rest) => {
    closeSandboxEditor();
    return dispose?.(...rest);
  };
  return scene;
}

const presentationOf = (arena) => (BaseScene, packHsl, { presentationOf: presentationOfKind } = {}) => {
  const kind = sandboxVariantKind(arena.id);
  const ownRenderConfig = {
    terrainMapSquare: arena.mapSquare,
    locRender: arena.locRender,
    preloadNpcTypes: sandboxPreloadNpcTypes,
    spotAnimIds: sandboxSpotAnimIds,
  };
  const host = () => (arena.hostKind && presentationOfKind ? presentationOfKind(arena.hostKind) : undefined);
  const hosted = () => isHostedVisit(arena) && host() !== undefined;
  let hostRenderConfig = null;
  return {
    kind,
    // Read by the application as a visit starts.
    get renderConfig() {
      if (!hosted()) return ownRenderConfig;
      return (hostRenderConfig ??= withCatalog(host().renderConfig ?? {}));
    },
    sceneBuilder(context) {
      if (hosted()) return withEditor(host().sceneBuilder(context), kind);
      return withEditor(buildScene(BaseScene, ownRenderConfig, context), kind);
    },
    // The host's camera where the arena has one: it looks at the boss.
    get defaultCamera() {
      return host()?.defaultCamera ?? arena.camera;
    },
    presentation: {
      title: "Sandbox",
      tagline: "Build your own fight",
      setupContext: "Sandbox",
      blurb: "Build a fight of your own: the sandbox editor chooses the arena, places monsters of the other fights and the boss with its own mechanics, and saves, exports and shares scenarios. Each run waits for Start encounter and can be paused.",
    },
  };
};

export const sandboxPresentations = sandboxArenas.map(presentationOf);
