// The sandbox's one way to the application (client/assets/application.js):
// a request as a "sandbox-request" window event, answered through a
// promise. The application's listener takes the request at once
// (detail.accept()) and settles it when the thing is done, not after a
// guessed wait: the loadout set and the arena entered, the setup window open.
// A request nobody takes (the application is not there yet) fails at once.
//
//   requestApp("open-setup", { encounterKind, displayName, description })
//   requestApp("get-loadout")                       → the sandbox's loadout
//   requestApp("apply-loadout", { loadout, encounterKind? })
//                                                   → once it is in the state,
//                                                     and the arena entered with it
//   requestApp("enter", { encounterKind })          → once the arena is entered
//
// Requests are what the editor asks of the page; nothing of the fight goes
// through here.
export class AppBridgeError extends Error {
  constructor(message) {
    super(message);
    this.name = "AppBridgeError";
  }
}

export function requestApp(type, payload = {}) {
  return new Promise((resolve, reject) => {
    let accepted = false;
    const detail = {
      type,
      payload,
      accept: () => {
        accepted = true;
      },
      resolve,
      reject: (error) => reject(error instanceof Error ? error : new AppBridgeError(String(error))),
    };
    globalThis.dispatchEvent?.(new CustomEvent("sandbox-request", { detail }));
    if (!accepted) reject(new AppBridgeError(`The application did not take "${type}"; reload the page and try again.`));
  });
}
