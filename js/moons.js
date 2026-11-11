// moons.js — the planets up close: where each planet's moons are, ring tilt, phase, and "tonight" times.
// Pure maths (no screen code). Uses astronomy-engine (global `Astronomy`) for the planets and Jupiter's moons.
//
// How exact is it?
//   • Jupiter's four Galilean moons come straight from astronomy-engine — good enough to time transits and
//     shadow crossings to about a minute.
//   • Every other moon uses a simple round-orbit model fitted to NASA/JPL Horizons positions (2026–2031).
//     It is right to within about 3° along the orbit — fine for "which side of the planet is Titan on tonight".
//
// TO ADD A MOON: add one row to its planet below (orbit numbers come from fitting JPL Horizons vectors:
// a = orbit radius km, pole = orbit's north direction (J2000 equator), L0 = position angle along the orbit
// at T0 in degrees, rate = degrees per day).

import * as sky from './sky.js';

const A = () => globalThis.Astronomy;
const RAD = Math.PI / 180, DEG = 180 / Math.PI, AU = 149597870.7;
const T0_JD = 2461041.5;                 // 2026-01-01 00:00 TDB — the moment L0 refers to
const TDB_MINUS_UTC = 69.184;            // seconds

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const arr = (v) => [v.x, v.y, v.z];

const fit = (name, a, pole, L0, rate, radiusKm, mag, blurb) => ({ name, a, pole, L0, rate, radiusKm, mag, blurb });
const gal = (name, key, radiusKm, mag, blurb) => ({ name, key, radiusKm, mag, blurb, exact: true });

export const PLANETS = {
  Mercury: { radiusKm: 2439.7, flat: 0, moons: [], blurb: 'No moons. Shows phases like the Moon because it orbits inside Earth’s orbit.' },
  Venus: { radiusKm: 6051.8, flat: 0, moons: [], blurb: 'No moons. A thin crescent when close to us, a small full disc when far away.' },
  Mars: { radiusKm: 3396.2, flat: 0.0059, blurb: 'Two tiny captured-asteroid moons that hug the planet.', moons: [
    fit('Phobos', 9376, [0.43915, -0.41279, 0.79797], 210.99, 1128.8449582, 11.1, 11.4, 'Laps Mars three times a day'),
    fit('Deimos', 23458, [0.40503, -0.414, 0.8152], 21.193, 285.1618258, 6.2, 12.5, 'Only 12 km across'),
  ] },
  Jupiter: { radiusKm: 71492, flat: 0.0649, blurb: 'The four big moons Galileo found in 1610. Their black shadows cross the cloud tops.', moons: [
    gal('Io', 'io', 1821.6, 5.0, 'Volcanic — the innermost big moon'),
    gal('Europa', 'europa', 1560.8, 5.3, 'Ice shell over a hidden ocean'),
    gal('Ganymede', 'ganymede', 2634.1, 4.6, 'The largest moon in the solar system'),
    gal('Callisto', 'callisto', 2410.3, 5.7, 'Dark, ancient and heavily cratered'),
  ] },
  Saturn: { radiusKm: 60268, flat: 0.098, rings: [[1.239, 1.527, 0.28], [1.527, 1.951, 0.9], [2.027, 2.269, 0.6]], blurb: 'Rings shown at their true tilt. Titan is the easy moon; the rest need a telescope.', moons: [
    fit('Mimas', 185552, [0.07727, 0.06741, 0.99473], 7.544, 381.9972935, 198, 12.8, 'The “Death Star” moon'),
    fit('Enceladus', 238026, [0.08551, 0.07313, 0.99365], 55.494, 262.7320643, 252, 11.8, 'Sprays ice geysers into space'),
    fit('Tethys', 294673, [0.06799, 0.06878, 0.99531], 348.466, 190.6977766, 531, 10.3, 'Almost pure water ice'),
    fit('Dione', 377423, [0.08544, 0.07307, 0.99366], 98.451, 131.5349161, 561, 10.4, 'Icy, with bright cliffs'),
    fit('Rhea', 527062, [0.08381, 0.07765, 0.99345], 106.489, 79.690042, 764, 9.7, 'Saturn’s second-largest moon'),
    fit('Titan', 1224050, [0.08817, 0.06649, 0.99388], 213.344, 22.5769155, 2575, 8.4, 'Bigger than Mercury, with a thick orange atmosphere'),
    fit('Iapetus', 3582620, [0.19241, -0.1793, 0.9648], 67.615, 4.5367791, 735, 11.0, 'One bright side, one dark side'),
  ] },
  Uranus: { radiusKm: 25559, flat: 0.0229, blurb: 'Tipped on its side, so its moons circle like a bullseye. All need a large telescope.', moons: [
    fit('Miranda', 129847, [0.26004, 0.92694, 0.27048], 158.995, 254.6912444, 236, 16.5, 'A jumbled patchwork surface'),
    fit('Ariel', 190929, [0.21173, 0.94161, 0.26181], 161.883, 142.8356143, 579, 14.3, 'The brightest of Uranus’s moons'),
    fit('Umbriel', 265985, [0.21066, 0.94182, 0.26192], 81.478, 86.8688856, 585, 15.0, 'The darkest of the five'),
    fit('Titania', 436253, [0.21199, 0.94174, 0.26111], 215.284, 41.3514003, 789, 13.9, 'Uranus’s largest moon'),
    fit('Oberon', 583448, [0.21091, 0.94264, 0.25875], 124.017, 26.7394705, 761, 14.1, 'The outermost big moon'),
  ] },
  Neptune: { radiusKm: 24764, flat: 0.0171, blurb: 'Triton orbits backwards — probably a captured dwarf planet.', moons: [
    fit('Triton', 354757, [-0.53124, 0.76991, -0.35358], 33.062, 61.2573763, 1353, 13.5, 'Orbits backwards; has nitrogen geysers'),
  ] },
};
export const PLANET_NAMES = Object.keys(PLANETS);

