function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 1831565813) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}
function hashInteger(integer) {
  let hash = integer >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 73244475) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 73244475) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}
export { createSeededRandom, hashInteger };
