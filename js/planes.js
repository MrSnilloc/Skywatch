// planes.js — live aircraft around you from free ADS-B feeds, and where they appear in YOUR sky.
// ctx.planes = { status, error, list:[plane], at, source }
// plane: { id, call, type, reg, lat, lon, altFt, gsKt, track, vrate, seen }

import { isNativeApp } from './platform.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI, RE = 6371000, FT = 0.3048;

function normADSB(j) {
  return (j.ac || j.aircraft || []).filter(a => a.lat != null && a.lon != null && a.alt_baro !== 'ground').map(a => ({
    id: a.hex, call: (a.flight || '').trim() || a.r || a.hex, type: a.t || '', desc: a.desc || '', reg: a.r || '',
    lat: a.lat, lon: a.lon, altFt: typeof a.alt_geom === 'number' ? a.alt_geom : typeof a.alt_baro === 'number' ? a.alt_baro : 0,
    gsKt: a.gs || 0, track: a.track ?? a.true_heading ?? 0, vrate: a.baro_rate || a.geom_rate || 0, ownOp: a.ownOp || '',
    seen: Date.now() - (a.seen_pos || a.seen || 0) * 1000,
  }));
}
function normOpenSky(j) {
  return (j.states || []).filter(s => s[5] != null && s[6] != null && !s[8]).map(s => ({
    id: s[0], call: (s[1] || '').trim() || s[0], type: '', desc: '', reg: '', lat: s[6], lon: s[5],
    altFt: ((s[13] ?? s[7]) || 0) / FT, gsKt: (s[9] || 0) * 1.94384, track: s[10] || 0, vrate: (s[11] || 0) * 196.85, ownOp: s[2] || '',
    seen: (s[4] || Date.now() / 1000) * 1000,
  }));
}

export async function loadPlanes(ctx, { force = false } = {}) {
  if (!ctx.planes) ctx.planes = { status: 'idle', error: null, list: [], at: 0, source: '' };
  const P = ctx.planes, cfg = ctx.config.planes;
  if (P.status === 'loading' || (!force && Date.now() - P.at < cfg.refreshSec * 800)) return;
  P.status = P.list.length ? 'ready' : 'loading'; P.busy = true; ctx.bus.emit('planes');
  const loc = ctx.location(), errs = [];
  if (!isNativeApp()) {                    // browsers block these feeds — only the Android app can read them
    P.status = 'error'; P.webOnly = true; P.busy = false; P.at = Date.now(); P.error = 'Live planes need the UpSight Android app';
    ctx.bus.emit('planes'); return;
  }
  const all = cfg.sources;
  const order = P.sourceUrl && all.includes(P.sourceUrl) ? [P.sourceUrl, ...all.filter(s => s !== P.sourceUrl)] : all;
  for (const src of order) {
    try {
      let url;
      if (src === 'opensky') {
        const dLat = cfg.radiusNm / 60, dLon = dLat / Math.cos(loc.lat * RAD);
        url = `https://opensky-network.org/api/states/all?lamin=${(loc.lat - dLat).toFixed(3)}&lomin=${(loc.lon - dLon).toFixed(3)}&lamax=${(loc.lat + dLat).toFixed(3)}&lomax=${(loc.lon + dLon).toFixed(3)}`;
      } else url = src.replace('{lat}', loc.lat.toFixed(4)).replace('{lon}', loc.lon.toFixed(4)).replace('{nm}', cfg.radiusNm);
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 7000);
      const res = await fetch(url, { signal: ctl.signal, cache: 'no-store' }); clearTimeout(tm);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      P.list = src === 'opensky' ? normOpenSky(j) : normADSB(j);
      // remember where each plane has been (for trails), last ~6 minutes
      if (!P.trails) P.trails = {};
      const cut = Date.now() - 6 * 60e3;
      for (const pl of P.list) {
        const t = P.trails[pl.id] || (P.trails[pl.id] = []);
        const last = t[t.length - 1];
        if (!last || last.lat !== pl.lat || last.lon !== pl.lon) t.push({ lat: pl.lat, lon: pl.lon, t: pl.seen });
        while (t.length && t[0].t < cut) t.shift();
      }
      for (const id of Object.keys(P.trails)) if (!P.trails[id].length || P.trails[id][P.trails[id].length - 1].t < cut) delete P.trails[id];
      P.source = new URL(url).host; P.sourceUrl = src; P.at = Date.now(); P.status = 'ready'; P.error = null; P.busy = false;
      ctx.bus.emit('planes');
      return;
    } catch (e) { errs.push(`${src === 'opensky' ? 'opensky-network.org' : new URL(src.replace(/\{\w+\}/g, '0')).host}: ${e.name === 'AbortError' ? 'timed out' : e.message}`); }
  }
  P.busy = false; P.at = Date.now();
  if (!P.list.length) { P.status = 'error'; P.error = errs.join('; '); }
  ctx.bus.emit('planes');
}

