// aurora.js — is a geomagnetic storm strong enough to bring the aurora to YOUR latitude?
//
// Data: NOAA Space Weather Prediction Center's 3-day planetary Kp forecast (US government, public domain, free,
// no key). Kp runs 0–9; the stronger the storm, the further from the poles the aurora reaches.
// Rule of thumb used here (numbers in config.aurora): the aurora's edge sits near magnetic latitude
// 66.5° − 2° per Kp step, and can be seen low on the horizon from a few degrees beyond that.
//
// ctx.aurora = { status: 'idle' | 'loading' | 'ready' | 'error', slots: [{ t: Date, kp, predicted }], at }
// Emits the 'aurora' bus event when the forecast arrives.

import { store } from './store.js';
import { makeObserver, bodyPosition } from './sky.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI, HOUR = 3600e3;

/** Magnetic latitude of a place (simple tilted-dipole model; the pole position is in config.aurora). */
export function magneticLat(loc, cfg) {
  const a = loc.lat * RAD, p = cfg.poleLat * RAD;
  return Math.asin(Math.sin(a) * Math.sin(p) + Math.cos(a) * Math.cos(p) * Math.cos((loc.lon - cfg.poleLon) * RAD)) * DEG;
}

/** The Kp a storm must reach before the aurora could show low on your horizon (can be above 9 = never). */
export function kpNeeded(loc, cfg) {
  return Math.max(cfg.minKp, (cfg.ovalLatAtKp0 - cfg.horizonReachDeg - Math.abs(magneticLat(loc, cfg))) / cfg.degPerKp);
}

/** Load the forecast (kept for config.aurora.cacheMin minutes). Safe to call often. */
export async function loadAurora(ctx, { force = false } = {}) {
  const cfg = ctx.config.aurora;
  if (!ctx.aurora) ctx.aurora = { status: 'idle', slots: [], at: 0 };
  const S = ctx.aurora, use = (rows, at) => { S.slots = rows.map(r => ({ t: new Date(r[0]), kp: r[1], predicted: !!r[2] })); S.at = at; S.status = 'ready'; };
  const c = store.getCache('aurora');
  if (c && !S.slots.length) use(c.rows, c.at);
  if (S.status === 'loading' || (!force && S.at && Date.now() - S.at < cfg.cacheMin * 60e3)) return S;
  const had = S.slots.length; S.status = had ? 'ready' : 'loading';
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(cfg.forecastUrl, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    // rows: { time_tag (UTC, no "Z"), kp, observed: 'observed' | 'estimated' | 'predicted' }
    const rows = (await res.json()).map(r => [Date.parse(r.time_tag + 'Z'), +r.kp, r.observed === 'predicted' ? 1 : 0]).filter(r => !isNaN(r[0]) && !isNaN(r[1]));
    if (!rows.length) throw new Error('no data');
    store.setCache('aurora', { at: Date.now(), rows });
    use(rows, Date.now());
  } catch (e) { if (!had) S.status = 'error'; S.at = Date.now() - (cfg.cacheMin - 5) * 60e3; }   // try again in 5 minutes
  finally { clearTimeout(timer); }
  ctx.bus.emit('aurora');
  return S;
}

/**
 * Nights in the forecast with a chance of aurora from here, soonest first:
 * [{ from, to (Dates, dark hours only), kp (strongest), need, level: 'good' | 'slim', dir: 'north' | 'south' }]
 * 'good' = the storm reaches your latitude; 'slim' = just short of it (config.aurora.slimKp below) — a camera may catch it.
 */
export function auroraChances(ctx, now = new Date()) {
  const S = ctx.aurora, cfg = ctx.config.aurora, loc = ctx.location();
  if (!S || !S.slots.length) return [];
  const need = kpNeeded(loc, cfg), obs = makeObserver(loc), out = [];
  const dark = (t) => bodyPosition('Sun', new Date(t), obs).alt < cfg.darkSunAlt;
  for (const s of S.slots) {
    const a = Math.max(s.t.getTime(), now.getTime()), b = s.t.getTime() + 3 * HOUR;
    if (b <= a || s.kp < need - cfg.slimKp) continue;
    let from = null, to = null;                                   // the dark part of this 3-hour block
    for (let t = a; t <= b; t += 15 * 60e3) if (dark(t)) { if (from == null) from = t; to = t; }
    if (from == null) continue;
    const last = out[out.length - 1];
    if (last && from - last.to.getTime() < 4 * HOUR) { last.to = new Date(to); last.kp = Math.max(last.kp, s.kp); }   // same night
    else out.push({ from: new Date(from), to: new Date(to), kp: s.kp, need });
  }
  for (const c of out) { c.level = c.kp >= need ? 'good' : 'slim'; c.dir = loc.lat >= 0 ? 'north' : 'south'; }
  return out;
}

/** NOAA's storm scale name for a Kp value: 5 = G1 (minor) … 9 = G5 (extreme). '' below a storm. */
export const stormName = (kp) => (kp < 5 ? '' : ['G1 minor', 'G2 moderate', 'G3 strong', 'G4 severe', 'G5 extreme'][Math.min(4, Math.floor(kp) - 5)] + ' storm');
