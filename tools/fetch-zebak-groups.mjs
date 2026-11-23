import fs from "node:fs/promises";
const dir = "evidence/zebak-groups";
await fs.mkdir(dir, { recursive: true });
for (const pair of [
  [5, 15700],
  [7, 46399],
  // Tumeken's Light, including its player and spot animation dependencies.
  [7, 24153],
  [0, 11779],
  [0, 12298],
  [1, 1406],
]) {
  const [archive, group] = pair;
  const r = await fetch(
    "https://archive.openrs2.org/caches/runescape/2762/archives/" +
      archive +
      "/groups/" +
      group +
      ".dat",
  );
  if (!r.ok) throw Error("group " + pair + " HTTP " + r.status);
  await fs.writeFile(
    dir + "/" + archive + "-" + group + ".dat",
    Buffer.from(await r.arrayBuffer()),
  );
}
