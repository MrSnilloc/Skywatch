// satellites.js — orbit data + pass lists for satellites other than the ISS (the ISS lives in issService.js).
//
// Every satellite is an "entry" shaped exactly like ctx.iss:
//   { id, name, norad, status:'idle|loading|ready|error', error, tle, satrec, passes, computedAt, stale }
// so the Passes screen can show any of them with the same code.
// ctx.sats = { items:{id:entry}, group:{status, error, list:[{name,norad,l1,l2,epoch,satrec}], source} }

import { fetchTLE, makeSat, findPasses, parseTLEList, issAt, isSunlit } from './iss.js';
import { store } from './store.js';

const tick = () => new Promise(r => setTimeout(r, 30));

export function initSats(ctx) {
  const items = {};
  for (const f of ctx.config.sats.featured) {
    items[f.id] = { id: f.id, name: f.name, norad: f.norad, status: 'idle', error: null, tle: null, satrec: null, passes: [], computedAt: 0, stale: false };
  }
  ctx.sats = { items, group: { status: 'idle', error: null, list: [], source: '' } };
}

/** The ISS entry is ctx.iss; everything else lives in ctx.sats.items. */
export function entryFor(ctx, id) {
  if (id === 'iss') return ctx.iss;
  return ctx.sats.items[id] || null;
}

export function listChoices(ctx) {
  return [{ id: 'iss', name: 'ISS' }, ...ctx.config.sats.featured.map(f => ({ id: f.id, name: f.name })),
    ...Object.values(ctx.sats.items).filter(e => e.extra).map(e => ({ id: e.id, name: e.name }))];
}

function computePasses(ctx, e) {
  e.satrec = makeSat(e.tle);
  e.stale = (Date.now() - e.tle.epoch) > ctx.config.iss.tleWarnDays * 86400000;
  e.passes = findPasses(e.satrec, ctx.location(), new Date(), ctx.config.iss);
  e.computedAt = Date.now();
  e.status = 'ready';
}

/** Load orbit data for a featured satellite and compute its passes. */
export async function loadSat(ctx, id, { force = false } = {}) {
  const e = ctx.sats.items[id];
  if (!e) return;
  if (e.status === 'loading') return;
  e.status = 'loading'; e.error = null; ctx.bus.emit('iss');
  await tick();
  const key = 'tle:' + e.norad;
  let tle = store.getCache(key);
  const fresh = tle && (Date.now() - tle.fetchedAt) < ctx.config.iss.refreshHours * 3600e3;
  if (force || !fresh) {
    try {
      const t = await fetchTLE(ctx.config.sats.singleUrl(e.norad), ctx.config.iss.fetchTimeoutMs);
      tle = { name: t.name, l1: t.l1, l2: t.l2, epoch: t.epoch.getTime(), fetchedAt: Date.now(), source: t.source };
      store.setCache(key, tle);
    } catch (err) { e.error = err.message; }
  }
  if (!tle) { e.status = 'error'; ctx.bus.emit('iss'); return; }
  e.tle = tle;
  computePasses(ctx, e);
  ctx.bus.emit('iss');
}

/** Re-do passes (e.g. location changed) for satellites already loaded. */
export function recomputeLoaded(ctx) {
  for (const e of Object.values(ctx.sats.items)) {
    if (e.status === 'ready' && e.tle) computePasses(ctx, e);
  }
}

/** Download the "brightest satellites" list (used for the More list and the sky-map markers). */
export async function loadGroup(ctx, { force = false } = {}) {
  const g = ctx.sats.group;
  if (g.status === 'loading') return;
  g.status = 'loading'; g.error = null; ctx.bus.emit('sats');
  let cached = store.getCache('tleGroup');
  const fresh = cached && (Date.now() - cached.fetchedAt) < ctx.config.iss.refreshHours * 3600e3;
  if (force || !fresh) {
    try {
      const res = await fetch(ctx.config.sats.groupUrl, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const list = parseTLEList(await res.text());
      if (!list.length) throw new Error('unreadable data');
      cached = { fetchedAt: Date.now(), source: new URL(ctx.config.sats.groupUrl).host,
        list: list.slice(0, ctx.config.sats.groupMax).map(t => ({ name: t.name, norad: t.norad, l1: t.l1, l2: t.l2, epoch: t.epoch.getTime() })) };
      store.setCache('tleGroup', cached);
    } catch (e) { g.error = e.message; }
  }
  if (!cached) { g.status = 'error'; ctx.bus.emit('sats'); return; }
  g.list = cached.list.map(t => ({ ...t, satrec: makeSat(t) }));
  g.source = cached.source; g.fetchedAt = cached.fetchedAt;
  g.status = 'ready';
  ctx.bus.emit('sats');
}

/** Add one satellite from the group list as a selectable entry (no download needed). */
export function addFromGroup(ctx, norad) {
  const id = 'n' + norad;
  if (ctx.sats.items[id]) return id;
  const t = ctx.sats.group.list.find(x => x.norad === norad);
  if (!t) return null;
  const e = { id, name: t.name, norad, extra: true, status: 'idle', error: null, tle: { name: t.name, l1: t.l1, l2: t.l2, epoch: t.epoch, fetchedAt: ctx.sats.group.fetchedAt || Date.now(), source: ctx.sats.group.source }, satrec: null, passes: [], computedAt: 0, stale: false };
  ctx.sats.items[id] = e;
  return id;
}

export function computeEntry(ctx, id) {
  const e = ctx.sats.items[id];
  if (!e || !e.tle) return;
  computePasses(ctx, e);
}

/**
 * Satellites currently above the horizon (for the sky map). Only those lit by the Sun are flagged `visible`
 * (and only when the sky is dark enough — the caller decides that).
 */
export function overheadNow(ctx, loc, date, minEl) {
  const out = [];
  const seen = new Set();
  const byNorad = {};
  for (const f of ctx.config.sats.featured) byNorad[f.norad] = f.id;
  const add = (name, satrec, id) => {
    const p = issAt(satrec, loc, date);
    if (!p || p.el < minEl) return;
    out.push({ id, name, az: p.az, el: p.el, rangeKm: p.rangeKm, sunlit: isSunlit(p.eci, date) });
  };
  if (ctx.iss.satrec) { add('ISS', ctx.iss.satrec, 'iss'); seen.add(25544); }
  for (const e of Object.values(ctx.sats.items)) if (e.satrec) { add(e.name, e.satrec, e.id); seen.add(e.norad); }
  for (const t of ctx.sats.group.list) if (!seen.has(t.norad) && !/DEB|R\/B/.test(t.name)) add(t.name, t.satrec, byNorad[t.norad] || 'n' + t.norad);
  return out;
}
