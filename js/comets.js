// comets.js — every known comet's orbit (Minor Planet Center or NASA/JPL), where it is, and how bright it should be.
// Comet brightness predictions are famously unreliable: comets can fizzle or flare. Treat magnitudes as estimates.
// ctx.comets = { status, error, list:[comet], source, fetchedAt }

import { store } from './store.js';

const A = () => globalThis.Astronomy;
const RAD = Math.PI / 180, K = 0.01720209895;          // Gaussian gravitational constant (rad/day)
const OBL = 23.4392911 * RAD;                           // obliquity of the ecliptic (J2000)
export const jd = (d) => d.getTime() / 86400000 + 2440587.5;

// ---------- parsing ----------

/** One line of MPC CometEls.txt (fixed columns). */
export function parseMPCLine(l) {
  if (l.length < 100) return null;
  const n = (a, b) => parseFloat(l.slice(a, b));
  const y = parseInt(l.slice(14, 18), 10), m = parseInt(l.slice(19, 21), 10), d = n(22, 29);
  const q = n(30, 39), e = n(41, 49), w = n(51, 59), node = n(61, 69), i = n(71, 79), H = n(91, 95), G = n(96, 100);
  if (!(q > 0) || isNaN(e) || isNaN(H) || !y) return null;
  const T = Date.UTC(y, m - 1, 1) / 86400000 + 2440587.5 + (d - 1);
  const name = l.slice(102, 158).trim();
  return { id: name.split('(')[0].trim() || name, name, q, e, i, node, w, T, H, K: isNaN(G) ? 10 : 2.5 * G };
}

function parseJPL(j) {
  const f = j.fields, idx = (k) => f.indexOf(k);
  return (j.data || []).map(r => {
    const g = (k) => parseFloat(r[idx(k)]);
    const name = String(r[idx('full_name')]).trim();
    const c = { id: name.replace(/\s*\(.*\)$/, '').trim(), name, q: g('q'), e: g('e'), i: g('i'), node: g('om'), w: g('w'), T: g('tp'), H: g('M1'), K: isNaN(g('K1')) ? 10 : g('K1') };
    return c.q > 0 && !isNaN(c.H) && !isNaN(c.T) ? c : null;
  }).filter(Boolean);
}

export async function loadComets(ctx, { force = false } = {}) {
  if (!ctx.comets) ctx.comets = { status: 'idle', error: null, list: [], source: '', fetchedAt: 0 };
  const C = ctx.comets;
  if (C.status === 'loading') return;
  C.status = 'loading'; C.error = null; ctx.bus.emit('comets');
  let cached = store.getCache('comets');
  const fresh = cached && Date.now() - cached.fetchedAt < ctx.config.comets.cacheHours * 3600e3;
  if (force || !fresh) {
    const errs = [];
    const relay = (store.get('relayUrl') || '').trim().replace(/\/+$/, '');
    const urls = ctx.config.comets.urls.map(u => u === 'relay:comets' ? (relay ? relay + '/comets' : null) : u).filter(Boolean);
    for (const url of urls) {
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const list = (url.includes('jpl') || url.endsWith('/comets')) ? parseJPL(await res.json()) : (await res.text()).split(/\r?\n/).map(parseMPCLine).filter(Boolean);
        if (!list.length) throw new Error('no comets in reply');
        cached = { fetchedAt: Date.now(), source: new URL(url).host, list };
        store.setCache('comets', cached);
        break;
      } catch (e) { errs.push(`${new URL(url).host}: ${e.message}`); }
    }
    if (!fresh && errs.length === urls.length) C.error = errs.join('; ');
  }
  if (!cached) { C.status = 'error'; ctx.bus.emit('comets'); return; }
  C.list = cached.list; C.source = cached.source; C.fetchedAt = cached.fetchedAt; C.status = 'ready';
  ctx.bus.emit('comets');
}

// ---------- orbit maths ----------

