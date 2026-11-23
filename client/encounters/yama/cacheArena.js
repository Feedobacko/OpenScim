// The arena the cache loader built from the map (client/assets/player.js
// sets it). YamaEncounter.getArenaConfig prefers it to an empty one.
var arenaConfigFromCache = null;
function setArenaConfigFromCache(arenaConfig) {
  arenaConfigFromCache = arenaConfig;
}
export { arenaConfigFromCache, setArenaConfigFromCache };
