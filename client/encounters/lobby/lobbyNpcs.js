import { solHereditNpcTypeId } from "../sol-heredit/constants.js";
var lobbyNpcs = [
  {
    actorId: "lobby-npc-0",
    npcTypeId: 7706,
    position: [20, 30],
    facingAngle: 1712,
    available: true,
  },
  {
    actorId: "lobby-npc-1",
    npcTypeId: 14176,
    position: [30, 36],
    facingAngle: 0,
    available: true,
  },
  {
    actorId: "lobby-npc-2",
    npcTypeId: solHereditNpcTypeId,
    position: [40, 30],
    facingAngle: 336,
    available: true,
  },
  // The others stand on a ring about 11.7 tiles from the platform's centre
  // (31.5, 25.5), on spokes 8.5 degrees off a pillar (Sol 31, Yama 90, Zuk
  // 149, anticlockwise from east), each facing the centre:
  // facingAngle = atan2(-dx, -dy) in 2048ths of a turn, 0 south, 512 west.
  // The north side is full, so the Doom of Mokhaiotl carries the ring on past
  // Zuk, at 211 degrees (south-west).
  {
    actorId: "lobby-npc-3",
    npcTypeId: 14707,
    position: [20, 18],
    facingAngle: 1360,
    // Drawn at its own size: squeezed into 3 tiles like the others, its low
    // 5 x 5 body stands a third of their height.
    displaySize: 5,
    available: true,
  },
];
export { lobbyNpcs };
