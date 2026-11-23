import { cyclesPerTick } from "./timing.js";

// Cached NPCs 11742 and 11743 use the clickable-NPC walk speeds and have zero turn speed.
export class CloudMotion {
  waypoints = [];

  sample(tile, previousTile, tick, renderCycle) {
    const cycle = Math.floor(renderCycle);
    if (!this.position || tick < this.tick || tick > this.tick + 1 || cycle < this.cycle) {
      this.position = [...previousTile];
      this.target = [...previousTile];
      this.waypoints.length = 0;
      this.cycle = Math.min(tick * cyclesPerTick, cycle);
    }
    if (tile[0] !== this.target[0] || tile[1] !== this.target[1]) {
      this.advance(Math.min(tick * cyclesPerTick, cycle));
      this.target = [...tile];
      this.waypoints.push(this.target);
    }
    this.tick = tick;
    this.advance(cycle);
    return [...this.position];
  }

  advance(cycle) {
    while (this.cycle < cycle && this.waypoints.length) {
      const target = this.waypoints[0];
      const count = this.waypoints.length;
      const step = (count > 3 ? 8 : count > 2 ? 6 : 4) / 128;
      for (let axis = 0; axis < 2; axis++) {
        const delta = target[axis] - this.position[axis];
        this.position[axis] += Math.sign(delta) * Math.min(Math.abs(delta), step);
      }
      if (this.position[0] === target[0] && this.position[1] === target[1]) this.waypoints.shift();
      this.cycle++;
    }
    this.cycle = Math.max(this.cycle, cycle);
  }
}
