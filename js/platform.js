// platform.js — are we running as the installed Android app (Capacitor) or as a web page?
// The Android app can read data sources that browsers block for websites (e.g. live plane feeds).

export const isNativeApp = () => !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
/**
 * Android app only: let the screen turn with the phone (free = true) or hold it upright.
 * Uses the small "Upright" plugin in android-app (UprightPlugin.java). Does nothing on the web.
 */
export function setRotation(free) {
  const C = globalThis.Capacitor;
  if (!isNativeApp()) return;
  try {
    const P = C.Plugins && C.Plugins.Upright;
    const r = P ? P.set({ free }) : C.nativePromise ? C.nativePromise('Upright', 'set', { free }) : null;
    if (r && r.catch) r.catch(() => {});
  } catch (e) { /* older build without the plugin: the screen just turns freely */ }
}

export const platformName = () => (isNativeApp() ? globalThis.Capacitor.getPlatform() : 'web');
