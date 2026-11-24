// The scenario the next sandbox run starts with: what the editor applied
// last. It is kept in the page's localStorage, so a reload or a later visit
// starts from it, and a share URL (#sbx=<code>) replaces it when the page
// is opened with one.
//
// The encounter reads it only when a run starts without seeds (a new run or
// a restart); the scenario then goes into the encounter's seeds, so a replay
// and a restart with the same seeds carry it with them and never read this
// again. In Node (the determinism harness) there is no page: nothing is
// stored and the harness hands its scenarios to the factory.
import { decodeShareCode, normalizeScenario } from "./scenario.js";

const activeKey = "openscim.sandbox.active";
let active = null;
let loaded = false;

function readStorage() {
  try {
    const json = globalThis.localStorage?.getItem(activeKey);
    return json ? normalizeScenario(JSON.parse(json)) : null;
  } catch {
    return null;
  }
}

// A share URL: the code after #sbx= is taken once and removed from the address.
function readShareUrl() {
  try {
    const hash = globalThis.location?.hash ?? "";
    const match = /sbx=([\w.-]+)/.exec(hash);
    if (!match) return null;
    const scenario = decodeShareCode(match[1]);
    globalThis.history?.replaceState(globalThis.history.state, "", globalThis.location.pathname + globalThis.location.search);
    return scenario;
  } catch {
    return null;
  }
}

// True once, after a share URL brought a scenario: the editor then sets the
// scenario's gear (editor.js), which a URL cannot do by itself.
let arrivedByLink = false;
export function takeArrivedByLink() {
  const arrived = arrivedByLink;
  arrivedByLink = false;
  return arrived;
}

export function getActiveScenario() {
  if (!loaded) {
    loaded = true;
    const shared = readShareUrl();
    if (shared) {
      setActiveScenario(shared);
      arrivedByLink = true;
    } else active = readStorage();
  }
  return active;
}

export function setActiveScenario(scenario) {
  active = normalizeScenario(scenario);
  loaded = true;
  try {
    globalThis.localStorage?.setItem(activeKey, JSON.stringify(active));
  } catch {
    // Storage may be full or blocked; the scenario still holds for this page.
  }
  return active;
}
