// Which game code do the determinism scenarios run? Uses V8's own coverage.
//
//   node tools/determinism/coverage.mjs [--file yama] [--only <text>]
//        [--list <file-substring> [--lines 247108-248923] [--min-lines 8]]
//
// Prints, for the engine chunk, the game-logic part of rendering.js and the
// Zebak modules: functions run / total and source bytes run / total. --list
// also names the functions of that file that never ran (line, name, length in
// lines); --lines narrows that file to a range of lines.
import { readFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const valueOf = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
// rendering.js is mostly cache decoding, the renderer and data tables; the
// game logic starts after the tables.
const gameLogicFrom = { "rendering.js": 199000 };
const wanted = (url) => /client\/(assets\/(simulationEngineFactory|rendering)\.js|toa\/zebak\/[\w-]+\.js|engine\/|encounters\/)/.test(url);

const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.startPreciseCoverage", { callCount: true, detailed: true });

const { runScenario, loadScenarios } = await import("./harness.mjs");
const scenarios = await loadScenarios(valueOf("--file"));
const only = valueOf("--only");
for (const scenario of scenarios) if (!only || scenario.name.includes(only)) await runScenario(scenario);

const { result } = await session.post("Profiler.takePreciseCoverage");
const minLines = Number(valueOf("--min-lines") ?? 8);
for (const script of result.filter((entry) => wanted(entry.url)).sort((a, b) => a.url.localeCompare(b.url))) {
  const name = script.url.split("/client/")[1];
  const source = readFileSync(fileURLToPath(script.url), "utf8");
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) if (source[i] === "\n") lineStarts.push(i + 1);
  const lineOf = (offset) => {
    let low = 0, high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (lineStarts[middle] <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };
  const lines = valueOf("--list") && name.includes(valueOf("--list")) ? valueOf("--lines")?.split("-").map(Number) : undefined;
  const from = lineStarts[(lines?.[0] ?? gameLogicFrom[name.split("/").pop()] ?? 1) - 1];
  const until = lines ? (lineStarts[lines[1]] ?? source.length) : source.length;

  // 1 = ran, 0 = did not run, -1 = module-level code. Inner ranges come later.
  const ran = new Int8Array(source.length).fill(-1);
  const ranges = script.functions.flatMap((fn, index) => fn.ranges.map((range) => ({ ...range, top: index === 0 && fn.functionName === "" })));
  ranges.sort((a, b) => a.startOffset - b.startOffset || b.endOffset - a.endOffset);
  for (const range of ranges) if (!range.top) ran.fill(range.count > 0 ? 1 : 0, range.startOffset, range.endOffset);
  let bytes = 0, bytesRun = 0;
  for (let i = from; i < until; i++) if (ran[i] >= 0 && source[i] > " ") (bytes++, (bytesRun += ran[i]));

  const functions = script.functions.filter((fn) => fn.ranges[0].startOffset >= from && fn.ranges[0].startOffset < until && !(fn.functionName === "" && fn.ranges[0].startOffset === 0));
  const missed = functions.filter((fn) => fn.ranges[0].count === 0);
  console.log(
    `${name.padEnd(40)} functions ${functions.length - missed.length}/${functions.length}` +
      `  bytes ${bytesRun}/${bytes} (${((100 * bytesRun) / Math.max(1, bytes)).toFixed(1)}%)`,
  );
  if (valueOf("--list") && name.includes(valueOf("--list"))) {
    for (const fn of missed) {
      const first = lineOf(fn.ranges[0].startOffset), last = lineOf(fn.ranges[0].endOffset);
      if (fn.functionName && last - first + 1 >= minLines) console.log(`  ${first}  ${fn.functionName}  (${last - first + 1} lines)`);
    }
  }
}
session.disconnect();
