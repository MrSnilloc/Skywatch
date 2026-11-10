// iss.js — International Space Station: orbit data, live position and pass prediction.
// Uses satellite.js (global `satellite`) for the orbit maths (SGP4) and astronomy-engine for the Sun.

import { makeObserver, bodyPosition } from './sky.js';

const S = () => globalThis.satellite;
const A = () => globalThis.Astronomy;

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const AU_KM = 149597870.7;
const EARTH_R_KM = 6371;

// ---------- orbit data (TLE) ----------

/** Epoch (moment the orbit data describes) from the first TLE line. */
export function epochFromLine1(l1) {
  const yy = parseInt(l1.substring(18, 20), 10);
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const day = parseFloat(l1.substring(20, 32));
  return new Date(Date.UTC(year, 0, 1) + (day - 1) * 86400000);
}

/** Accepts classic 2/3-line TLE text, or JSON with line1/line2. Returns {name,l1,l2,epoch} or null. */
export function parseTLE(text) {
  let l1 = null, l2 = null, name = 'ISS';
  const t = (text || '').trim();
  if (t.startsWith('{')) {
    try { const j = JSON.parse(t); l1 = j.line1; l2 = j.line2; name = j.name || name; } catch (e) { return null; }
  } else {
    const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const i1 = lines.findIndex(l => l.startsWith('1 ') && l.length >= 68);
    if (i1 < 0 || !lines[i1 + 1] || !lines[i1 + 1].startsWith('2 ')) return null;
    l1 = lines[i1]; l2 = lines[i1 + 1];
    if (i1 > 0) name = lines[i1 - 1].replace(/^0 /, '');
  }
  if (!l1 || !l2) return null;
  return { name, l1, l2, epoch: epochFromLine1(l1) };
}

/** Parse a CelesTrak "3-line" list (name, line1, line2, ...) into [{name,l1,l2,epoch,norad}]. */
export function parseTLEList(text) {
  const lines = (text || '').split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ') && lines[i + 1].length >= 68) {
      out.push({ name: lines[i].replace(/^0 /, '').trim(), l1: lines[i + 1], l2: lines[i + 2],
        epoch: epochFromLine1(lines[i + 1]), norad: parseInt(lines[i + 1].substring(2, 7), 10) });
      i += 2;
    }
  }
  return out;
}

// ---------- CelesTrak JSON (OMM) -> classic TLE lines ----------
// Some CelesTrak lists only come as JSON now; satellite.js wants the two classic lines, so we rebuild them.

