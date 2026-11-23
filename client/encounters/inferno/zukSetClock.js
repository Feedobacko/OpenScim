// When Zuk's sets (a ranger and a mager) spawn. `advance` is called once a
// tick and answers true on the tick a set is due; the clock counts down only
// while the sets are enabled. Its phases:
//   "opening"      72 ticks to the first set
//   "running"      350 ticks from one set to the next
//   "paused"       Zuk is under 600 hitpoints and Jad has not spawned: the
//                  clock stands still
//   "post-jad"     Jad has spawned: the clock runs again, with 175 ticks added
//   "stopped"      stop() was called: no more sets
//   "unsupported"  the hitpoints went back above 600 while the clock was
//                  paused: no more sets until reset()
// A clock that leaves "opening" before its first set (Zuk under 600, or Jad
// there) gets 278 ticks more: with the opening's 72 that is one interval of
// 350.
var ZukSetClock = class {
  clock = {
    phase: "opening",
    remaining: 72,
  };
  reset() {
    this.clock = {
      phase: "opening",
      remaining: 72,
    };
  }
  stop() {
    this.clock = {
      phase: "stopped",
    };
  }
  advance(bossHp, jadSpawned, setsEnabled) {
    const clock = this.clock;
    switch (clock.phase) {
      case "unsupported":
      case "stopped":
        return false;
      case "opening":
      case "running": {
        const remainingAfterTick = clock.remaining - Number(setsEnabled);
        const remaining = clock.phase === "opening" && (jadSpawned || bossHp < 600) ? remainingAfterTick + 278 : remainingAfterTick;
        this.clock = jadSpawned
          ? {
              phase: "post-jad",
              remaining: remaining + 175,
            }
          : {
              phase: bossHp < 600 ? "paused" : clock.phase,
              remaining: remaining,
            };
        break;
      }
      case "paused":
        if (jadSpawned) {
          this.clock = {
            phase: "post-jad",
            remaining: clock.remaining + 175,
          };
        } else if (bossHp > 600) {
          this.clock = {
            phase: "unsupported",
          };
        }
        return false;
      case "post-jad":
        this.clock = {
          ...clock,
          remaining: clock.remaining - Number(setsEnabled),
        };
        break;
      default:
        return throwUnknownZukClock(clock);
    }
    if (!setsEnabled || this.clock.phase === "paused" || this.clock.remaining > 0) {
      return false;
    }
    this.clock = {
      phase: this.clock.phase === "opening" ? "running" : this.clock.phase,
      remaining: 350,
    };
    return true;
  }
  getSnapshot(setsActive) {
    if (!setsActive) {
      return {
        setTimer: null,
        timerPaused: false,
      };
    }
    const clock = this.clock;
    switch (clock.phase) {
      case "unsupported":
      case "stopped":
        return {
          setTimer: null,
          timerPaused: false,
        };
      case "opening":
      case "running":
      case "post-jad":
        return {
          setTimer: clock.remaining,
          timerPaused: false,
        };
      case "paused":
        return {
          setTimer: clock.remaining,
          timerPaused: true,
        };
      default:
        return throwUnknownZukClock(clock);
    }
  }
};
function throwUnknownZukClock(clock) {
  throw new TypeError(`Unknown Zuk clock: ${JSON.stringify(clock)}`);
}
export { ZukSetClock };
