// outlook.js — the "Look Up" plan: everything worth looking at between now and the end of the coming night,
// plus what's coming in the next month. Pure calculation (no screen code); the view only draws the result.

import { makeObserver, bodyPosition } from './sky.js';
import * as showers from './showers.js';
import { visiblePasses } from './issService.js';
import { eventData } from './events.js';
import { moonRating } from './showers.js';

const A = () => globalThis.Astronomy;
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Sunset/sunrise windows for the next `count` nights. The first one starts now if it is already dark. */
export function nightWindows(obs, now, count = 3) {
  const out = [];
  const sunAlt = bodyPosition('Sun', now, obs).alt;
  let t = now;
  for (let i = 0; i < count; i++) {
    let sunset, sunrise;
    if (i === 0 && sunAlt <= 0) {
      const r = A().SearchRiseSet('Sun', obs, +1, now, 2);
      sunset = now; sunrise = r ? r.date : new Date(now.getTime() + 10 * HOUR);
    } else {
      const s = A().SearchRiseSet('Sun', obs, -1, t, 2);
      sunset = s ? s.date : new Date(t.getTime() + 8 * HOUR);
      const r = A().SearchRiseSet('Sun', obs, +1, sunset, 2);
      sunrise = r ? r.date : new Date(sunset.getTime() + 12 * HOUR);
    }
    out.push({ start: sunset, end: sunrise, isNow: i === 0 && sunAlt <= 0 });
    t = new Date(sunrise.getTime() + HOUR);
  }
  return out;
}

function darkSpan(obs, w, thresh = -12) {
  let a = null, b = null;
  for (let ms = w.start.getTime(); ms <= w.end.getTime(); ms += 10 * MIN) {
    if (bodyPosition('Sun', new Date(ms), obs).alt <= thresh) { if (!a) a = new Date(ms); b = new Date(ms); }
  }
  return a ? { start: a, end: b } : null;
}

const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
const FAR = ['Uranus', 'Neptune'];

/** Planet visibility during one night: when each is up (>10°) in a dark-enough sky, and its best moment. */
function planetsTonight(obs, w, cfg) {
  const res = [];
  const mid = new Date((w.start.getTime() + w.end.getTime()) / 2);
  for (const name of [...PLANETS, ...FAR]) {
    let best = null, first = null, last = null;
    for (let ms = w.start.getTime(); ms <= w.end.getTime(); ms += 15 * MIN) {
      const t = new Date(ms);
      if (bodyPosition('Sun', t, obs).alt > -6) continue;
      const p = bodyPosition(name, t, obs);
      if (p.alt >= 10) { if (!first) first = t; last = t; }
      if (!best || p.alt > best.alt) best = { t, az: p.az, alt: p.alt };
    }
    if (!best || best.alt < 12) continue;
    const elong = A().AngleFromSun(name, mid);
    if (elong < cfg.sunMinElongation + 3) continue;
    let mag = 5; try { mag = A().Illumination(name, mid).mag; } catch (e) { /* ignore */ }
    res.push({ name, best, from: first, to: last, mag, far: FAR.includes(name) });
  }
  return res.sort((a, b) => a.mag - b.mag);
}

function moonTonight(obs, w) {
  const mid = new Date((w.start.getTime() + w.end.getTime()) / 2);
  const ill = A().Illumination('Moon', mid);
  const ph = A().MoonPhase(mid);
  let from = null, to = null, peak = null;
  for (let ms = w.start.getTime(); ms <= w.end.getTime(); ms += 15 * MIN) {
    const p = bodyPosition('Moon', new Date(ms), obs);
    if (p.alt > 0) { if (!from) from = new Date(ms); to = new Date(ms); if (!peak || p.alt > peak.alt) peak = { t: new Date(ms), az: p.az, alt: p.alt }; }
  }
  return { fraction: ill.phase_fraction, phase: ph, from, to, peak, rating: moonRating(ill.phase_fraction, peak ? peak.alt : -1) };
}

