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
      tagline: arena.name,
      setupContext: "Arena",
      blurb: "Build a fight of your own: choose an arena, drag monsters of the other fights onto it, and fight them or watch them fight each other. Scenarios can be saved, exported and shared as a code.",
    },
  };
};

export const sandboxPresentations = sandboxArenas.map(presentationOf);
