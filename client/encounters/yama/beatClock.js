import { defaultYamaFireballBeats } from "./fireballGeometry.js";
function getYamaBeatInfo(tick, attackPattern) {
  const beatStartTick = attackPattern?.beatStartTick ?? 4;
  const beatIntervalTicks = attackPattern?.beatIntervalTicks ?? 7;
  const beatsPerCycle = attackPattern?.beatsPerCycle ?? 10;
  const fireballBeats = attackPattern?.fireballBeats ?? defaultYamaFireballBeats;
  const snapFireballBeats = attackPattern?.snapFireballBeats ?? fireballBeats;
  const voidFlareBeats = attackPattern?.voidFlareBeats ?? [8];
  if (tick < beatStartTick || (tick - beatStartTick) % beatIntervalTicks !== 0) {
    return {
      isBeat: false,
      beatIndex: -1,
      globalBeatOrdinal: -1,
      isFireballBeat: false,
      isVoidFlareBeat: false,
      fireballBeatKind: "none",
    };
  }
  const globalBeatOrdinal = (tick - beatStartTick) / beatIntervalTicks;
  const beatIndex = globalBeatOrdinal % beatsPerCycle;
  const isFireballBeat = fireballBeats.includes(beatIndex);
  const isSnapBeat = snapFireballBeats.includes(beatIndex);
  return {
    isBeat: true,
    beatIndex: beatIndex,
    globalBeatOrdinal: globalBeatOrdinal,
    isFireballBeat: isFireballBeat,
    isVoidFlareBeat: voidFlareBeats.includes(beatIndex),
    // "snap": the burst is Yama's attack on this beat, he makes no magic or
    // ranged attack (yamaAttackPolicy). "overlay": the burst comes on top of his
    // attack. Nothing in this directory asks for "overlay" by name.
    fireballBeatKind: isFireballBeat ? (isSnapBeat ? "snap" : "overlay") : "none",
  };
}
function getNextYamaBeatTick(tick, attackPattern) {
  const beatStartTick = attackPattern?.beatStartTick ?? 4;
  const beatIntervalTicks = attackPattern?.beatIntervalTicks ?? 7;
  if (tick < beatStartTick) {
    return beatStartTick;
  } else {
    return beatStartTick + Math.floor((tick - beatStartTick) / beatIntervalTicks + 1) * beatIntervalTicks;
  }
}
export { getYamaBeatInfo, getNextYamaBeatTick };
