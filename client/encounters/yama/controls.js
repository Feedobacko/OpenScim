import { yamaSpawnFireballCommand, yamaSpawnVoidFlareCommand } from "./sceneConstants.js";
import { noContract } from "./contracts.js";
function buildYamaControls(contract = noContract) {
  const defaultMechanicsConfig = {
    yamaMageRange: true,
    yamaMelee: true,
    waves: true,
    fireballs: true,
    fireballStart: "random",
    duoSide: "player1",
    voidFlares: true,
    yamaStartGlyphs: false,
    infiniteHealth: false,
    ...contract.defaultMechanicsConfig,
  };
  const mechanicsToggles = [
    {
      key: "yamaMageRange",
      label: "Yama Mage/Range",
    },
    {
      key: "yamaMelee",
      label: "Yama Melee",
    },
    {
      key: "waves",
      label: "Waves",
    },
    {
      key: "fireballs",
      label: "Fireballs",
    },
    {
      key: "duoSide",
      label: "Practice As",
      compactLabel: "Play as",
      setup: true,
      choices: [
        {
          value: "player1",
          label: "Player 1",
        },
        {
          value: "player2",
          label: "Player 2",
        },
      ],
      info: "Player 2's fireballs use the opposite diagonal.",
    },
    {
      key: "fireballStart",
      label: "Fireball Orientation",
      compactLabel: "Fireballs",
      setup: true,
      choices: [
        {
          value: "random",
          label: "Random",
        },
        {
          value: "horizontal",
          label: "Horizontal",
          icon: "fireball-line-horizontal",
        },
        {
          value: "vertical",
          label: "Vertical",
          icon: "fireball-line-vertical",
        },
      ],
      info: "Also applies to fireballs you spawn.",
    },
    {
      key: "voidFlares",
      label: "Void Flares",
    },
    // Read by the scene only (client/assets/rendering.js): nothing in this
    // directory uses it.
    {
      key: "yamaStartGlyphs",
      label: "Show Glyphs at Start",
      group: "aid",
      setup: true,
      info: [
        {
          text: "Shows the previous phase's glyphs. Yama's first P3 attack matches the northern pair: ",
        },
        {
          text: "purple",
          color: "#b58cd9",
        },
        {
          text: " = ranged, ",
        },
        {
          text: "orange",
          color: "#dd8d4b",
        },
        {
          text: " = magic. Not shown in-game; remember the northern glyphs from the previous phases instead.",
        },
      ],
    },
    ...(contract.mechanicsToggles ?? []),
  ];
  return {
    defaultMechanicsConfig: defaultMechanicsConfig,
    mechanicsToggles:
      contract.contractId === null ? mechanicsToggles : mechanicsToggles.filter(({ key: key }) => key !== "duoSide"),
    debugActions: [
      {
        command: yamaSpawnFireballCommand,
        label: "Spawn Fireball",
      },
      {
        command: yamaSpawnVoidFlareCommand,
        label: "Spawn Void Flare",
      },
    ],
    // Overlays of the scene; the encounter does not read them.
    debugFlags: [
      {
        key: "damageTiles",
        label: "Damage Tiles",
      },
      {
        key: "waveTiles",
        label: "Wave Tiles",
      },
      {
        key: "fireballDangerTiles",
        label: "Fireball Danger Tiles",
      },
    ],
  };
}
export { buildYamaControls };
