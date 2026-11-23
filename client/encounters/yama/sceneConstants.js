var detonatedDeathCause = "detonated";
var yamaBasePosition = [29, 28];
function isYamaSealedRow(y) {
  return y <= 19;
}
var yamaSpawnFireballCommand = {
  encounter: "yama_p3",
  type: "spawn-fireball",
};
var yamaSpawnVoidFlareCommand = {
  encounter: "yama_p3",
  type: "spawn-void-flare",
};
export {
  detonatedDeathCause,
  yamaBasePosition,
  isYamaSealedRow,
  yamaSpawnFireballCommand,
  yamaSpawnVoidFlareCommand,
};
