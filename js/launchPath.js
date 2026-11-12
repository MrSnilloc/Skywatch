// launchPath.js — where a rocket should climb in YOUR sky, for a launch you might be able to see.
//
// Nobody publishes the exact flight path for free, so this is an ESTIMATE:
//   • which way it heads comes from the kind of orbit it is going to (config.launches.orbits) and the directions
//     each launch site is allowed to fly (config.launches.sites);
//   • how fast it climbs comes from one typical rocket (config.launches.ascent: seconds -> height, distance).
// When the direction can't be pinned down (e.g. Starlink from Florida goes either north-east or south-east),
// both possible paths are given. Launch times also slip, so treat it as "look around here".
//
// TO TEACH IT A NEW SITE OR ORBIT: add a row to config.launches.sites / .orbits.

import { assess } from './launches.js';
import { spotLook } from './paths.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI, RE = 6371, KM_FT = 3280.84;

/** Directions (degrees from north) the rocket may head, most likely first. */
export function headings(l, cfg) {
  const lat = l.pad.lat, site = cfg.sites.find(s => Math.abs(s.lat - lat) < 1.5 && Math.abs(s.lon - l.pad.lon) < 1.5) || { from: 0, to: 360 };
  const text = `${l.orbit} ${l.name} ${l.mission}`;
  const rule = cfg.orbits.find(o => new RegExp(o.match, 'i').test(text));
  const ok = (az) => az >= site.from && az <= site.to;
  if (!rule) return site.to - site.from < 200 ? [(site.from + site.to) / 2] : [90];
  const out = [];
  for (const inc of rule.inclinations) {
    const i = inc === 'pad' ? Math.abs(lat) : inc;
    const s = Math.cos(i * RAD) / Math.cos(lat * RAD);
    if (Math.abs(s) > 1) { if (ok(90)) out.push(90); continue; }          // can't reach that tilt directly: due east
    const a = Math.asin(s) * DEG;                                          // heading north-east…
    for (const az of [(a + 360) % 360, (180 - a + 360) % 360]) if (ok(az) && !out.some(x => Math.abs(x - az) < 4)) out.push(az);   // …or south-east
  }
  return out.length ? out : [(site.from + site.to) / 2];
}

/** Where the rocket is `sec` seconds after liftoff when heading `az`: { lat, lon, km (height) } or null once past the table. */
function ascentAt(l, az, sec, table) {
  if (sec < 0 || sec > table[table.length - 1][0]) return null;
  let k = 1; while (k < table.length - 1 && table[k][0] < sec) k++;
  const [t0, h0, d0] = table[k - 1], [t1, h1, d1] = table[k], f = (sec - t0) / (t1 - t0);
  const d = (d0 + (d1 - d0) * f) / RE, la1 = l.pad.lat * RAD, lo1 = l.pad.lon * RAD, br = az * RAD;
  const la = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la));
  return { lat: la * DEG, lon: lo * DEG, km: h0 + (h1 - h0) * f };
}

/**
 * The launch to show on the Sky map at `date`, if one you might see is close (config.launches.skyBeforeMin /
 * skyAfterMin around liftoff):
 * -> { l, level, sec (since liftoff; negative before), paths: [{ az, pts: [{ az, el, sec, mark }], peak: { az, el, sec } }], now: [{ az, el }] }
 * Only the parts above your horizon are kept; null if there is nothing to show.
 */
export function launchTrack(ctx, date) {
  const L = ctx.launches, cfg = ctx.config.launches, loc = ctx.location();
  if (!L || !L.list || !L.list.length) return null;
  const t = date.getTime();
  for (const l of L.list) {
    const sec = (t - l.net.getTime()) / 1000;
    if (sec < -cfg.skyBeforeMin * 60 || sec > cfg.skyAfterMin * 60) continue;
    const v = assess(l, loc, cfg);
    if (v.level === 'no') continue;
    const look = (p) => { const k = spotLook(p.lat, p.lon, p.km * KM_FT, loc); return { az: k.az, el: k.el }; };
    const end = cfg.ascent[cfg.ascent.length - 1][0], paths = [], now = [];
    for (const az of headings(l, cfg)) {
      const pts = [];
      for (let s = 0; s <= end; s += 10) { const k = look(ascentAt(l, az, s, cfg.ascent)); if (k.el > cfg.skyMinEl) pts.push({ ...k, sec: s, mark: s && s % 60 === 0 ? s / 60 : 0 }); }
      if (pts.length < 2) continue;
      paths.push({ az, pts, peak: pts.reduce((a, b) => (b.el > a.el ? b : a)) });
      const p = ascentAt(l, az, sec, cfg.ascent), k = p && look(p);
      if (k && k.el > cfg.skyMinEl) now.push(k);
    }
    if (paths.length) return { l, level: v.level, sec, paths, now };
  }
  return null;
}
