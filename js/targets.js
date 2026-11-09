// targets.js — one place that knows every thing the Point screen can aim at.
//
// A "provider" has:
//   list(ctx)                -> [{ id, label, color? }]    what to offer as chips
//   resolve(id, ctx, date)   -> { id, label, az, alt, note? } or null if the id isn't yours
//
// TO ADD A NEW TARGET TYPE (e.g. meteor-shower radiants, bright stars, Tiangong):
// write a provider below and add it to `providers`. Nothing else needs to change.

import * as sky from './sky.js';
import { issLive } from './iss.js';

const moonProvider = {
  list: () => [{ id: 'moon', label: 'Moon' }],
  resolve(id, ctx, date) {
    if (id !== 'moon') return null;
    const p = sky.bodyPosition('Moon', date, sky.makeObserver(ctx.location()));
    return { id, label: 'Moon', ...p };
  },
};

const planetProvider = {
  list: (ctx) => [...ctx.config.sky.planets, ...ctx.config.sky.farPlanets].map(n => ({
    id: 'planet:' + n, label: n, color: ctx.config.sky.planetColors[n],
  })),
  resolve(id, ctx, date) {
    if (!id.startsWith('planet:')) return null;
    const name = id.slice(7);
    const p = sky.bodyPosition(name, date, sky.makeObserver(ctx.location()));
    return { id, label: name, ...p };
  },
};

const issProvider = {
  list: () => [{ id: 'iss', label: 'ISS' }],
  resolve(id, ctx, date) {
    if (id !== 'iss') return null;
    if (!ctx.iss.satrec) return { id, label: 'ISS', az: 0, alt: 0, unavailable: true, note: 'Orbit data not loaded yet' };
    const p = issLive(ctx.iss.satrec, ctx.location(), date);
    if (!p) return { id, label: 'ISS', az: 0, alt: 0, unavailable: true, note: 'Orbit data is out of range' };
    return {
      id, label: 'ISS', az: p.az, alt: p.el,
      note: `${Math.round(p.rangeKm)} km away · ${p.sunlit ? 'sunlit' : 'in Earth’s shadow (can’t be seen)'}`,
    };
  },
};

const providers = [issProvider, moonProvider, planetProvider];

export function listTargets(ctx) {
  return providers.flatMap(p => p.list(ctx));
}

export function resolveTarget(id, ctx, date = new Date()) {
  for (const p of providers) {
    const t = p.resolve(id, ctx, date);
    if (t) return t;
  }
  return null;
}
