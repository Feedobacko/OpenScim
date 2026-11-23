// Whether the sandbox's run may tick: it waits for "Start encounter" after
// every new run and restart, and the player may pause it. The application's
// tick loop asks the encounter (`isPaused`, assets/Grid.js); the engine
// itself never does, so a replay rebuild or the determinism harness ticks
// as always. While the run is held no tick happens at all, so nothing here
// reaches a replay or the determinism digests.
export const sandboxClock = { state: "waiting" };

export const isSandboxHeld = () => sandboxClock.state !== "running";
export function holdSandboxForStart() {
  sandboxClock.state = "waiting";
}
export function startSandbox() {
  sandboxClock.state = "running";
}
export function toggleSandboxPause() {
  sandboxClock.state = sandboxClock.state === "running" ? "paused" : "running";
}
