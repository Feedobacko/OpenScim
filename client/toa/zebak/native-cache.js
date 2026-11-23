export async function installRoomGroups(cache) {
  const response = await fetch("/toa/zebak/room-groups.bin");
  if (!response.ok) throw Error("Could not load Zebak cache groups");
  const bytes = new Uint8Array(await response.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const archives = new Map();
  for (let offset = 0; offset < bytes.length;) {
    const index = view.getUint8(offset),
      group = view.getUint32(offset + 1),
      length = view.getUint32(offset + 5);
    offset += 9;
    const data = bytes.subarray(offset, offset + length);
    let crc = -1;
    for (const value of data) {
      crc ^= value;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    if (
      data.length !== length ||
      ~crc >>> 0 !== cache.getIndex(index).Pm(group).crc >>> 0
    )
      throw Error("Zebak cache checksum mismatch " + index + "/" + group);
    if (!archives.has(index)) archives.set(index, new Map());
    archives.get(index).set(group, data);
    offset += length;
  }
  for (const [id, groups] of archives) {
    const archive = cache.getIndex(id),
      read = archive.read.bind(archive);
    archive.read = (group) => groups.get(group) ?? read(group);
  }
}