/** Heliocentric position on the orbit at Julian date t: ecliptic J2000 [x,y,z] in AU, plus r. */
export function helioEcl(c, t) {
  const dt = t - c.T, e = c.e, q = c.q;
  let r, nu;
  if (e < 0.999) {                                    // ellipse
    const a = q / (1 - e), M = K * dt / Math.pow(a, 1.5);
    const Mn = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    let E = e < 0.8 ? Mn : Math.sign(Mn) * Math.cbrt(6 * Math.abs(Mn)) || Mn;
    for (let k = 0; k < 60; k++) { const d = (E - e * Math.sin(E) - Mn) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-12) break; }
    r = a * (1 - e * Math.cos(E));
    nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  } else if (e <= 1.001) {                            // (near-)parabola: Barker's equation
    const W = K * dt * Math.sqrt(1 / (2 * q * q * q)) * 3 / 2 * (2 / 3);   // s + s^3/3 = k dt / sqrt(2 q^3)
    const Y = Math.cbrt(1.5 * W + Math.sqrt(2.25 * W * W + 1)), s = Y - 1 / Y;
    nu = 2 * Math.atan(s); r = q * (1 + s * s);
  } else {                                            // hyperbola
    const a = q / (e - 1), M = K * dt / Math.pow(a, 1.5);
    let H = Math.asinh(M / e);
    for (let k = 0; k < 60; k++) { const d = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1); H -= d; if (Math.abs(d) < 1e-12) break; }
    r = a * (e * Math.cosh(H) - 1);
    nu = 2 * Math.atan(Math.sqrt((e + 1) / (e - 1)) * Math.tanh(H / 2));
  }
  const O = c.node * RAD, w = c.w * RAD, i = c.i * RAD, u = w + nu;
  return [r * (Math.cos(O) * Math.cos(u) - Math.sin(O) * Math.sin(u) * Math.cos(i)),
    r * (Math.sin(O) * Math.cos(u) + Math.cos(O) * Math.sin(u) * Math.cos(i)),
    r * Math.sin(u) * Math.sin(i), r];
}

export const eclToEqj = (v) => [v[0], v[1] * Math.cos(OBL) - v[2] * Math.sin(OBL), v[1] * Math.sin(OBL) + v[2] * Math.cos(OBL)];

/** Everything about a comet at a moment. ra/dec are J2000 degrees. */
export function cometAt(c, date) {
  const h = helioEcl(c, jd(date));
  const hq = eclToEqj(h);
  const ev = A().HelioVector('Earth', date);
  const g = [hq[0] - ev.x, hq[1] - ev.y, hq[2] - ev.z];
  const delta = Math.hypot(g[0], g[1], g[2]), r = h[3];
  const mag = c.H + 5 * Math.log10(delta) + c.K * Math.log10(r);
  const ra = ((Math.atan2(g[1], g[0]) / RAD) + 360) % 360, dec = Math.asin(g[2] / delta) / RAD;
  const se = Math.hypot(ev.x, ev.y, ev.z);
  const cosEl = -((-ev.x) * 0 + 0) || 0; void cosEl;
  const elong = Math.acos(Math.max(-1, Math.min(1, -(g[0] * ev.x + g[1] * ev.y + g[2] * ev.z) / (delta * se)))) / RAD;
  return { helio: h, helioEqj: hq, geo: g, r, delta, mag, ra, dec, elong };
}

export const verdict = (mag, cfg) => mag <= cfg.nakedEyeMag ? { level: 'good', label: 'Naked eye' } : mag <= cfg.binocularMag ? { level: 'ok', label: 'Binoculars' } : { level: 'dim', label: 'Telescope' };

/** Comets bright enough to list now, or due to get bright within `days`. Cached per day. */
let brightCache = null;
export function interestingComets(ctx, now = new Date(), days = 180) {
  const C = ctx.comets; if (!C || C.status !== 'ready') return [];
  const key = `${C.fetchedAt}|${now.toDateString()}`;
  if (brightCache && brightCache.key === key) return brightCache.list;
  const lim = ctx.config.comets.listMag, out = [];
  for (const c of C.list) {
    if (c.q > 6) continue;                                   // far-out comets never get bright
    let best = null;
    for (let d = 0; d <= days; d += d < 30 ? 3 : 6) {
      const t = new Date(now.getTime() + d * 86400e3);
      const s = cometAt(c, t);
      if (!best || s.mag < best.mag) best = { mag: s.mag, t };
    }
    if (best.mag > lim) continue;
    out.push({ c, now: cometAt(c, now), peak: best });
  }
  out.sort((a, b) => a.peak.mag - b.peak.mag);
  brightCache = { key, list: out.slice(0, 30) };
  return brightCache.list;
}

/** Best moment to see a comet in the next dark stretch: {t, az, alt} (alt may be < 0 if it never rises). */
export function bestTonight(c, obs, now, sky) {
  let best = null;
  for (let m = 0; m <= 20 * 60; m += 20) {
    const t = new Date(now.getTime() + m * 60000);
    if (sky.bodyPosition('Sun', t, obs).alt > -10) { if (best && best.alt > 0) break; continue; }
    const st = cometAt(c, t), p = sky.fixedPosition(st.ra, st.dec, t, obs);
    if (!best || p.alt > best.alt) best = { t, az: p.az, alt: p.alt };
  }
  return best;
}
