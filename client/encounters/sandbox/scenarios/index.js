// The scenario library: scenarios that players submit by pull request, one
// JSON file each in this directory (a scenario of the format of
// ../scenario.js, as the editor's "Export .json" writes it), listed below.
// The editor offers them next to the examples. test/test-sandbox-examples.mjs
// checks every file: listed here, valid, and placed on walkable tiles clear
// of each other, of the host boss and of the player.
//
// To add one: export it from the editor, put the file here under a short
// name of its own (sun-and-moon.json), add it to the list, and open a pull
// request. Share codes stay for casual sharing; the library is reviewed,
// permanent and one click away.
import { normalizeScenario } from "../scenario.js";
import sunAndMoon from "./sun-and-moon.json" with { type: "json" };

const library = [
  ["sun-and-moon", sunAndMoon],
];

// A file that does not read (a catalog id renamed since, say) is left out
// rather than breaking the editor; the test names it.
export const libraryScenarios = library.flatMap(([key, json]) => {
  try {
    return [{ key, scenario: normalizeScenario(json) }];
  } catch {
    return [];
  }
});
export const libraryScenarioFiles = library.map(([key]) => `${key}.json`);
