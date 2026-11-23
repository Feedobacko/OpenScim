// Cache sprites (index 8) to RGBA, and the small PNG codec the asset tools
// need: the fetcher writes sprites as PNG, and --check compares pixels,
// because a re-encoded PNG never matches the byte hash of the original file.
import zlib from "node:zlib";
import crypto from "node:crypto";

// One group is a sheet of frames sharing a palette. Layout, from the end:
// u16 frame count; before it u16 canvas width, u16 canvas height, u8 palette
// size - 1, then per frame u16 x[], y[], width[], height[]; before those the
// palette (3 bytes each, entry 0 is implicit and transparent). Frame data
// starts at 0: u8 flags (1 = column order, 2 = alpha plane follows), palette
// indexes, optional alpha plane.
// Returns [{ width, height, x, y, canvasWidth, canvasHeight, rgba }].
export function decodeSprites(data) {
  const count = data.readUInt16BE(data.length - 2);
  const header = data.length - 7 - count * 8;
  const canvasWidth = data.readUInt16BE(header);
  const canvasHeight = data.readUInt16BE(header + 2);
  const paletteSize = data[header + 4] + 1;
  const field = (n, i) => data.readUInt16BE(header + 5 + (n * count + i) * 2);
  const palette = new Uint32Array(paletteSize);
  for (let i = 1, p = header - (paletteSize - 1) * 3; i < paletteSize; i++, p += 3)
    palette[i] = data.readUIntBE(p, 3) || 1; // the client keeps 0 for "transparent", so black becomes 0x000001
  const frames = [];
  for (let i = 0, at = 0; i < count; i++) {
    const width = field(2, i);
    const height = field(3, i);
    const size = width * height;
    const flags = data[at++];
    const cell = flags & 1 ? (j) => Math.floor(j / height) + (j % height) * width : (j) => j;
    const rgba = Buffer.alloc(size * 4);
    for (let j = 0; j < size; j++) {
      const index = data[at + j];
      const alpha = flags & 2 ? data[at + size + j] : index ? 255 : 0;
      rgba.writeUInt32BE(((palette[index] << 8) | alpha) >>> 0, cell(j) * 4);
    }
    at += flags & 2 ? size * 2 : size;
    frames.push({ width, height, x: field(0, i), y: field(1, i), canvasWidth, canvasHeight, rgba });
  }
  return frames;
}

// The frame at its offset on the sheet's canvas (how the game positions it).
export function onCanvas({ width, height, x, y, canvasWidth, canvasHeight, rgba }) {
  const out = Buffer.alloc(canvasWidth * canvasHeight * 4);
  for (let row = 0; row < height; row++) rgba.copy(out, ((row + y) * canvasWidth + x) * 4, row * width * 4, (row + 1) * width * 4);
  return { width: canvasWidth, height: canvasHeight, rgba: out };
}

// What two images must agree on to count as the same picture.
export const pixelHash = ({ width, height, rgba }) =>
  crypto.createHash("sha256").update(width + "x" + height + ":").update(rgba).digest("hex");

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function encodePng({ width, height, rgba }) {
  const chunk = (type, body) => {
    const out = Buffer.alloc(body.length + 12);
    out.writeUInt32BE(body.length);
    out.write(type, 4, "latin1");
    body.copy(out, 8);
    out.writeUInt32BE(zlib.crc32(out.subarray(4, out.length - 4)), out.length - 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8 bits per channel, RGBA, no interlace
  const rows = Buffer.alloc(height * (width * 4 + 1)); // filter byte 0 before every row
  for (let y = 0; y < height; y++) rgba.copy(rows, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([SIGNATURE, chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Any non-interlaced PNG of up to 8 bits per channel to { width, height, rgba }.
export function decodePng(bytes) {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG");
  let header, palette, transparency;
  const data = [];
  for (let at = 8; at < bytes.length; ) {
    const length = bytes.readUInt32BE(at);
    const type = bytes.toString("latin1", at + 4, at + 8);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === "IHDR") header = body;
    else if (type === "PLTE") palette = body;
    else if (type === "tRNS") transparency = body;
    else if (type === "IDAT") data.push(body);
    at += length + 12;
  }
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const depth = header[8];
  const colour = header[9];
  const channels = [1, 0, 3, 1, 2, 0, 4][colour];
  if (!channels || depth > 8 || header[12]) throw new Error("unsupported PNG (colour type " + colour + ", depth " + depth + ", interlace " + header[12] + ")");
  const bpp = Math.max(1, (channels * depth) >> 3);
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(data));
  const rows = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? rows[y * stride + x - bpp] : 0;
      const b = y ? rows[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y ? rows[(y - 1) * stride + x - bpp] : 0;
      const paeth = () => {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
        return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      };
      const predicted = [0, a, b, (a + b) >> 1, 0][filter] + (filter === 4 ? paeth() : 0);
      rows[y * stride + x] = raw[y * (stride + 1) + 1 + x] + predicted;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  const sample = (y, i) => (depth === 8 ? rows[y * stride + i] : (rows[y * stride + ((i * depth) >> 3)] >> (8 - depth - ((i * depth) & 7))) & ((1 << depth) - 1));
  const scale = colour === 3 ? 1 : 255 / ((1 << depth) - 1);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const v = Array.from({ length: channels }, (_, c) => sample(y, x * channels + c));
      const o = (y * width + x) * 4;
      if (colour === 3) {
        palette.copy(rgba, o, v[0] * 3, v[0] * 3 + 3);
        rgba[o + 3] = transparency && v[0] < transparency.length ? transparency[v[0]] : 255;
      } else if (colour === 0 || colour === 4) {
        rgba.fill(v[0] * scale, o, o + 3);
        rgba[o + 3] = colour === 4 ? v[1] : transparency && transparency.readUInt16BE(0) === v[0] ? 0 : 255;
      } else {
        rgba.set(v, o);
        if (colour === 2) rgba[o + 3] = transparency && v.every((s, c) => transparency.readUInt16BE(c * 2) === s) ? 0 : 255;
      }
    }
  return { width, height, rgba };
}
