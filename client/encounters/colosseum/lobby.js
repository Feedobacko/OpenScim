// What the lobby's Sol Heredit offers: the whole Fortis Colosseum. Its popup
// (client/assets/application.js, the lobby's encounter popup) shows these as
// a choice of fight, as Yama's shows its contracts: the waves, which start on
// the wave their own setup names (controls.js, "Start Wave"), or Sol Heredit,
// wave 12. Each keeps its own loadout and setup.
import { colosseumKind, firstWave, lastWave } from "./constants.js";

export const colosseumLobbyLabel = "Fight";
export const colosseumLobbyFights = [
  {
    id: "waves",
    encounterKind: colosseumKind,
    name: `Waves ${firstWave}–${lastWave}`,
    subtitle: "Start on any wave; each cleared wave leads into the next, through wave 11.",
    available: true,
    // The popup's footer says "Waves" already (presentation.js, setupContext).
    summaryName: "",
    displayName: "Fortis Colosseum",
    description: "The waves of the Fortis Colosseum before Sol Heredit.",
  },
  {
    id: "sol-heredit",
    encounterKind: "sol_heredit",
    name: "Sol Heredit (wave 12)",
    subtitle: "The final wave of the Fortis Colosseum.",
    available: true,
    summaryName: "Sol Heredit",
    displayName: "Sol Heredit",
    description: "The final wave of the Fortis Colosseum.",
  },
];

/** The lobby's choice of fights that has this kind among them, or undefined. */
export const getLobbyFights = (kind) => (colosseumLobbyFights.some((fight) => fight.encounterKind === kind) ? colosseumLobbyFights : undefined);
