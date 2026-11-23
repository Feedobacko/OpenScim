import { OccupancyMap } from "./occupancy.js";
function countPendingInputOps(player, opType) {
  return player.pendingInputOps.filter((inputOp) => inputOp.type === opType).length;
}
var WorldState = class {
  tick;
  actors;
  pendingHits;
  nextHitSequence;
  nextNpcProcessingOrder;
  areaEffects;
  groundItems;
  groundItemSeq;
  occupancy;
  constructor() {
    this.tick = 0;
    this.actors = new Map();
    this.pendingHits = [];
    this.nextHitSequence = 0;
    this.nextNpcProcessingOrder = 0;
    this.areaEffects = [];
    this.groundItems = [];
    this.groundItemSeq = 0;
    this.occupancy = new OccupancyMap();
  }
  allocateGroundItemId() {
    this.groundItemSeq += 1;
    return "gi-" + this.groundItemSeq;
  }
  registerNpc(npc) {
    npc.processingOrder = this.nextNpcProcessingOrder;
    this.nextNpcProcessingOrder += 1;
    this.actors.set(npc.id, npc);
    this.occupancy.add(npc);
  }
  removeActor(actorId) {
    const actor = this.actors.get(actorId);
    if (actor) {
      this.actors.delete(actorId);
      this.occupancy.remove(actor);
    }
  }
  getPlayer() {
    for (const actor of this.actors.values()) {
      if ("player" === actor.kind) {
        return actor;
      }
    }
    return null;
  }
  getPlayers() {
    const players = [];
    for (const actor of this.actors.values()) {
      if (actor.kind === "player") {
        players.push(actor);
      }
    }
    return players;
  }
  getNpc(actorId) {
    const actor = this.actors.get(actorId);
    if (actor && "npc" === actor.kind) {
      return actor;
    } else {
      return null;
    }
  }
  getNpcs() {
    const npcs = [];
    for (const actor of this.actors.values()) {
      if ("npc" === actor.kind) {
        npcs.push(actor);
      }
    }
    return npcs;
  }
  removePendingHitsFromSource(sourceId) {
    this.pendingHits = this.pendingHits.filter((pendingHit) => pendingHit.sourceId !== sourceId);
  }
};
export { countPendingInputOps, WorldState };