/** Where is a plane in your sky now? Moves it forward along its heading since the last report. */
export function planeLook(p, loc, now = Date.now()) {
  const dt = Math.max(0, Math.min(40, (now - p.seen) / 1000));
  const dist = p.gsKt * 0.514444 * dt, br = p.track * RAD;
  const lat = p.lat + (dist * Math.cos(br)) / RE * DEG, lon = p.lon + (dist * Math.sin(br)) / (RE * Math.cos(p.lat * RAD)) * DEG;
  const alt = p.altFt * FT + (p.vrate * FT / 60) * dt;
  // local East/North/Up offset, accounting for Earth's curve
  const toEcef = (la, lo, h) => { const a = la * RAD, b = lo * RAD, r = RE + h; return [r * Math.cos(a) * Math.cos(b), r * Math.cos(a) * Math.sin(b), r * Math.sin(a)]; };
  const o = toEcef(loc.lat, loc.lon, loc.elev || 0), q = toEcef(lat, lon, alt);
  const d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]];
  const a = loc.lat * RAD, b = loc.lon * RAD;
  const e = -Math.sin(b) * d[0] + Math.cos(b) * d[1];
  const n = -Math.sin(a) * Math.cos(b) * d[0] - Math.sin(a) * Math.sin(b) * d[1] + Math.cos(a) * d[2];
  const u = Math.cos(a) * Math.cos(b) * d[0] + Math.cos(a) * Math.sin(b) * d[1] + Math.sin(a) * d[2];
  const range = Math.hypot(e, n, u);
  return { az: ((Math.atan2(e, n) * DEG) + 360) % 360, el: Math.asin(u / range) * DEG, rangeKm: range / 1000, groundKm: Math.hypot(e, n) / 1000, lat, lon, altFt: alt / FT };
}

export const kmToMi = (km) => km * 0.621371;
export const ktToMph = (kt) => kt * 1.15078;

/** Colour by altitude: low & slow = warm, cruising = cool. */
export function altColor(ft) { return ft < 5000 ? '#ff9a4d' : ft < 15000 ? '#ffd27a' : ft < 28000 ? '#9fe0ff' : '#5cc8ff'; }

/**
 * Will this plane pass (nearly) over you soon? Straight-line guess from its heading and speed.
 * -> { inSec, distKm (closest), elDeg (how high it'll be then), approaching } or null
 */
export function closestApproach(p, loc, now = Date.now()) {
  const lk = planeLook(p, loc, now);
  const e = lk.groundKm * Math.sin(lk.az * RAD), n = lk.groundKm * Math.cos(lk.az * RAD);
  const v = p.gsKt * 0.000514444, ve = v * Math.sin(p.track * RAD), vn = v * Math.cos(p.track * RAD);
  const vv = ve * ve + vn * vn; if (vv < 1e-9) return null;
  const t = -(e * ve + n * vn) / vv;
  const de = e + ve * t, dn = n + vn * t, d = Math.hypot(de, dn);
  return { inSec: t, distKm: d, elDeg: Math.atan2(p.altFt * FT / 1000, Math.max(0.05, d)) * DEG, approaching: t > 0, now: lk };
}

/** Planes that will pass within `km` of you in the next `maxSec` seconds, soonest first. */
export function overheadSoon(ctx, km = 4, maxSec = 300) {
  const P = ctx.planes; if (!P || !P.list.length) return [];
  const loc = ctx.location();
  return P.list.map(p => ({ p, c: closestApproach(p, loc) })).filter(x => x.c && x.c.inSec > -20 && x.c.inSec < maxSec && x.c.distKm < km && x.p.altFt > 500)
    .sort((a, b) => a.c.inSec - b.c.inSec);
}
