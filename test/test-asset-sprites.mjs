// Sprite decoder and PNG codec behind tools/fetch-assets.mjs, on a hand-built
// sheet, so it needs neither the game cache nor a browser.
import assert from "node:assert/strict";
import test from "node:test";
import { decodePng, decodeSprites, encodePng, onCanvas, pixelHash } from "../tools/assets/sprites.mjs";

test("sprite sheet: row order, column order with alpha plane, canvas placement, PNG round trip", () => {
  const sheet = Buffer.from([
    0, 1, 0, // frame 0: row order, palette indexes
    3, 1, 2, 0, 1, 255, 128, 7, 255, // frame 1: column order + alpha; indexes, then alphas
    0xff, 0, 0, 0, 0, 0, // palette entries 1 (red) and 2 (black)
    0, 4, 0, 3, 2, // canvas 4x3, palette size - 1
    0, 1, 0, 2, // x offsets
    0, 0, 0, 1, // y offsets
    0, 2, 0, 2, // widths
    0, 1, 0, 2, // heights
    0, 2, // frame count
  ]);
  const [rows, columns] = decodeSprites(sheet);
  assert.deepEqual([...rows.rgba], [255, 0, 0, 255, 0, 0, 0, 0], "index 0 is transparent");
  // Read down the columns: (0,0)=red (0,1)=black (1,0)=index 0 (1,1)=red. Black is stored as 0x000001.
  assert.deepEqual([...columns.rgba], [255, 0, 0, 255, 0, 0, 0, 7, 0, 0, 1, 128, 255, 0, 0, 255]);

  const canvas = onCanvas(columns);
  assert.deepEqual([canvas.width, canvas.height], [4, 3]);
  const at = (x, y) => [...canvas.rgba.subarray((y * 4 + x) * 4, (y * 4 + x) * 4 + 4)];
  assert.deepEqual(at(2, 1), [255, 0, 0, 255], "frame lands at its x/y offset");
  assert.deepEqual(at(2, 2), [0, 0, 1, 128]);
  assert.deepEqual(at(0, 0), [0, 0, 0, 0]);

  const png = decodePng(encodePng(canvas));
  assert.equal(pixelHash(png), pixelHash(canvas));
  assert.notEqual(pixelHash(png), pixelHash(columns));
});
