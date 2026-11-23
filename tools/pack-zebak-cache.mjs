import fs from "node:fs/promises";
const dir = "evidence/zebak-groups";
const parts = [];
for (const file of (await fs.readdir(dir)).sort()) {
  const group = file.match(/^(\d+)-(\d+)\.dat$/);
  if (!group) continue;
  const bytes = await fs.readFile(dir + "/" + file);
  const header = Buffer.alloc(9);
  header.writeUInt8(Number(group[1]));
  header.writeUInt32BE(Number(group[2]), 1);
  header.writeUInt32BE(bytes.length, 5);
  parts.push(header, bytes);
}
await fs.writeFile(
  "client/toa/zebak/room-groups.bin",
  Buffer.concat(parts),
);
