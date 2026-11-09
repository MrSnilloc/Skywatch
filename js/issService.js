// issService.js — keeps the ISS orbit data and pass list fresh, and tells the screens when it changes.
// Shared state lives on ctx.iss: { status, error, tle, satrec, passes, computedAt, stale }

import { fetchTLE, makeSat, findPasses } from './iss.js';
import { store } from './store.js';

const tick = () => new Promise(r => setTimeout(r, 30)); // let the screen paint "loading" first

/** Load (or reload) orbit data and recompute the pass list. */
export async function refreshIss(ctx, { forceFetch = false } = {}) {
  const cfg = ctx.config.iss;
  const iss = ctx.iss;
  iss.status = 'loading'; iss.error = null;
  ctx.bus.emit('iss');
  await tick();

  let tle = store.getCache('tle');
  const fresh = tle && (Date.now() - tle.fetchedAt) < cfg.refreshHours * 3600e3;
  if (forceFetch || !fresh) {
    try {
      const t = await fetchTLE(cfg.tleSources, cfg.fetchTimeoutMs);
      tle = { name: t.name, l1: t.l1, l2: t.l2, epoch: t.epoch.getTime(), fetchedAt: Date.now() };
      store.setCache('tle', tle);
    } catch (e) {
      iss.error = e.message; // fall back to cached data below, if any
    }
  }

  if (!tle) { iss.status = 'error'; ctx.bus.emit('iss'); return; }

  iss.tle = tle;
  iss.satrec = makeSat(tle);
  iss.stale = (Date.now() - tle.epoch) > cfg.tleWarnDays * 86400000;
  iss.passes = findPasses(iss.satrec, ctx.location(), new Date(), cfg);
  iss.computedAt = Date.now();
  iss.status = 'ready';
  ctx.bus.emit('iss');
}

/** Passes the user would actually want to see, honouring their settings. */
export function visiblePasses(ctx) {
  const min = store.get('minPeakEl');
  const all = store.get('showAllPasses');
  const now = Date.now();
  return ctx.iss.passes.filter(p => p.set.t.getTime() > now && (all || (p.visible && p.peak.el >= min)));
}

/** Recompute when location changes or the list has run dry. */
export function needsRecompute(ctx) {
  const iss = ctx.iss;
  if (iss.status !== 'ready') return false;
  const ageH = (Date.now() - iss.computedAt) / 3600e3;
  return ageH > ctx.config.iss.refreshHours;
}