function tleChecksum(line) {
  let s = 0;
  for (const ch of line.slice(0, 68)) { if (ch >= '0' && ch <= '9') s += +ch; else if (ch === '-') s += 1; }
  return String(s % 10);
}
function tleExp(v) {                 // 0.00012345 -> " 12345-3"
  if (!v) return ' 00000-0';
  let e = Math.floor(Math.log10(Math.abs(v))) + 1, m = Math.round(Math.abs(v) / Math.pow(10, e) * 1e5);
  if (m >= 100000) { m = 10000; e += 1; }
  return (v < 0 ? '-' : ' ') + String(m).padStart(5, '0') + (e < 0 ? '-' : '+') + Math.abs(e);
}
export function ommToTLE(o) {
  const id = String(o.NORAD_CAT_ID).padStart(5, '0').slice(-5);
  const m = /^(\d{4})-(\d{3})(\w*)$/.exec(o.OBJECT_ID || '');
  const intl = m ? (m[1].slice(2) + m[2] + m[3]).padEnd(8) : '        ';
  const ep = new Date(o.EPOCH.endsWith('Z') ? o.EPOCH : o.EPOCH + 'Z');
  const y = ep.getUTCFullYear(), doy = (ep - Date.UTC(y, 0, 1)) / 86400000 + 1;
  const epoch = String(y).slice(2) + doy.toFixed(8).padStart(12, '0');
  const nd = +o.MEAN_MOTION_DOT || 0;
  const ndot = (nd < 0 ? '-' : ' ') + Math.abs(nd).toFixed(8).replace(/^0/, '');
  let l1 = `1 ${id}U ${intl} ${epoch} ${ndot} ${tleExp(+o.MEAN_MOTION_DDOT || 0)} ${tleExp(+o.BSTAR || 0)} 0 ${String(o.ELEMENT_SET_NO || 999).padStart(4).slice(-4)}`;
  const f = (v, w, d) => (+v).toFixed(d).padStart(w);
  let l2 = `2 ${id} ${f(o.INCLINATION, 8, 4)} ${f(o.RA_OF_ASC_NODE, 8, 4)} ${(+o.ECCENTRICITY).toFixed(7).slice(2)} ${f(o.ARG_OF_PERICENTER, 8, 4)} ${f(o.MEAN_ANOMALY, 8, 4)} ${f(o.MEAN_MOTION, 11, 8)}${String(o.REV_AT_EPOCH || 0).padStart(5).slice(-5)}`;
  l1 = l1.padEnd(68).slice(0, 68); l2 = l2.padEnd(68).slice(0, 68);
  return { name: (o.OBJECT_NAME || '').trim(), l1: l1 + tleChecksum(l1), l2: l2 + tleChecksum(l2), epoch: ep, norad: +o.NORAD_CAT_ID };
}
/** Accepts either classic TLE text or a CelesTrak JSON array. */
export function parseAnyTLEList(text) {
  const t = (text || '').trim();
  if (t.startsWith('[')) { try { return JSON.parse(t).map(ommToTLE); } catch (e) { return []; } }
  return parseTLEList(t);
}

/** Try each source in turn until one gives a valid TLE. */
export async function fetchTLE(sources, timeoutMs = 8000) {
  const errors = [];
  for (const url of sources) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const tle = parseTLE(await res.text());
      if (!tle) throw new Error('unreadable data');
      tle.source = new URL(url).host;
      return tle;
    } catch (e) {
      errors.push(`${new URL(url).host}: ${e.message}`);
    }
  }
  throw new Error('No source answered (' + errors.join('; ') + ')');
}

export function makeSat(tle) {
  return S().twoline2satrec(tle.l1, tle.l2);
}

// ---------- geometry ----------

function observerGd(loc) {
  return { latitude: loc.lat * RAD, longitude: loc.lon * RAD, height: (loc.elev || 0) / 1000 };
}

/** Is a point in space (km, Earth-centred) lit by the Sun, or in Earth's shadow? */
export function isSunlit(eci, date) {
  const v = A().GeoVector('Sun', date, false);
  const sx = v.x * AU_KM, sy = v.y * AU_KM, sz = v.z * AU_KM;
  const sl = Math.hypot(sx, sy, sz);
  const ux = sx / sl, uy = sy / sl, uz = sz / sl;
  const dot = eci.x * ux + eci.y * uy + eci.z * uz;
  if (dot > 0) return true;                       // on the Sun's side of Earth
  const r2 = eci.x * eci.x + eci.y * eci.y + eci.z * eci.z;
  return Math.sqrt(Math.max(0, r2 - dot * dot)) > EARTH_R_KM; // outside the shadow cylinder
}

/** Where is the ISS at `date`, as seen from `loc`? */
export function issAt(satrec, loc, date) {
  const pv = S().propagate(satrec, date);
  if (!pv || !pv.position) return null;
  const gmst = S().gstime(date);
  const ecf = S().eciToEcf(pv.position, gmst);
  const look = S().ecfToLookAngles(observerGd(loc), ecf);
  const geo = S().eciToGeodetic(pv.position, gmst);
  return {
    az: ((look.azimuth * DEG) % 360 + 360) % 360,
    el: look.elevation * DEG,
    rangeKm: look.rangeSat,
    heightKm: geo.height,
    lat: geo.latitude * DEG,
    lon: geo.longitude * DEG,
    eci: pv.position,
  };
}

