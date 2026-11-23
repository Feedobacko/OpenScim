var getOccupancyTileKey = (x, y) => (x + 32768) * 65536 + (y + 32768);
function doesActorBlockNpcMovement(actor) {
  return actor.blocksNpcMovement !== false;
}
var OccupancyMap = class {
  flags = new Set();
  flagged = new Map();
  clear() {
    this.flags.clear();
    this.flagged.clear();
  }
  isBlocked(x, y) {
    return this.flags.has(getOccupancyTileKey(x, y));
  }
  add(actor) {
    if (doesActorBlockNpcMovement(actor)) {
      this.remove(actor);
      this.enter(actor, actor.position);
    }
  }
  remove(actor) {
    const footprint = this.flagged.get(actor);
    if (footprint) {
      this.mark(footprint, false);
      this.flagged.delete(actor);
    }
  }
  syncActors(actors) {
    const presentActors = new Set();
    for (const actor of actors) {
      presentActors.add(actor);
      const footprint = this.flagged.get(actor);
      if (doesActorBlockNpcMovement(actor)) {
        if (
          !footprint ||
          footprint.x !== actor.position[0] ||
          footprint.y !== actor.position[1] ||
          footprint.size !== actor.size
        ) {
          this.add(actor);
        }
      } else {
        this.remove(actor);
      }
    }
    for (const flaggedActor of [...this.flagged.keys()]) {
      if (!presentActors.has(flaggedActor)) {
        this.remove(flaggedActor);
      }
    }
    return this;
  }
  step(actor, fromTile, stepTile) {
    if (!doesActorBlockNpcMovement(actor)) {
      return;
    }
    this.mark(
      {
        x: fromTile[0],
        y: fromTile[1],
        size: actor.size,
      },
      false,
    );
    const footprint = this.flagged.get(actor);
    if (!!footprint && (footprint.x !== fromTile[0] || footprint.y !== fromTile[1] || footprint.size !== actor.size)) {
      this.mark(footprint, false);
    }
    this.enter(actor, stepTile);
  }
  enter(actor, tile) {
    const footprint = {
      x: tile[0],
      y: tile[1],
      size: actor.size,
    };
    this.mark(footprint, true);
    this.flagged.set(actor, footprint);
  }
  mark({ x: x, y: y, size: size }, blocked) {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (blocked) {
          this.flags.add(getOccupancyTileKey(x + dx, y + dy));
        } else {
          this.flags.delete(getOccupancyTileKey(x + dx, y + dy));
        }
      }
    }
  }
};
function createOccupancyStepCheck(occupancy) {
  return (fromTile, toTile, size) => {
    const dx = toTile[0] - fromTile[0];
    const dy = toTile[1] - fromTile[1];
    if (dx === 0 && dy === 0) {
      return false;
    }
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      return false;
    }
    const isFree = (x, y) => !occupancy.isBlocked(x, y);
    if (dx !== 0) {
      const leadingX = dx > 0 ? toTile[0] + size - 1 : toTile[0];
      for (let offset = 0; offset < size; offset++) {
        if (!isFree(leadingX, toTile[1] + offset)) {
          return false;
        }
      }
    }
    if (dy !== 0) {
      const leadingY = dy > 0 ? toTile[1] + size - 1 : toTile[1];
      for (let offset = 0; offset < size; offset++) {
        if (!isFree(toTile[0] + offset, leadingY)) {
          return false;
        }
      }
    }
    return size !== 1 || dx === 0 || dy === 0 || (isFree(toTile[0], fromTile[1]) && isFree(fromTile[0], toTile[1]));
  };
}
export { OccupancyMap, createOccupancyStepCheck };
