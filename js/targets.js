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
import { skyData as skyDataNow } from './skydata.js';
import { byCode, radiantNow, gazeSpot, activeShowers } from './showers.js';

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

// Meteor showers: aim at a radiant ("radiant:LEO") or at the best spot to watch from ("gaze:LEO").
const showerProvider = {
  list: () => activeShowers().map(sh => ({ id: 'radiant:' + sh.code, label: sh.name + ' radiant' })),
  resolve(id, ctx, date) {
    const [kind, code] = id.split(':');
    if (kind !== 'radiant' && kind !== 'gaze') return null;
    const sh = byCode(code);
    if (!sh) return null;
    const r = radiantNow(sh, date, sky.makeObserver(ctx.location()));
    if (kind === 'radiant') return { id, label: sh.name + ' radiant', az: r.az, alt: r.alt, note: `${sh.constellation} · meteors streak away from here` };
    const g = gazeSpot(r.az, r.alt);
    return { id, label: sh.name + ' — best view', az: g.az, alt: g.alt, note: 'face here, then watch the whole sky' };
  },
};

// Other satellites ("sat:css", "sat:hst", "sat:n12345"), looked up from whatever orbit data is loaded.
const satProvider = {
  list: () => [],
  resolve(id, ctx, date) {
    if (!id.startsWith('sat:')) return null;
    const key = id.slice(4);
    if (key === 'iss') return issProvider.resolve('iss', ctx, date);
    let name = key, satrec = null;
    const e = ctx.sats && ctx.sats.items[key];
    if (e && e.satrec) { name = e.name; satrec = e.satrec; }
    else if (ctx.sats) {
      const t = ctx.sats.group.list.find(x => 'n' + x.norad === key || (ctx.config.sats.featured.find(f => f.id === key) || {}).norad === x.norad);
      if (t) { name = t.name; satrec = t.satrec; }
    }
    if (!satrec) return { id, label: name, az: 0, alt: 0, unavailable: true, note: 'Orbit data not loaded' };
    const p = issLive(satrec, ctx.location(), date);
    if (!p) return { id, label: name, az: 0, alt: 0, unavailable: true, note: 'Orbit data is out of range' };
    return { id, label: name, az: p.az, alt: p.el, note: `${Math.round(p.rangeKm)} km away · ${p.sunlit ? 'sunlit' : 'in Earth’s shadow (can’t be seen)'}` };
  },
};

// Stars and deep-sky objects picked on the Sky map ("star:123", "dso:4").
const starProvider = {
  list: () => [],
  resolve(id, ctx, date) {
    const D = skyDataNow();
    if (!D || !(id.startsWith('star:') || id.startsWith('dso:'))) return null;
    const i = +id.slice(5);
    if (id.startsWith('star:')) {
      const s = D.raw.stars[i]; if (!s) return null;
      const p = sky.fixedPosition(s[0], s[1], date, sky.makeObserver(ctx.location()));
      return { id, label: D.raw.names[i] || 'Star', az: p.az, alt: p.alt, note: `magnitude ${s[2].toFixed(1)}` };
    }
    const d = D.raw.dso[i]; if (!d) return null;
    const p = sky.fixedPosition(d[0], d[1], date, sky.makeObserver(ctx.location()));
    return { id, label: d[5] || d[4], az: p.az, alt: p.alt, note: d[4] };
  },
};

const providers = [issProvider, moonProvider, planetProvider, showerProvider, satProvider, starProvider];

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
