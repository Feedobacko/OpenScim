function isPackableTileCoordinate(coordinate) {
  return Number.isInteger(coordinate) && coordinate >= -8192 && coordinate < 57344;
}
function packTileCoordinates(x, y) {
  return (x + 8192) * 65536 + (y + 8192);
}
var WalkableTileLookup = class {
  packed = new Set();
  source;
  fullyPacked;
  constructor(tileKeys) {
    this.source = tileKeys;
    let fullyPacked = true;
    for (const tileKey of tileKeys) {
      const commaIndex = tileKey.indexOf(",");
      if (commaIndex < 0) {
        fullyPacked = false;
        continue;
      }
      const x = Number(tileKey.slice(0, commaIndex));
      const y = Number(tileKey.slice(commaIndex + 1));
      if (isPackableTileCoordinate(x) && isPackableTileCoordinate(y) && `${x},${y}` === tileKey) {
        this.packed.add(packTileCoordinates(x, y));
      } else {
        fullyPacked = false;
      }
    }
    this.fullyPacked = fullyPacked;
  }
  has(x, y) {
    if (isPackableTileCoordinate(x) && isPackableTileCoordinate(y)) {
      if (this.packed.has(packTileCoordinates(x, y))) {
        return true;
      }
      if (this.fullyPacked) {
        return false;
      }
    }
    return this.source.has(`${x},${y}`);
  }
};
var WalkableTileLookupCache = class {
  lookup = null;
  source = null;
  size = -1;
  rebuilds = 0;
  get revision() {
    return this.rebuilds;
  }
  get(tileKeys) {
    if (this.source !== tileKeys || this.size !== tileKeys.size || !this.lookup) {
      this.lookup = new WalkableTileLookup(tileKeys);
      this.source = tileKeys;
      this.size = tileKeys.size;
      this.rebuilds++;
    }
    return this.lookup;
  }
  clear() {
    this.lookup = null;
    this.source = null;
    this.size = -1;
    this.rebuilds++;
  }
};
var currentArenaConfig = {
  bounds: null,
  walkableTiles: null,
  collisionMap: null,
};
var arenaDefaultWalkable = true;
var arenaWalkableLookup = new WalkableTileLookupCache();
function setArenaConfig(arenaConfig, defaultWalkable = false) {
  currentArenaConfig = {
    bounds: arenaConfig.bounds,
    walkableTiles: arenaConfig.walkableTiles,
    collisionMap: arenaConfig.collisionMap,
  };
  if (!arenaConfig.walkableTiles) {
    arenaWalkableLookup.clear();
  }
  arenaDefaultWalkable = defaultWalkable;
}
function getArenaBounds() {
  return currentArenaConfig.bounds;
}
function getArenaWalkableTiles() {
  return currentArenaConfig.walkableTiles;
}
function isArenaTileWalkable(x, y) {
  const walkableTiles = currentArenaConfig.walkableTiles;
  if (walkableTiles) {
    return arenaWalkableLookup.get(walkableTiles).has(x, y);
  } else {
    return arenaDefaultWalkable;
  }
}
function isInsideArenaBounds(x, y) {
  if (currentArenaConfig.bounds) {
    return (
      x >= currentArenaConfig.bounds.minX &&
      x <= currentArenaConfig.bounds.maxX &&
      y >= currentArenaConfig.bounds.minY &&
      y <= currentArenaConfig.bounds.maxY
    );
  } else {
    return arenaDefaultWalkable;
  }
}
function getArenaCollisionMap() {
  return currentArenaConfig.collisionMap;
}
function getCurrentArenaConfig() {
  const overrides = {};
  return {
    bounds: overrides.bounds === undefined ? currentArenaConfig.bounds : overrides.bounds,
    walkableTiles:
      overrides.walkableTiles === undefined ? currentArenaConfig.walkableTiles : overrides.walkableTiles,
    collisionMap:
      overrides.collisionMap === undefined ? currentArenaConfig.collisionMap : overrides.collisionMap,
  };
}
function getArenaDefaultWalkable() {
  return arenaDefaultWalkable;
}
var registeredArenaConfigs = new Map();
function registerArenaConfig(encounterKind, arenaConfig) {
  registeredArenaConfigs.set(encounterKind, arenaConfig);
}
function getRegisteredArenaConfig(encounterKind) {
  return registeredArenaConfigs.get(encounterKind) ?? null;
}
export {
  WalkableTileLookupCache,
  setArenaConfig,
  getArenaBounds,
  getArenaWalkableTiles,
  isArenaTileWalkable,
  isInsideArenaBounds,
  getArenaCollisionMap,
  getCurrentArenaConfig,
  getArenaDefaultWalkable,
  registerArenaConfig,
  getRegisteredArenaConfig,
};
