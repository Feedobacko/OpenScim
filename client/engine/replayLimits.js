var ReplaySafetyError = class extends Error {
  constructor(reason, details = {}) {
    super(reason);
    this.reason = reason;
    this.details = details;
    this.name = "ReplaySafetyError";
  }
};
var projectileWorkLimit = 262144;
var projectileGeometryLimit = 128000000;
var snapshotNpcLimit = 1024;
var snapshotGroundItemLimit = 2048;
var snapshotWorkLimit = 131072;
var snapshotFootprintLimit = 65536;
var totalSnapshotFootprintLimit = 4194304;
function isSafeReplayCycle(cycle) {
  return (
    Number.isSafeInteger(cycle) && cycle >= 0 && Number.isSafeInteger((cycle + 30) * 20)
  );
}
function isSafeReplayPosition(position) {
  return (
    Array.isArray(position) &&
    position.length === 2 &&
    position.every(
      (coordinate) =>
        typeof coordinate == "number" && Number.isFinite(coordinate) && Math.abs(coordinate) <= 1000000,
    )
  );
}
function isSafeReplaySize(size) {
  return typeof size == "number" && Number.isInteger(size) && size > 0 && size <= 64;
}
export { ReplaySafetyError, projectileWorkLimit, projectileGeometryLimit, snapshotNpcLimit, snapshotGroundItemLimit, snapshotWorkLimit, snapshotFootprintLimit, totalSnapshotFootprintLimit, isSafeReplayCycle, isSafeReplayPosition, isSafeReplaySize };
