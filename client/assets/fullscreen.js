import { isAppleTouchDevice } from "./rendering.js";
function supportsFullscreenApi(documentRef = document) {
  const documentElement2 = documentRef.documentElement;
  const e = documentRef;
  return (
    (documentRef.fullscreenEnabled === true &&
      "function" == typeof documentElement2.requestFullscreen) ||
    (true === e.webkitFullscreenEnabled &&
      "function" == typeof documentElement2.webkitRequestFullscreen)
  );
}
function getFullscreenMode(documentRef = document, navigatorRef = navigator) {
  if (supportsFullscreenApi(documentRef)) {
    return "api";
  } else if (isAppleTouchDevice(navigatorRef)) {
    return "home-screen";
  } else {
    return "none";
  }
}
function isDocumentFullscreen(documentRef = document) {
  return Boolean(
    documentRef.fullscreenElement ?? documentRef.webkitFullscreenElement,
  );
}
var fullscreenDisplayQuery =
  "(display-mode: fullscreen), (display-mode: standalone)";
function isStandaloneOrFullscreen(windowRef = window) {
  return (
    windowRef.navigator.standalone === true ||
    ("function" == typeof windowRef.matchMedia &&
      windowRef.matchMedia(
        "(display-mode: fullscreen), (display-mode: standalone)",
      ).matches)
  );
}
async function requestLandscapeFullscreen(
  documentRef = document,
  windowRef = window,
) {
  const documentElement3 = documentRef.documentElement;
  try {
    if ("function" == typeof documentElement3.requestFullscreen) {
      await documentElement3.requestFullscreen({
        navigationUI: "hide",
      });
    } else {
      if ("function" != typeof documentElement3.webkitRequestFullscreen) {
        return false;
      }
      documentElement3.webkitRequestFullscreen();
    }
  } catch {
    return false;
  }
  const g = windowRef.screen?.orientation;
  if ("function" == typeof g?.lock) {
    await g.lock("landscape").catch(() => {});
  }
  return true;
}
async function exitFullscreen(documentRef = document) {
  try {
    if ("function" == typeof documentRef.exitFullscreen) {
      await documentRef.exitFullscreen();
    } else {
      documentRef.webkitExitFullscreen?.();
    }
  } catch {}
}
function canLockFullscreenOrientation(
  documentRef = document,
  windowRef = window,
) {
  return (
    !!supportsFullscreenApi(documentRef) &&
    !isAppleTouchDevice(windowRef.navigator) &&
    "function" == typeof windowRef.screen?.orientation?.lock
  );
}
export {
  isDocumentFullscreen,
  exitFullscreen,
  canLockFullscreenOrientation,
  isStandaloneOrFullscreen,
  requestLandscapeFullscreen,
  getFullscreenMode,
  fullscreenDisplayQuery,
};