/** Position of a fitted moon relative to its planet's centre, km, J2000 equator, at a UTC date. */
export function fittedMoonKm(m, date) {
  const days = date.getTime() / 86400000 + 2440587.5 + TDB_MINUS_UTC / 86400 - T0_JD;
  const L = (m.L0 + m.rate * days) * RAD;
  const xh = norm(cross([0, 0, 1], m.pole)), yh = cross(m.pole, xh);
  const c = Math.cos(L) * m.a, s = Math.sin(L) * m.a;
  return [xh[0] * c + yh[0] * s, xh[1] * c + yh[1] * s, xh[2] * c + yh[2] * s];
}

function jupiterMoonsKm(date) {
  const jm = A().JupiterMoons(date);
  const get = (key, i) => { const s = jm[key] || (jm.moon && jm.moon[i]); return [s.x * AU, s.y * AU, s.z * AU]; };
  return { io: get('io', 0), europa: get('europa', 1), ganymede: get('ganymede', 2), callisto: get('callisto', 3) };
}

/**
 * Everything needed to draw a planet close-up as seen from Earth at `date`.
 * Sky offsets are in planet radii: x = toward celestial east, y = toward celestial north, z = toward Earth.
 * If `loc` is given, also where it is in your sky (alt/az) and `zenithAngle` (which way is "up", degrees from
 * celestial north toward east).
 */
export function planetSystem(name, date, loc = null) {
  const P = PLANETS[name], a = A();
  const gv = a.GeoVector(name, date, true), geo = arr(gv), distAu = Math.hypot(...geo);
  const j = norm(geo), toEarth = [-j[0], -j[1], -j[2]];
  const east = norm(cross([0, 0, 1], j)), north = cross(j, east);
  const then = new Date(date.getTime() - distAu * 499.004784 * 1000);          // light left the planet this long ago
  const sunDir = norm(arr(a.HelioVector(name, then)).map(c => -c));
  let pole = [0, 0, 1];
  try { const ax = a.RotationAxis(name, then); pole = norm(arr(ax.north)); } catch (e) { /* older library: celestial north */ }
  const R = P.radiusKm, ill = a.Illumination(name, date);
  const sky2 = (v) => ({ x: dot(v, east) / R, y: dot(v, north) / R, z: dot(v, toEarth) / R });

  const jm = name === 'Jupiter' ? jupiterMoonsKm(then) : null;
  const moons = P.moons.map(m => {
    const km = m.exact ? jm[m.key] : fittedMoonKm(m, then);
    const p = sky2(km), onDisc = p.x * p.x + p.y * p.y < 1;
    const ms = dot(km, sunDir), perp = km.map((c, i) => c - ms * sunDir[i]), pd = Math.hypot(...perp);
    let state = 'visible';
    if (onDisc) state = p.z > 0 ? 'transit' : 'behind';
    else if (ms < 0 && pd < R) state = 'eclipsed';                             // inside the planet's shadow
    let shadow = null;
    if (ms > 0 && pd < R) {                                                    // its shadow lands on the planet
      const q = perp.map((c, i) => c + sunDir[i] * Math.sqrt(R * R - pd * pd));
      if (dot(q, toEarth) > 0) shadow = { x: dot(q, east) / R, y: dot(q, north) / R };
    }
    return { ...m, ...p, km, distKm: Math.hypot(...km), sep: Math.hypot(p.x, p.y), state, shadow };
  });

  const out = {
    name, info: P, distAu, radiusKm: R, arcsecRadius: Math.atan(R / (distAu * AU)) * DEG * 3600,
    toEarth, east, north, sunDir, pole, mag: ill.mag, phaseFraction: ill.phase_fraction, moons,
    ringTilt: Math.asin(Math.max(-1, Math.min(1, dot(pole, toEarth)))) * DEG,       // + = we see the north face
    poleAngle: Math.atan2(dot(pole, east), dot(pole, north)) * DEG,                 // tilt of the planet's north on the sky
  };
  if (loc) Object.assign(out, skyPlacement(j, name, date, loc, east, north));
  return out;
}

