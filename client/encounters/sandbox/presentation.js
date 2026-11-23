// What draws the sandbox: the default scene on each arena's map square, with
// every NPC of the catalog loaded, and the editor (editor.js) brought in
// step with the run every frame. One presentation per arena kind, as the
// Doom's deeper room has its own (presentations.js keeps the last per kind).
import { buildScene } from "../shared/buildScene.js";
import { sandboxArenas, sandboxVariantKind } from "./arenas.js";
import { sandboxPreloadNpcTypes, sandboxSpotAnimIds } from "./catalog.js";
import { closeSandboxEditor, syncSandboxEditor } from "./editor.js";

const presentationOf = (arena) => (BaseScene) => {
  const kind = sandboxVariantKind(arena.id);
  const renderConfig = {
    terrainMapSquare: arena.mapSquare,
    locRender: arena.locRender,
    preloadNpcTypes: sandboxPreloadNpcTypes,
    spotAnimIds: sandboxSpotAnimIds,
  };
  return {
    kind,
    renderConfig,
    sceneBuilder(context) {
      class SandboxScene extends BaseScene {
        build(input, ...rest) {
          syncSandboxEditor(kind, input.simulationState);
          return super.build(input, ...rest);
        }
        // The editor is the page's, not the scene's: it goes when the scene does.
        dispose(...rest) {
          closeSandboxEditor();
          return super.dispose?.(...rest);
        }
      }
      return buildScene(SandboxScene, renderConfig, context);
    },
    defaultCamera: arena.camera,
    presentation: {
      title: "Sandbox",
      tagline: "Build your own fight",
      setupContext: "Sandbox",
      blurb: "Build a fight of your own: the sandbox editor chooses the arena, places monsters of the other fights and the boss with its own mechanics, and saves, exports and shares scenarios. Each run waits for Start encounter and can be paused.",
    },
  };
};

export const sandboxPresentations = sandboxArenas.map(presentationOf);
