// The boundary of Sol Heredit's arena: 48 placements of six locs, twelve
// along each side (y 42, x 40, y 27, x 25, with `rotation` 0 to 3). The
// encounter's descriptor hands them to the arena's collision as
// `dynamicLocs` (encounters/registry.js); the scene in rendering.js builds a
// mesh from each.
var solBoundaryLocIds = [50753, 50754, 50755, 50756, 50757, 50758];
var solBoundaryLocs = [
  ...[4, 1, 1, 1, 4, 4, 2, 5, 2, 1, 1, 2].map((locNumber, index) => ({
    locId: solBoundaryLocIds[locNumber - 1],
    localX: 27 + index,
    localY: 42,
    rotation: 0,
    type: 10,
    level: 0,
  })),
  ...[4, 5, 4, 3, 6, 5, 2, 1, 1, 5, 6, 3].map((locNumber, index) => ({
    locId: solBoundaryLocIds[locNumber - 1],
    localX: 40,
    localY: 29 + index,
    rotation: 1,
    type: 10,
    level: 0,
  })),
  ...[6, 1, 1, 4, 1, 6, 1, 1, 1, 4, 4, 1].map((locNumber, index) => ({
    locId: solBoundaryLocIds[locNumber - 1],
    localX: 27 + index,
    localY: 27,
    rotation: 2,
    type: 10,
    level: 0,
  })),
  ...[1, 6, 1, 5, 2, 1, 2, 6, 6, 5, 4, 2].map((locNumber, index) => ({
    locId: solBoundaryLocIds[locNumber - 1],
    localX: 25,
    localY: 29 + index,
    rotation: 3,
    type: 10,
    level: 0,
  })),
];
export { solBoundaryLocs };
