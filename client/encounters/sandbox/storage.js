// The scenarios the player saved, in the page's localStorage. A list of
// { id, savedAt, scenario }, newest first. The editor (editor.js) is its one
// user; nothing of the fight reads it.
import { normalizeScenario } from "./scenario.js";

const savedKey = "openscim.sandbox.saved";
export const maxSavedScenarios = 100;

function readAll() {
  try {
    const list = JSON.parse(globalThis.localStorage?.getItem(savedKey) ?? "[]");
    if (!Array.isArray(list)) return [];
    return list.flatMap((entry) => {
      try {
        return [{ id: String(entry.id), savedAt: Number(entry.savedAt) || 0, scenario: normalizeScenario(entry.scenario) }];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function writeAll(list) {
  globalThis.localStorage?.setItem(savedKey, JSON.stringify(list.slice(0, maxSavedScenarios)));
}

export const listSavedScenarios = () => readAll();

/** Saves under `id`, or as a new entry; returns the entry's id. Throws when storage refuses. */
export function saveScenario(scenario, id) {
  const list = readAll();
  const entryId = id && list.some((entry) => entry.id === id) ? id : `s${Date.now().toString(36)}`;
  const entry = { id: entryId, savedAt: Date.now(), scenario: normalizeScenario(scenario) };
  writeAll([entry, ...list.filter((other) => other.id !== entryId)]);
  return entryId;
}

export function deleteSavedScenario(id) {
  writeAll(readAll().filter((entry) => entry.id !== id));
}
