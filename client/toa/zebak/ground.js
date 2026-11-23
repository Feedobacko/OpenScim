export function effectiveGround(map, locations) {
  // Bridge bit on plane one lowers the collision plane of every object at that tile.
  const bridges = map.tileRenderFlags[1];
  const surface = (x, y) => (bridges[x][y] & 2 ? 1 : 0);
  const select = (layers) =>
    layers[0].map((column, x) =>
      column.map((_, y) => layers[surface(x, y)][x][y]),
    );
  const underlays = select(map.tileUnderlays);
  const flags = select(map.tileRenderFlags);
  for (let x = 0; x < 64; x++)
    for (let y = 0; y < 64; y++) {
      const plane = surface(x, y);
      if (!underlays[x][y] && map.tileOverlays[plane][x][y])
        underlays[x][y] = 1;
    }
  return {
    map: { ...map, tileRenderFlags: [flags], tileUnderlays: [underlays] },
    locations: {
      locations: locations
        .filter((loc) => loc.level === surface(loc.localX, loc.localY))
        .map((loc) => ({ ...loc, level: 0 })),
    },
  };
}