/** Live state for the ISS screen / pointer: position plus whether it is sunlit. */
export function issLive(satrec, loc, date) {
  const p = issAt(satrec, loc, date);
  if (!p) return null;
  p.sunlit = isSunlit(p.eci, date);
  return p;
}

// ---------- pass prediction ----------

/**
 * Find every pass over `loc` between `start` and start+days.
 * Each pass: { rise, peak, set: {t,az,el}, track:[[az,el,visible]...], visible, visStart, visEnd, inProgress }
 * "visible" = the ISS is sunlit while the observer's sky is dark enough, above opts.minVisibleEl.
 */
export function findPasses(satrec, loc, start, opts) {
  const obs = makeObserver(loc);
  const stepMs = opts.scanStepSec * 1000;
  const endMs = start.getTime() + opts.passDays * 86400000;
  const elAt = (ms) => { const p = issAt(satrec, loc, new Date(ms)); return p ? p.el : -90; };

  // Find the moment elevation crosses 0 between two scan points.
  const crossing = (a, b) => {
    for (let i = 0; i < 14; i++) {
      const m = (a + b) / 2;
      if ((elAt(a) > 0) === (elAt(m) > 0)) a = m; else b = m;
    }
    return (a + b) / 2;
  };

  const passes = [];
  let t = start.getTime();
  let inPass = elAt(t) > 0;
  let riseMs = inPass ? t : null;
  let startedInProgress = inPass;

  for (t += stepMs; t <= endMs; t += stepMs) {
    const up = elAt(t) > 0;
    if (!inPass && up) {
      inPass = true; riseMs = crossing(t - stepMs, t); startedInProgress = false;
    } else if (inPass && !up) {
      inPass = false;
      passes.push(buildPass(satrec, loc, obs, riseMs, crossing(t - stepMs, t), opts, startedInProgress));
      startedInProgress = false;
    }
  }
  return passes;
}

function buildPass(satrec, loc, obs, riseMs, setMs, opts, inProgress) {
  const step = opts.trackStepSec * 1000;
  const track = [];
  let peak = null, visStart = null, visEnd = null;
  let anyDark = false, anySunlit = false;

  const sample = (ms) => {
    const d = new Date(ms);
    const p = issAt(satrec, loc, d);
    if (!p) return;
    const dark = bodyPosition('Sun', d, obs).alt <= opts.darkSunAlt;
    const sunlit = isSunlit(p.eci, d);
    if (dark) anyDark = true;
    if (sunlit) anySunlit = true;
    const visible = dark && sunlit && p.el >= opts.minVisibleEl;
    track.push([p.az, Math.max(0, p.el), visible]);
    if (!peak || p.el > peak.el) peak = { t: d, az: p.az, el: p.el };
    if (visible) { if (!visStart) visStart = d; visEnd = d; }
  };

  for (let ms = riseMs; ms < setMs; ms += step) sample(ms);
  sample(setMs);

  const first = issAt(satrec, loc, new Date(riseMs + 1000));
  const last = issAt(satrec, loc, new Date(setMs - 1000));
  const maxEl = peak ? peak.el : 0;
  return {
    rise: { t: new Date(riseMs), az: first ? first.az : 0, el: 0 },
    peak: peak || { t: new Date(riseMs), az: 0, el: 0 },
    set: { t: new Date(setMs), az: last ? last.az : 0, el: 0 },
    track, inProgress,
    visible: !!visStart, visStart, visEnd,
    reason: visStart ? '' : !anyDark ? 'Sky too bright' : !anySunlit ? 'ISS in Earth’s shadow' : 'Too low to see',
    brightness: maxEl >= 60 ? 'Very bright' : maxEl >= 35 ? 'Bright' : maxEl >= 18 ? 'Fair' : 'Low & dim',
  };
}
