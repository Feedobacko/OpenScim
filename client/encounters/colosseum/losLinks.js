// Links to los.colosim.com, the line-of-sight tool for the Colosseum, with
// the monsters and the player where they stand: what the RuneLite plugin
// Fortis Colosseum (github.com/LlemonDuck/fortis-colosseum, BSD 2-Clause;
// its LoS files "Copyright (c) 2025, Will Ediger") offers in its side panel.
// The address is built as the plugin builds it, from its description in
// .scratch/colo-plugin-notes.md; no code of the plugin is here.
//
// inferred, and not checked against the site: that a monster is named by its
// south-west tile there as here.

const address = "https://los.colosim.com/?";
// The plugin's ids of the monsters; a shaman that came as a reinforcement has one of its own.
const monsterIds = { shaman: 1, javelin: 2, jaguar: 3, manticore: 4, minotaur: 5, shockwave: 6 };
const reinforcementShamanId = 7;
const orbCodes = { magic: "m", range: "r", melee: "M" };
// The plugin: x is the tile's x less that of the tile 8 west of the
// south-west pillar, and y is 33 less the same for y, growing south. The
// south-west pillar stands at 24,26 here.
const toLosTile = ([x, y]) => [x - 16, 51 - y];
const twoDigits = (value) => String(value).padStart(2, "0");

/**
 * The link for `monsters`, each { kind, position, isReinforcement, orbOrder
 * }, `orbOrder` being a manticore's order of orbs or null while it has
 * none, and the player on `playerTile`. `isWaveStart` marks the link as a
 * wave's first tick; `mantimayhem` is the level of that modifier.
 */
export function buildLosLink(monsters, playerTile, { isWaveStart = false, mantimayhem = 0 } = {}) {
  const parts = monsters
    .filter((monster) => monsterIds[monster.kind] !== undefined)
    .map((monster) => {
      const [x, y] = toLosTile(monster.position);
      const id = monster.kind === "shaman" && monster.isReinforcement ? reinforcementShamanId : monsterIds[monster.kind];
      let orbs = "";
      if (monster.kind === "manticore") {
        // A manticore without an order is "u", uncharged. With melee last
        // the first orb tells the order; else the first two do.
        const order = monster.orbOrder;
        orbs = !order ? "u" : orbCodes[order[0]] + (order[2] === "melee" ? "" : orbCodes[order[1]]);
      }
      return `${twoDigits(x)}${twoDigits(y)}${id}${orbs}.`;
    });
  const [playerX, playerY] = toLosTile(playerTile);
  return `${address}${parts.join("")}#${playerX + 256 * playerY}${isWaveStart ? "_ws" : ""}${mantimayhem >= 3 ? "_mm3" : ""}`;
}
