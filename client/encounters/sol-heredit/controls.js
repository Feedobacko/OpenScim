import { getMonsterHitpoints } from "../../engine/monsterStats.js";
import { solHereditNpcTypeId } from "./constants.js";
import { solPhases } from "./phases.js";
var solHereditDebugActions = [
  {
    command: {
      encounter: "sol_heredit",
      type: "trigger-grapple",
    },
    label: "Trigger grapple",
  },
  {
    command: {
      encounter: "sol_heredit",
      type: "trigger-triple",
    },
    label: "Trigger triple attack",
  },
  {
    command: {
      encounter: "sol_heredit",
      type: "spawn-crystal",
    },
    label: "Add beam crystal",
  },
  {
    command: {
      encounter: "sol_heredit",
      type: "strike-sand",
    },
    label: "Strike molten sand",
  },
  {
    command: {
      encounter: "sol_heredit",
      type: "clear-sand",
    },
    label: "Clear molten sand",
  },
];
var solHereditAttackStyleKey = "solHereditAttackStyle";
function buildSolHereditControls() {
  const maxHp = getMonsterHitpoints(solHereditNpcTypeId);
  if (maxHp === undefined) {
    throw new TypeError("Missing Sol Heredit monster HP");
  }
  return {
    bossHpPresets: [
      {
        label: "Start",
        hp: maxHp,
        hint: "Spear and shield only.",
      },
      ...[
        {
          threshold: 0.9,
          hint: "Adds triple attack and beams.",
        },
        {
          threshold: 0.75,
          hint: "Adds grapple. Faster attacks.",
        },
        {
          threshold: 0.5,
          hint: "Harder triple attack.",
        },
        {
          threshold: 0.1,
          hint: "Enrage.",
        },
      ].map(({ threshold: threshold, hint: hint }) => {
        if (!solPhases.some((solPhase) => solPhase.threshold === threshold)) {
          throw new TypeError(`No Sol phase at ${threshold}`);
        }
        return {
          label: `${Math.round(threshold * 100)}%`,
          hp: Math.floor(maxHp * threshold),
          hint: hint,
        };
      }),
    ],
    defaultMechanicsConfig: {
      infiniteHealth: false,
      solHereditAttacks: true,
      solHereditSand: true,
      solHereditBeams: true,
      solHereditTelegraph: false,
      [solHereditAttackStyleKey]: "random",
    },
    mechanicsToggles: [
      {
        key: "solHereditAttacks",
        label: "Sol Attacks",
      },
      {
        key: solHereditAttackStyleKey,
        label: "Attack Style",
        dependsOn: "solHereditAttacks",
        setup: true,
        choices: [
          {
            value: "random",
            label: "Random",
          },
          {
            value: "spear",
            label: "Spear",
          },
          {
            value: "shield",
            label: "Shield",
          },
        ],
      },
      {
        key: "solHereditSand",
        label: "Molten Sand",
      },
      {
        key: "solHereditBeams",
        label: "Light Beams",
      },
      {
        key: "solHereditTelegraph",
        label: "Attack Telegraphs",
        group: "aid",
        info: "Shows where his next attack will land.",
      },
    ],
    debugActions: solHereditDebugActions,
    debugFlags: [
      {
        key: "beamDamageTiles",
        label: "Beam Damage Tiles",
      },
    ],
  };
}
export { solHereditAttackStyleKey, buildSolHereditControls };
