// magnetic.js — how far the compass needle points away from true north at your location
// ("magnetic declination", from the World Magnetic Model; global `geomagnetism`, see lib/).
// East is positive, west negative: Virginia is about -8.7 degrees.

import { store } from './store.js';

/** Declination at a location from the model, or null if the model isn't available. */
export function modelDeclination(lat, lon, date = new Date()) {
  try {
    const g = globalThis.geomagnetism;
    const d = g && g.declination(lat, lon, date);
    return Number.isFinite(d) ? d : null;
  } catch (e) { return null; }
}

/** The declination the compass should use: automatic by default, or the user's manual value. */
export function currentDeclination(loc) {
  if (store.get('declAuto')) {
    const d = modelDeclination(loc.lat, loc.lon);
    if (d !== null) return d;
  }
  return store.get('declination');
}
