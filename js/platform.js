// platform.js — are we running as the installed Android app (Capacitor) or as a web page?
// The Android app can read data sources that browsers block for websites (e.g. live plane feeds).

export const isNativeApp = () => !!(globalThis.Capacitor && globalThis.Capacitor.isNativePlatform && globalThis.Capacitor.isNativePlatform());
export const platformName = () => (isNativeApp() ? globalThis.Capacitor.getPlatform() : 'web');
