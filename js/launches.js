// launches.js — upcoming rocket launches (Launch Library 2) and whether you could see them from where you are.
// ctx.launches = { status:'idle|loading|ready|error', error, list:[launch], fetchedAt }

import { store } from './store.js';
import { makeObserver, bodyPosition, dirName } from './sky.js';

const tick = () => new Promise(r => setTimeout(r, 20));
const num = (v) => (v == null || v === '' ? null : parseFloat(v));

function normalise(r) {
  const pad = r.pad || {};
  return {
    id: r.id, name: r.name || 'Launch', net: new Date(r.net || r.window_start),
    windowStart: r.window_start ? new Date(r.window_start) : null, windowEnd: r.window_end ? new Date(r.window_end) : null,
    status: (r.status && (r.status.abbrev || r.status.name)) || '', statusName: (r.status && r.status.name) || '',
    provider: (r.launch_service_provider && r.launch_service_provider.name) || (r.lsp_name) || '',
    rocket: (r.rocket && r.rocket.configuration && (r.rocket.configuration.full_name || r.rocket.configuration.name)) || '',
    mission: (r.mission && r.mission.description) || '', orbit: (r.mission && r.mission.orbit && (r.mission.orbit.abbrev || r.mission.orbit.name)) || '',
    pad: { name: pad.name || '', lat: num(pad.latitude), lon: num(pad.longitude), where: (pad.location && pad.location.name) || '' },
  };
}

export async function loadLaunches(ctx, { force = false } = {}) {
  if (!ctx.launches) ctx.launches = { status: 'idle', error: null, list: [], fetchedAt: 0 };
  const L = ctx.launches;
  if (L.status === 'loading') return;
  L.status = 'loading'; L.error = null; ctx.bus.emit('launches');
  await tick();
  let cached = store.getCache('launches');
  const fresh = cached && Date.now() - cached.fetchedAt < ctx.config.launches.cacheMin * 60e3;
  if (force || !fresh) {
    try {
      const res = await fetch(ctx.config.launches.url, { cache: 'no-store' });
      if (res.status === 429) throw new Error('too many requests — try again in a while');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      cached = { fetchedAt: Date.now(), results: (j.results || []).map(normalise) };
      store.setCache('launches', cached);
    } catch (e) { L.error = e.message; }
  }
  if (!cached) { L.status = 'error'; ctx.bus.emit('launches'); return; }
  L.list = cached.results.map(x => ({ ...x, net: new Date(x.net), windowStart: x.windowStart && new Date(x.windowStart), windowEnd: x.windowEnd && new Date(x.windowEnd) }))
    .filter(x => x.net.getTime() > Date.now() - 3 * 3600e3).sort((a, b) => a.net - b.net);
  L.fetchedAt = cached.fetchedAt; L.status = 'ready';
  ctx.bus.emit('launches');
}

const RAD = Math.PI / 180;
function distBearing(a, b) {
  const p1 = a.lat * RAD, p2 = b.lat * RAD, dl = (b.lon - a.lon) * RAD;
  const d = 2 * 6371 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2));
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { km: d, bearing: ((Math.atan2(y, x) / RAD) + 360) % 360 };
}

/**
 * Could you see this launch from `loc`?
 * -> { level:'likely'|'maybe'|'day'|'no', label, km, dir, note }
 */
export function assess(l, loc, cfg) {
  if (l.pad.lat == null || l.pad.lon == null) return { level: 'no', label: 'Location unknown', km: null, dir: '' };
  const { km, bearing } = distBearing(loc, l.pad);
  const dir = dirName(bearing);
  const sunHere = bodyPosition('Sun', l.net, makeObserver(loc)).alt;
  const sunPad = bodyPosition('Sun', l.net, makeObserver({ lat: l.pad.lat, lon: l.pad.lon, elev: 0 })).alt;
  const dark = sunHere < -4;
  const jelly = sunHere < -4 && sunPad > -18 && sunPad < 2;   // twilight: exhaust plume lit by the Sun ("jellyfish")
  const far = km > cfg.maybeKm;
  if (far) return { level: 'no', label: `${Math.round(km).toLocaleString()} km away`, km, dir };
  if (!dark) return { level: 'day', label: 'Daylight here', km, dir, note: km < cfg.likelyKm ? 'In daylight you might catch the rising trail if you know exactly where to look.' : 'Too far to spot in daylight.' };
  const base = km < cfg.likelyKm ? 'likely' : 'maybe';
  const note = base === 'likely'
    ? `Look ${dir}, low on the horizon, starting about 30–60 seconds after liftoff.`
    : `Possibly visible very low in the ${dir} 2–4 minutes after liftoff, if it heads up the coast and skies are clear.`;
  return { level: base, label: base === 'likely' ? 'Likely visible from here' : 'Maybe visible from here', km, dir, jelly, note: note + (jelly ? ' Twilight launch — the plume may glow (a “space jellyfish”).' : '') };
}
