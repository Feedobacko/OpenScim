import { getInfernoSpawnCommandType } from "./spawnCommandType.js";
import { getMonsterHitpoints } from "../../engine/monsterStats.js";
import { parseTileString, validateInfernoStartTile, canPinInfernoWave } from "./startTile.js";
import { parseInfernoSpawnLayout } from "./spawnLayout.js";
import { infernoDefaultStartTile } from "./constants.js";
var zukDebugActions = [
  {
    command: {
      encounter: "zuk",
      type: "spawn-set",
    },
    label: "Spawn set",
  },
  {
    command: {
      encounter: "zuk",
      type: "spawn-jad",
    },
    label: "Spawn Jad",
  },
  {
    command: {
      encounter: "zuk",
      type: "spawn-healers",
    },
    label: "Spawn healers",
  },
  {
    command: {
      encounter: "zuk",
      type: "respawn-glyph",
    },
    label: "Reset shield",
  },
  {
    command: {
      encounter: "zuk",
      type: "clear-spawns",
    },
    label: "Clear minions",
  },
];
function getInfernoStartTile(rawStartTile, setup) {
  const startTile = parseTileString(rawStartTile);
  if (startTile && validateInfernoStartTile(startTile, setup).ok) {
    return startTile;
  } else {
    return [...infernoDefaultStartTile];
  }
}
var infernoWaveDebugActions = [
  {
    command: {
      encounter: "inferno",
      type: "retry-wave",
    },
    label: "Retry Wave",
  },
  {
    command: {
      encounter: "inferno",
      type: "reroll-wave",
    },
    label: "Random Spawns",
  },
  {
    command: {
      encounter: "inferno",
      type: "keep-spawns",
    },
    label: "Lock Layout",
  },
];
var infernoStartWaveKey = "infernoStartWave";
var infernoSpawnLayoutKey = "infernoSpawnLayout";
var infernoStartTileKey = "infernoStartTile";
var infernoPinnedWaveKey = "infernoPinnedWave";
var infernoPillarDestroyedKeys = {
  west: "infernoWestPillarDestroyed",
  south: "infernoSouthPillarDestroyed",
  northEast: "infernoNorthEastPillarDestroyed",
};
function getNumberFromDigitString(mechanicsValue) {
  if (typeof mechanicsValue == "string" && /^\d+$/.test(mechanicsValue)) {
    return Number(mechanicsValue);
  } else {
    return NaN;
  }
}
function getInfernoSetup(mechanics) {
  const requestedWave = getNumberFromDigitString(mechanics[infernoStartWaveKey]);
  const startWave = requestedWave >= 1 && requestedWave <= 69 ? requestedWave : 69;
  const pinnedWave = getNumberFromDigitString(mechanics[infernoPinnedWaveKey]);
  const destroyedPillars = {
    west: mechanics[infernoPillarDestroyedKeys.west] === true,
    south: mechanics[infernoPillarDestroyedKeys.south] === true,
    northEast: mechanics[infernoPillarDestroyedKeys.northEast] === true,
  };
  return {
    startWave: startWave,
    zukShieldStart: mechanics.zukShieldStart,
    destroyedPillars: destroyedPillars,
    spawnLayout: parseInfernoSpawnLayout(mechanics[infernoSpawnLayoutKey]),
    startTile: getInfernoStartTile(mechanics[infernoStartTileKey], {
      startWave: startWave,
      destroyedPillars: destroyedPillars,
    }),
    ...(canPinInfernoWave(pinnedWave)
      ? {
          pinnedWave: pinnedWave,
        }
      : {}),
  };
}
var pillarDestroyedToggleInfo =
  "Starts the run with this pillar already collapsed. Pillars never stand after wave 66. Applies from your next attempt.";
