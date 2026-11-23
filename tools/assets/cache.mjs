// Reads the OSRS cache (main_file_cache.dat2 / .idxN inside an OpenRS2
// disk.zip) from Node. Shared by fetch-assets.mjs and the asset tools.
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { createRequire } from "node:module";
import JSZip from "jszip";

export const SECTOR = 520;

// Raw stored bytes of one group (the js5 container, usually followed by a
// 2-byte version), or null when the idx has no entry for it.
export function readGroup(dat, idx, archive, group) {
  if (group * 6 + 6 > idx.length) return null;
  const size = idx.readUIntBE(group * 6, 3);
  let sector = idx.readUIntBE(group * 6 + 3, 3);
  if (!size || !sector) return null;
  const header = group > 0xffff ? 10 : 8;
  const data = Buffer.alloc(size);
  for (let done = 0, chunk = 0; done < size; chunk++) {
    const at = sector * SECTOR;
    const id = header === 10 ? dat.readUInt32BE(at) : dat.readUInt16BE(at);
    if (id !== group || dat.readUInt16BE(at + header - 6) !== chunk || dat[at + header - 1] !== archive)
      throw new Error("corrupt sector chain at archive " + archive + " group " + group);
    done += dat.copy(data, done, at + header, at + Math.min(SECTOR, header + size - done));
    sector = dat.readUIntBE(at + header - 4, 3);
  }
  return data;
}

// The container without the version trailer; this is what OpenRS2 serves as
// /archives/{archive}/groups/{group}.dat.
export const container = (stored) => stored.subarray(0, 5 + stored.readUInt32BE(1) + (stored[0] ? 4 : 0));

let bzip2;
// The client's own decoder: client/bzip2-module.js is a CommonJS emscripten
// build of @foxglove/wasm-bz2, so it is evaluated with a module object.
async function bunzip2(data, size) {
  bzip2 ??= (async () => {
    const dir = path.resolve(import.meta.dirname, "../../client");
    const module = { exports: {} };
    const source = await fs.readFile(path.join(dir, "bzip2-module.js"), "utf8");
    new Function("module", "exports", "require", "__dirname", source)(module, module.exports, createRequire(import.meta.url), dir);
    return module.exports({ wasmBinary: await fs.readFile(path.join(dir, "bzip2.wasm")) });
  })();
  const bz = await bzip2;
  const source = bz._malloc(data.length + 4);
  const target = bz._malloc(size);
  bz.HEAPU8.set([0x42, 0x5a, 0x68, 0x31], source); // "BZh1": the cache strips the stream header
  bz.HEAPU8.set(data, source + 4);
  try {
    const { code, error, buffer } = bz.decompress(target, size, source, data.length + 4, 0);
    if (code !== 0 || !buffer) throw new Error("bzip2 failed: " + code + " " + (error ?? ""));
    return Buffer.from(buffer);
  } finally {
    bz._free(source);
    bz._free(target);
  }
}

// The decompressed payload of a stored group.
export async function unpack(stored) {
  const length = stored.readUInt32BE(1);
  if (stored[0] === 0) return stored.subarray(5, 5 + length);
  const data = stored.subarray(9, 9 + length);
  if (stored[0] === 1) return bunzip2(data, stored.readUInt32BE(5));
  if (stored[0] === 2) return zlib.gunzipSync(data);
  throw new Error("unknown container compression " + stored[0]);
}

export async function unzipCache(zipBytes) {
  const zip = await JSZip.loadAsync(zipBytes);
  const files = new Map();
  for (const entry of Object.values(zip.files)) {
    const name = entry.name.split("/").pop();
    if (!entry.dir && name.startsWith("main_file_cache.")) files.set(name.slice(16), entry);
  }
  const loaded = new Map();
  const load = async (name) => {
    if (!loaded.has(name)) loaded.set(name, files.has(name) ? await files.get(name).async("nodebuffer") : null);
    return loaded.get(name);
  };
  return {
    load,
    async group(archive, group) {
      const idx = await load("idx" + archive);
      return idx && readGroup(await load("dat2"), idx, archive, group);
    },
  };
}