/** Where a direction is in your sky, and which way "up" (the zenith) is around it. */
function skyPlacement(j, body, date, loc, east, north) {
  const a = A(), obs = sky.makeObserver(loc);
  const pos = sky.bodyPosition(body, date, obs);
  const z = a.RotateVector(a.Rotation_HOR_EQJ(date, obs), new a.Vector(0, 0, 1, a.MakeTime(date)));
  const zen = [z.x, z.y, z.z];
  return { alt: pos.alt, az: pos.az, zenithAngle: Math.atan2(dot(zen, east), dot(zen, north)) * DEG };
}

/**
 * The Moon's globe as seen from Earth: its axes in J2000 coordinates so features can be placed by
 * latitude/longitude, plus the direction of the Sun and of Earth.
 *   xm = through lat 0, lon 0 (middle of the near side), zm = north pole, ym = toward the east limb (Mare Crisium).
 */
export function moonGlobe(date, loc = null) {
  const a = A();
  const mk = arr(a.GeoMoon(date)).map(c => c * AU), toEarth = norm(mk.map(c => -c));
  const sk = arr(a.GeoVector('Sun', date, true)).map(c => c * AU), sunDir = norm(sk.map((c, i) => c - mk[i]));
  const lib = a.Libration(date);
  let zm = [0, 0, 1];
  try { zm = norm(arr(a.RotationAxis('Moon', date).north)); } catch (e) { const ob = 23.4392911 * RAD; zm = [0, -Math.sin(ob), Math.cos(ob)]; }
  const t = dot(toEarth, zm), xl = norm(toEarth.map((c, i) => c - t * zm[i])), yl = cross(zm, xl);
  const lo = lib.elon * RAD, xm = xl.map((c, i) => c * Math.cos(lo) - yl[i] * Math.sin(lo)), ym = cross(zm, xm);
  const j = norm(mk), east = norm(cross([0, 0, 1], j)), north = cross(j, east);
  const out = { xm, ym, zm, toEarth, sunDir, east, north, distKm: Math.hypot(...mk), phase: a.MoonPhase(date),
    fraction: a.Illumination('Moon', date).phase_fraction, subEarth: { lat: lib.elat, lon: lib.elon } };
  if (loc) Object.assign(out, skyPlacement(j, 'Moon', date, loc, east, north));
  return out;
}

/**
 * A good moment to look at `body` ('Moon' or a planet) tonight from `loc`:
 * right now if it's dark and the body is up, otherwise when it is highest during the coming night.
 * -> { date, alt, az, now } or null if it never gets above `minAlt` while it's dark.
 */
export function bestTonight(body, loc, from = new Date(), { minAlt = 10, darkSunAlt = -6, hours = 18, stepMin = 10 } = {}) {
  const obs = sky.makeObserver(loc);
  let best = null;
  for (let m = 0; m <= hours * 60; m += stepMin) {
    const d = new Date(from.getTime() + m * 60000);
    if (sky.sunAltitude(d, obs) > darkSunAlt) { if (best) break; continue; }       // stop at the end of this night
    const p = sky.bodyPosition(body, d, obs);
    if (p.alt < minAlt) continue;
    if (m === 0) return { date: d, alt: p.alt, az: p.az, now: true };
    if (!best || p.alt > best.alt) best = { date: d, alt: p.alt, az: p.az, now: false };
  }
  return best;
}