var isZukPracticeStage = ({ stage: stage }) => stage === 69;
function buildZukSectionToggle(toggle) {
  return {
    ...toggle,
    section: "TzKal-Zuk",
    visibleInPractice: isZukPracticeStage,
    appliesLater: ({ config: config, stage: stage }) =>
      stage === 69 || getInfernoSetup(config).startWave === 69 ? null : "From wave 69",
  };
}
function buildZukControls() {
  const maxHp = getMonsterHitpoints(7706);
  if (maxHp === undefined) {
    throw new TypeError("Missing Zuk monster HP");
  }
  return {
    bossHpPresets: [
      {
        label: "Start",
        hp: maxHp,
        hint: "Full health, no minions. Heals the shield in place and restarts the opening set timer.",
      },
      {
        label: "Pre-Jad",
        hp: 480,
        hint: "No minions. Damage Zuk to spawn Jad. Heals the shield in place.",
      },
      {
        label: "Pre-Healers",
        hp: 240,
        hint: "Jad cleared. Damage Zuk to spawn healers. Heals the shield in place.",
      },
    ],
    defaultMechanicsConfig: {
      infiniteHealth: false,
      zukAttacks: true,
      zukSets: true,
      zukSetTimer: false,
      zukShieldSafeTiles: false,
      zukShieldStart: "random",
    },
    mechanicsToggles: [
      {
        key: "zukShieldStart",
        label: "Starting Shield Direction",
        setup: true,
        choices: [
          {
            value: "random",
            label: "Random",
          },
          {
            value: "left",
            label: "Left",
            icon: "left",
          },
          {
            value: "right",
            label: "Right",
            icon: "right",
          },
        ],
        info: "Left and right as seen facing Zuk. Applies from your next attempt.",
      },
      {
        key: "zukAttacks",
        label: "Zuk Attacks",
      },
      {
        key: "zukSets",
        label: "Mager/Ranger Sets",
        info: "Automatically spawns mager and ranger sets during the fight.",
      },
      {
        key: "zukSetTimer",
        label: "Set Timer",
        group: "aid",
        setup: true,
        info: "Manually track when the next set spawns.",
      },
      {
        key: "zukShieldSafeTiles",
        label: "Shield Safe Tiles",
        group: "aid",
        info: "Green shows shield coverage for the next tick. Your true tile must already be inside before Zuk checks; moving in afterward cannot block a blast already aimed at you. Zuk attacks only.",
      },
    ],
    debugActions: zukDebugActions,
  };
}
function buildInfernoControls() {
  const zukControls = buildZukControls();
  return {
    ...(zukControls.bossHpPresets
      ? {
          bossHpPresets: zukControls.bossHpPresets,
        }
      : {}),
    defaultMechanicsConfig: {
      ...zukControls.defaultMechanicsConfig,
      infiniteHealth: false,
      [infernoStartWaveKey]: String(69),
      [infernoPillarDestroyedKeys.west]: false,
      [infernoPillarDestroyedKeys.south]: false,
      [infernoPillarDestroyedKeys.northEast]: false,
      [infernoSpawnLayoutKey]: "",
      [infernoStartTileKey]: "",
    },
    mechanicsToggles: [
      {
        key: infernoStartWaveKey,
        label: "Start Wave",
        setup: true,
        choices: Array.from(
          {
            length: 69,
          },
          (unusedElement, index) => {
            const wave = 1 + index;
            return {
              value: String(wave),
              label: wave === 69 ? "69 · TzKal-Zuk" : String(wave),
            };
          },
        ),
        info: "The wave the run starts on. Clearing a wave continues into the next, through TzKal-Zuk on wave 69. Applies from your next attempt.",
      },
      {
        key: infernoPillarDestroyedKeys.west,
        label: "West Pillar Destroyed",
        setup: true,
        info: pillarDestroyedToggleInfo,
      },
      {
        key: infernoPillarDestroyedKeys.south,
        label: "South Pillar Destroyed",
        setup: true,
        info: pillarDestroyedToggleInfo,
      },
      {
        key: infernoPillarDestroyedKeys.northEast,
        label: "North-East Pillar Destroyed",
        setup: true,
        info: pillarDestroyedToggleInfo,
      },
      ...zukControls.mechanicsToggles.map(buildZukSectionToggle),
    ],
    debugActions: [
      ...infernoWaveDebugActions.map((debugAction) => {
        if (debugAction.command.type === "retry-wave") {
          return debugAction;
        } else {
          const commandType = debugAction.command.type;
          return {
            ...debugAction,
            visibleInPractice: ({ encounterSnapshot: encounterSnapshot }) =>
              getInfernoSpawnCommandType(encounterSnapshot) === commandType,
          };
        }
      }),
      ...zukControls.debugActions.map((debugAction) => ({
        ...debugAction,
        visibleInPractice: isZukPracticeStage,
      })),
    ],
  };
}
export { infernoStartWaveKey, infernoSpawnLayoutKey, infernoStartTileKey, infernoPinnedWaveKey, infernoPillarDestroyedKeys, getInfernoSetup, buildInfernoControls };
