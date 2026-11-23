#!/usr/bin/env node
// Finds which cache sprite each unsourced PNG in manifest.json is, by decoding
// every frame of index 8 and comparing pixels (dimensions and RGBA must be
// equal; near matches do not count).
//
//   node tools/assets/match-sprites.mjs [--client client] [--cache .cache/assets] [--write]
//
// Prints one line per match; --write records them in the manifest as
// "sprite:8/group/frame[/canvas]" with the pixel hash fetch-assets.mjs checks.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { unpack, unzipCache } from "./cache.mjs";
import { decodePng, decodeSprites, onCanvas, pixelHash } from "./sprites.mjs";

const repo = path.resolve(import.meta.dirname, "../..");
const { values: opt } = parseArgs({
  options: {
    client: { type: "string", default: path.join(repo, "client") },
    cache: { type: "string", default: path.join(repo, ".cache", "assets") },
    write: { type: "boolean", default: false },
  },
});
const manifestFile = path.join(repo, "tools/assets/manifest.json");
let text = fs.readFileSync(manifestFile, "utf8");
const manifest = JSON.parse(text);
if (!manifest.sources.sprite?.sprites) throw new Error('manifest.json needs "sprite":{"cache":<id>,"sprites":true} in sources');
const zip = path.join(opt.cache, "openrs2-" + manifest.sources.sprite.cache + "-disk.zip");
const cache = await unzipCache(fs.readFileSync(zip)); // npm run assets downloads it

const sprites = new Map(); // pixel hash -> first "8/group/frame[/canvas]" that has those pixels
const groups = (await cache.load("idx8")).length / 6;
for (let group = 0; group < groups; group++) {
  const stored = await cache.group(8, group);
  if (!stored) continue;
  decodeSprites(await unpack(stored)).forEach((frame, i) => {
    const id = "8/" + group + "/" + i;
    for (const [image, name] of [[frame, id], [onCanvas(frame), id + "/canvas"]]) {
      const hash = pixelHash(image);
      if (!sprites.has(hash)) sprites.set(hash, name);
    }
  });
}

let matched = 0;
const candidates = manifest.files.filter((file) => !file.source && file.path.endsWith(".png"));
for (const file of candidates) {
  const bytes = fs.readFileSync(path.join(opt.client, file.path));
  const pixels = pixelHash(decodePng(bytes));
  const id = sprites.get(pixels);
  if (!id) continue;
  matched++;
  console.log(file.path + " = sprite:" + id);
  const line = JSON.stringify(file);
  if (!text.includes(line)) throw new Error("manifest.json is not one compact entry per line: " + file.path);
  text = text.replace(line, JSON.stringify({ path: file.path, pixels, source: "sprite:" + id }));
}
console.log(matched + " of " + candidates.length + " unsourced PNGs are cache sprites (" + sprites.size + " distinct pictures in index 8)");
if (opt.write) fs.writeFileSync(manifestFile, text);