/** Build the whole plan for the current place and moment. */
export function buildPlan(ctx, now = new Date()) {
  const loc = ctx.location();
  const obs = makeObserver(loc);
  const cfg = ctx.config;
  const sunAlt = bodyPosition('Sun', now, obs).alt;
  const nights = nightWindows(obs, now, 3);
  const night = nights[0];
  const dark = darkSpan(obs, night);
  const sunRise = A().SearchRiseSet('Sun', obs, +1, now, 2);
  const sunSet = A().SearchRiseSet('Sun', obs, -1, now, 2);
  const dayEnd = sunAlt > 0 ? night.start : null;                // daylight window runs now -> sunset
  const windowEnd = night.end;

  const items = [];
  const inWindow = (d) => d >= new Date(now.getTime() - HOUR) && d <= windowEnd;

  // ----- satellite passes (any that are loaded) -----
  const entries = [ctx.iss, ...Object.values(ctx.sats ? ctx.sats.items : {})].filter(e => e && e.status === 'ready');
  for (const e of entries) {
    const name = e.name || 'ISS';
    for (const p of visiblePasses(ctx, e).filter(x => x.visible && x.visStart <= windowEnd).slice(0, 3)) {
      const when = p.visStart;
      items.push({ kind: 'pass', when, until: p.visEnd, title: `${name} flyover`, score: 40 + Math.min(40, p.peak.el / 2),
        detail: `${showersDir(p.rise.az)} → ${showersDir(p.set.az)} · up to ${Math.round(p.peak.el)}° · ${p.brightness}`, go: 'passes', sat: e.id || 'iss' });
    }
  }

  // ----- planets -----
  const planets = planetsTonight(obs, night, cfg.sky);
  for (const p of planets) {
    items.push({ kind: 'planet', when: p.best.t, until: p.to, title: p.name, score: p.far ? 12 : (p.mag < -2 ? 52 : p.mag < 0.5 ? 44 : 32),
      detail: `Best around ${'%T'} · ${showersDir(p.best.az)}, ${Math.round(p.best.alt)}° up · mag ${p.mag.toFixed(1)}${p.far ? ' · needs a telescope' : ''}`, target: 'planet:' + p.name, planet: p });
  }

  // ----- meteor showers -----
  for (const x of showers.tonight(now, obs, cfg.showers)) {
    const pl = x.plan;
    items.push({ kind: 'shower', when: pl.window ? pl.window.start : pl.best.t, until: pl.window ? pl.window.end : null,
      title: `${x.sh.name} meteor shower`, score: 30 + Math.min(45, pl.rate * 2.2),
      detail: `~${showers.formatRate(pl.rate)}/hr under dark skies · ${pl.window ? 'best window' : 'radiant stays low'} · ${moonRating(pl.moon.fraction, pl.moon.alt).label}`, go: 'events', section: 'showers' });
  }

  // ----- special events happening in this window -----
  const d = eventData(ctx);
  const dayStart = startOfDay(now), dayStop = new Date(startOfDay(windowEnd).getTime() + DAY);
  for (const e of d.lunar) {
    if (e.visibility === 'none') continue;
    const up = e.stages.filter(s => s.up && !s.subtle);
    const hit = (up.length ? up : e.stages.filter(s => s.up)).find(s => inWindow(s.t) || (s.t >= now && s.t <= windowEnd));
    if (!hit) continue;
    items.push({ kind: 'event', when: hit.t, title: e.title, score: e.kind === 'total' ? 100 : e.kind === 'partial' ? 85 : 35,
      detail: `Greatest at ${'%P'} · Moon ${showersDir(e.peakAz)}, ${Math.round(Math.max(0, e.peakAlt))}° up`, peak: e.peak, go: 'events', section: 'eclipses' });
  }
  for (const e of d.solar) {
    const h = e.here; if (!h || !h.sunUpAtPeak) continue;
    if (h.peak.t < now - HOUR || h.peak.t > dayStop) continue;
    items.push({ kind: 'event', when: h.partialBegin ? h.partialBegin.t : h.peak.t, title: { partial: 'Partial solar eclipse', annular: 'Annular solar eclipse — ring of fire', total: 'Total solar eclipse' }[h.kind] || e.title, day: true, score: 100,
      detail: `${h.kind === 'partial' ? Math.round(h.obscuration * 100) + '% of the Sun covered' : h.kind === 'total' ? 'TOTAL here' : 'Ring of fire here'} at maximum ${'%P'}. Use certified eclipse glasses.`, peak: h.peak.t, go: 'events', section: 'eclipses' });
  }
  for (const m of d.moons) {
    if (!m.flags.length || m.date < new Date(now.getTime() - 12 * HOUR) || m.date > windowEnd) continue;
    if (m.flags.includes('blood')) continue;                          // covered by the eclipse card
    items.push({ kind: 'event', when: m.date, title: m.name, score: 60, detail: m.flags.map(f => ({ super: 'Supermoon', micro: 'Micromoon', blue: 'Blue Moon', harvest: 'Harvest Moon', hunter: 'Hunter’s Moon' }[f])).filter(Boolean).join(' · ') || 'Full Moon', go: 'events', section: 'moon' });
  }
  for (const pe of d.planets) {
    if (pe.type === 'season' || !pe.naked) continue;
    if (pe.date >= dayStart && pe.date <= dayStop) items.push({ kind: 'event', when: pe.date, title: pe.title, score: 58, detail: pe.detail, go: 'events', section: 'planets', noTime: true });
  }

  // ----- coming up (next 30 days, after this window) -----
  const later = [];
  const horizon = new Date(now.getTime() + 30 * DAY);
  const after = (x) => x > dayStop && x <= horizon;
  for (const e of d.lunar) if (e.visibility !== 'none' && e.kind !== 'penumbral' && after(e.peak)) later.push({ when: e.peak, title: e.title, detail: e.visibility === 'all' ? 'Visible from here' : 'Partly visible from here', section: 'eclipses', hot: true });
  for (const e of d.solar) if (e.here && e.here.sunUpAtPeak && after(e.peak)) later.push({ when: e.peak, title: e.title, detail: e.here.kind === 'partial' ? `${Math.round(e.here.obscuration * 100)}% of the Sun from here` : e.here.kind === 'total' ? 'Total from here!' : 'Ring of fire from here!', section: 'eclipses', hot: true });
  for (const m of d.moons) if (m.flags.some(f => ['super', 'blue', 'blood', 'harvest', 'hunter'].includes(f)) && after(m.date)) later.push({ when: m.date, title: m.name, detail: m.flags.filter(f => f !== 'micro').map(f => ({ super: 'Supermoon', blue: 'Blue Moon', blood: 'Blood Moon', harvest: 'Harvest Moon', hunter: 'Hunter’s Moon', partialEclipse: 'Partial eclipse', penumbral: '' }[f])).filter(Boolean).join(' · '), section: 'moon', hot: m.flags.includes('blood') });
  for (const pe of d.planets) if (pe.type === 'planet' && pe.naked && after(pe.date)) later.push({ when: pe.date, title: pe.title, detail: pe.sub === 'opposition' ? 'Brightest and closest of the year' : pe.sub === 'elongation' ? 'Best view this round' : 'A close pairing in the sky', section: 'planets' });
  for (const c of showers.calendar(now, obs)) if (c.sh.zhr >= 15 && after(c.st.next.peakAt)) later.push({ when: c.st.next.peakAt, title: `${c.sh.name} peak`, detail: `Up to ${c.sh.zhr}/hr · ${c.moonAtPeak.label} at peak`, section: 'showers' });
  later.sort((a, b) => a.when - b.when);

  items.sort((a, b) => b.score - a.score || a.when - b.when);
  return {
    now, loc, sunAlt, night, nights, dark, windowEnd, dayEnd,
    sunrise: sunRise ? sunRise.date : null, sunset: sunSet ? sunSet.date : null,
    moon: moonTonight(obs, night), planets, items, later: later.slice(0, 10),
  };
}

// small direction helper kept local to avoid a circular import
const DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
function showersDir(az) { return DIRS[Math.round((((az % 360) + 360) % 360) / 22.5) % 16]; }
