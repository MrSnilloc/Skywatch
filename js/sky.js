// sky.js — Sun, Moon and planets, via the astronomy-engine library (global `Astronomy`).
// Everything here is plain functions: give it a date + observer, get numbers back.

const A = () => globalThis.Astronomy;

const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** 224 -> "SW" */
export function dirName(az) {
  const a = ((az % 360) + 360) % 360;
  return DIRS[Math.round(a / 22.5) % 16];
}

export function makeObserver(loc) {
  return new (A().Observer)(loc.lat, loc.lon, loc.elev || 0);
}

/** Where a body is in the sky right now: azimuth (0=N, 90=E) and altitude above the horizon, degrees. */
export function bodyPosition(body, date, obs) {
  const eq = A().Equator(body, date, obs, true, true);
  const hor = A().Horizon(date, obs, eq.ra, eq.dec, 'normal');
  return { az: hor.azimuth, alt: hor.altitude };
}

export function sunAltitude(date, obs) {
  return bodyPosition('Sun', date, obs).alt;
}

/** How dark is it, in words? */
export function skyState(sunAlt) {
  if (sunAlt > 0) return { key: 'day', label: 'Daylight' };
  if (sunAlt > -6) return { key: 'civil', label: 'Twilight' };
  if (sunAlt > -12) return { key: 'nautical', label: 'Deep twilight' };
  if (sunAlt > -18) return { key: 'astro', label: 'Nearly dark' };
  return { key: 'dark', label: 'Fully dark' };
}

/** Next rise and next set of a body (either may be null, e.g. polar regions). */
export function riseSet(body, date, obs) {
  const r = A().SearchRiseSet(body, obs, +1, date, 2);
  const s = A().SearchRiseSet(body, obs, -1, date, 2);
  return { rise: r ? r.date : null, set: s ? s.date : null };
}

export function phaseName(phase) {
  const near = (t) => Math.abs(((phase - t + 540) % 360) - 180) < 6.5; // within ~6.5 deg
  if (near(0) || phase > 353.5 || phase < 6.5) return 'New Moon';
  if (near(90)) return 'First Quarter';
  if (near(180)) return 'Full Moon';
  if (near(270)) return 'Last Quarter';
  if (phase < 90) return 'Waxing Crescent';
  if (phase < 180) return 'Waxing Gibbous';
  if (phase < 270) return 'Waning Gibbous';
  return 'Waning Crescent';
}

export function moonInfo(date, obs) {
  const pos = bodyPosition('Moon', date, obs);
  const phase = A().MoonPhase(date);
  const ill = A().Illumination('Moon', date);
  const rs = riseSet('Moon', date, obs);
  const nf = A().SearchMoonPhase(180, date, 40);
  const nn = A().SearchMoonPhase(0, date, 40);
  return {
    ...pos, phase, fraction: ill.phase_fraction, name: phaseName(phase),
    rise: rs.rise, set: rs.set, nextFull: nf ? nf.date : null, nextNew: nn ? nn.date : null,
  };
}

export function planetInfo(name, date, obs) {
  const pos = bodyPosition(name, date, obs);
  const ill = A().Illumination(name, date);
  const elong = A().AngleFromSun(name, date);
  const rs = riseSet(name, date, obs);
  return { name, ...pos, mag: ill.mag, elong, rise: rs.rise, set: rs.set };
}
