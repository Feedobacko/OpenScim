import assert from "node:assert/strict";
import { configure } from "../client/toa/zebak/rules.js";
for (const level of [0, 1, 2, 3, 4, 5, 6]) {
  const tier = Math.min(2, level >> 1);
  const rules = configure({
    path: level,
    blood: true,
    upset: true,
    spray: true,
    clouds: true,
    other: 255,
  });
  assert.equal(rules.raid, 300);
  assert.equal(rules.period, 7 - tier);
  assert.equal(rules.enragePeriod, 4 - tier);
  assert.equal(rules.cloudCount, 3);
  assert.equal(rules.gap, 3 - tier);
}
assert.equal(configure({ clouds: true, spray: true }).raid, 0);
console.log("Zebak invocation rules passed for path levels 0-6");
