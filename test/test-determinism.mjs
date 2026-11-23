// The simulation must do exactly what it did when the digests were recorded:
// the same state after every tick of every scripted fight. No browser.
// See tools/determinism/harness.mjs; `node tools/determinism/harness.mjs`
// gives the same check with a line per scenario.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import { cacheZip, difference, loadScenarios, readRecorded, recordOf, runScenario } from "../tools/determinism/harness.mjs";

test("the engine and the encounters repeat the recorded digests", { skip: !existsSync(cacheZip) && `${cacheZip} is missing (npm run assets)` }, async () => {
  const recorded = readRecorded();
  const scenarios = await loadScenarios();
  const problems = [];
  for (const scenario of scenarios) {
    const problem = difference(scenario.name, recorded.scenarios[scenario.name], recordOf(await runScenario(scenario)));
    if (problem) problems.push(problem);
  }
  for (const name of Object.keys(recorded.scenarios)) {
    if (!scenarios.some((scenario) => scenario.name === name)) problems.push(`${name}: recorded, but the scenario is gone`);
  }
  assert.deepEqual(problems, []);
});
