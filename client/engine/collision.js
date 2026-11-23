var CollisionFlag = class {
  static WALL_NORTH_WEST = 1;
  static WALL_NORTH = 2;
  static WALL_NORTH_EAST = 4;
  static WALL_EAST = 8;
  static WALL_SOUTH_EAST = 16;
  static WALL_SOUTH = 32;
  static WALL_SOUTH_WEST = 64;
  static WALL_WEST = 128;
  static OBJECT = 256;
  static WALL_NORTH_WEST_PROJECTILE_BLOCKER = 512;
  static WALL_NORTH_PROJECTILE_BLOCKER = 1024;
  static WALL_NORTH_EAST_PROJECTILE_BLOCKER = 2048;
  static WALL_EAST_PROJECTILE_BLOCKER = 4096;
  static WALL_SOUTH_EAST_PROJECTILE_BLOCKER = 8192;
  static WALL_SOUTH_PROJECTILE_BLOCKER = 16384;
  static WALL_SOUTH_WEST_PROJECTILE_BLOCKER = 32768;
  static WALL_WEST_PROJECTILE_BLOCKER = 65536;
  static OBJECT_PROJECTILE_BLOCKER = 131072;
  static FLOOR_DECORATION = 262144;
  static BLOCK_NPCS = 524288;
  static BLOCK_PLAYERS = 1048576;
  static FLOOR = 2097152;
  static OCCUPIED_NPC = 8388608;
  static OCCUPIED_PLAYER = 16777216;
  static OCCUPIED_PROJECTILE_BLOCKER = 33554432;
  static FLOOR_BLOCKED = this.FLOOR | this.FLOOR_DECORATION;
  static OCCUPIED_ENTITY = this.OCCUPIED_NPC | this.OCCUPIED_PLAYER;
  static BLOCK_WEST = this.WALL_EAST | this.OBJECT | this.FLOOR_BLOCKED;
  static BLOCK_EAST = this.WALL_WEST | this.OBJECT | this.FLOOR_BLOCKED;
  static BLOCK_SOUTH = this.WALL_NORTH | this.OBJECT | this.FLOOR_BLOCKED;
  static BLOCK_NORTH = this.WALL_SOUTH | this.OBJECT | this.FLOOR_BLOCKED;
  static BLOCK_SOUTH_WEST = this.WALL_NORTH |
    this.WALL_NORTH_EAST |
    this.WALL_EAST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_SOUTH_EAST = this.WALL_NORTH_WEST |
    this.WALL_NORTH |
    this.WALL_WEST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_NORTH_WEST = this.WALL_EAST |
    this.WALL_SOUTH_EAST |
    this.WALL_SOUTH |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_NORTH_EAST = this.WALL_SOUTH |
    this.WALL_SOUTH_WEST |
    this.WALL_WEST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_NORTH_AND_SOUTH_EAST = this.WALL_NORTH |
    this.WALL_NORTH_EAST |
    this.WALL_EAST |
    this.WALL_SOUTH_EAST |
    this.WALL_SOUTH |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_NORTH_AND_SOUTH_WEST = this.WALL_NORTH_WEST |
    this.WALL_NORTH |
    this.WALL_SOUTH |
    this.WALL_SOUTH_WEST |
    this.WALL_WEST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_NORTH_EAST_AND_WEST = this.WALL_NORTH_WEST |
    this.WALL_NORTH |
    this.WALL_NORTH_EAST |
    this.WALL_EAST |
    this.WALL_WEST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_SOUTH_EAST_AND_WEST = this.WALL_EAST |
    this.WALL_SOUTH_EAST |
    this.WALL_SOUTH |
    this.WALL_SOUTH_WEST |
    this.WALL_WEST |
    this.OBJECT |
    this.FLOOR_BLOCKED;
  static BLOCK_WEST_PROJECTILE = this.WALL_EAST_PROJECTILE_BLOCKER | this.OBJECT_PROJECTILE_BLOCKER;
  static BLOCK_EAST_PROJECTILE = this.WALL_WEST_PROJECTILE_BLOCKER | this.OBJECT_PROJECTILE_BLOCKER;
  static BLOCK_SOUTH_PROJECTILE = this.WALL_NORTH_PROJECTILE_BLOCKER | this.OBJECT_PROJECTILE_BLOCKER;
  static BLOCK_NORTH_PROJECTILE = this.WALL_SOUTH_PROJECTILE_BLOCKER | this.OBJECT_PROJECTILE_BLOCKER;
};
function createCollisionMap(sizeX, sizeY) {
  const flags = new Int32Array(sizeX * sizeY);
  return {
    sizeX: sizeX,
    sizeY: sizeY,
    flags: flags,
    getFlag: (x, y) => (x < 0 || x >= sizeX || y < 0 || y >= sizeY ? -1 : flags[x + y * sizeX]),
    hasFlag(x, y, mask) {
      const flag = this.getFlag(x, y);
      return flag !== -1 && (flag & mask) !== 0;
    },
    flag(x, y, mask) {
      if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
        flags[x + y * sizeX] |= mask;
      }
    },
    unflag(x, y, mask) {
      if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
        flags[x + y * sizeX] &= ~mask;
      }
    },
  };
}
export { CollisionFlag, createCollisionMap };
