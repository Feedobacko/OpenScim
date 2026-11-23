import { solArenaBounds, colosseumSpotAnimIds, isSolArenaTile } from "./constants.js";
var getSandTileKey = (tile) => `${tile[0]},${tile[1]}`;
var MoltenSand = class {
  // A struck tile burns, which is what hurts, from 3 ticks after the strike.
  // It is a pool, which is what the snapshot shows, from 5 ticks after.
  pools = new Map();
  burning = new Set();
  pending = [];
  clear() {
    this.pools.clear();
    this.burning.clear();
    this.pending = [];
  }
  getPoolTiles() {
    return [...this.pools.keys()].map((tileKey) => tileKey.split(",").map(Number));
  }
  // Also removes the pools formed on or after `tick`; their tiles stay in
  // `burning`.
  cancelPendingStrikes(tick) {
    this.pending = [];
    for (const [tileKey, formedTick] of this.pools) {
      if (formedTick >= tick) {
        this.pools.delete(tileKey);
      }
    }
  }
  hasPoolAt(tile) {
    return this.pools.has(getSandTileKey(tile));
  }
  strike(centreTile, tileCount, strikeTick, random, includeCentre = true) {
    const tiles = [];
    const chosenKeys = new Set();
    const addTile = (tile) => {
      const tileKey = getSandTileKey(tile);
      if (!chosenKeys.has(tileKey) && !this.burning.has(tileKey) && !!isSolArenaTile(tile, solArenaBounds)) {
        chosenKeys.add(tileKey);
        tiles.push(tile);
      }
    };
    let randomTileCount = tileCount;
    if (includeCentre) {
      addTile([centreTile[0], centreTile[1]]);
      randomTileCount--;
    }
    for (let i = 0; i < randomTileCount; i++) {
      addTile([centreTile[0] - 4 + Math.floor(random() * 9), centreTile[1] - 4 + Math.floor(random() * 9)]);
    }
    for (const tile of tiles) {
      this.pending.push({
        key: getSandTileKey(tile),
        strikeTick: strikeTick,
      });
    }
    return {
      tiles: tiles,
      tick: strikeTick,
    };
  }
  advance(tick) {
    for (const pendingTile of this.pending) {
      if (tick >= pendingTile.strikeTick + 3) {
        this.burning.add(pendingTile.key);
      }
      if (tick >= pendingTile.strikeTick + 5 && !this.pools.has(pendingTile.key)) {
        this.pools.set(pendingTile.key, pendingTile.strikeTick + 5);
      }
    }
    this.pending = this.pending.filter((pendingTile) => tick < pendingTile.strikeTick + 5);
  }
  resolve(context) {
    if (this.burning.has(getSandTileKey(context.playerPos))) {
      return [
        {
          baseDamage: [6, 8],
          attackType: "typeless",
          source: "SolMoltenSand",
          playerPosition: [...context.playerPos],
        },
      ];
    } else {
      return [];
    }
  }
};
function buildSandStrikeVisualEvent(strike) {
  return {
    type: "colosseum_visual",
    animations: [],
    graphics: strike.tiles.map(([x, y]) => ({
      spotAnimId: colosseumSpotAnimIds.sunfireLightning,
      position: [x, y],
      delayCycles: 30,
    })),
  };
}
export { MoltenSand, buildSandStrikeVisualEvent };
