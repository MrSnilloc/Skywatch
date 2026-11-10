// events.js — the sky calendar: eclipses (as seen from YOUR spot), special full Moons, planet events.
// Pure functions over astronomy-engine (global `Astronomy`); the Events screen only draws what these return.

import { makeObserver, bodyPosition, dirName } from './sky.js';

const A = () => globalThis.Astronomy;
const AU_KM = 149597870.7;
const DAY = 86400000;

// ---------- lunar eclipses ("blood moons" are the total ones) ----------

const LUNAR_NAMES = { penumbral: 'Penumbral lunar eclipse', partial: 'Partial lunar eclipse', total: 'Total lunar eclipse — Blood Moon' };

function moonAt(date, obs) { const p = bodyPosition('Moon', date, obs); return { az: p.az, alt: p.alt }; }

/** Next `count` lunar eclipses after `from`, each with the moments that matter and whether the Moon is up for them. */
export function lunarEclipses(from, count, loc) {
  const obs = makeObserver(loc);
  const out = [];
  let e = A().SearchLunarEclipse(from);
  while (out.length < count) {
    const peak = e.peak.date;
    const at = (minBefore) => new Date(peak.getTime() + minBefore * 60000);
    const stages = [
      { key: 'pen0', label: 'Penumbral begins (faint shading)', t: at(-e.sd_penum), subtle: true },
      e.sd_partial > 0 && { key: 'par0', label: 'Partial begins — a “bite” appears', t: at(-e.sd_partial) },
      e.sd_total > 0 && { key: 'tot0', label: 'Total begins — Moon turns red', t: at(-e.sd_total) },
      { key: 'peak', label: 'Greatest eclipse', t: peak },
      e.sd_total > 0 && { key: 'tot1', label: 'Total ends', t: at(e.sd_total) },
      e.sd_partial > 0 && { key: 'par1', label: 'Partial ends', t: at(e.sd_partial) },
      { key: 'pen1', label: 'Penumbral ends', t: at(e.sd_penum), subtle: true },
    ].filter(Boolean).map(s => { const m = moonAt(s.t, obs); return { ...s, alt: m.alt, az: m.az, up: m.alt > 0 }; });

    // What matters is the dramatic part: total if there is one, otherwise partial, otherwise penumbral.
    const core = stages.filter(s => !s.subtle);
    const keyStages = core.length > 1 ? core : stages;
    const upCount = keyStages.filter(s => s.up).length;
    const visibility = upCount === keyStages.length ? 'all' : upCount === 0 ? 'none' : 'part';
    out.push({
      type: 'lunar', kind: e.kind, title: LUNAR_NAMES[e.kind] || 'Lunar eclipse', peak,
      totalityMin: e.sd_total > 0 ? Math.round(e.sd_total * 2) : 0,
      partialMin: e.sd_partial > 0 ? Math.round(e.sd_partial * 2) : 0,
      stages, visibility, peakAlt: moonAt(peak, obs).alt, peakAz: moonAt(peak, obs).az,
    });
    e = A().NextLunarEclipse(e.peak);
  }
  return out;
}

// ---------- solar eclipses ----------

const SOLAR_NAMES = { partial: 'Partial solar eclipse', annular: 'Annular solar eclipse — “ring of fire”', total: 'Total solar eclipse', hybrid: 'Hybrid solar eclipse' };

function solarEvent(ev) { return ev && ev.time ? { t: ev.time.date, alt: ev.altitude } : null; }

/** Next `count` solar eclipses anywhere on Earth after `from`, each with what YOU would see (if anything). */
export function solarEclipses(from, count, loc) {
  const obs = makeObserver(loc);
  const out = [];
  let g = A().SearchGlobalSolarEclipse(from);
  while (out.length < count) {
    const peak = g.peak.date;
    // Is it visible from here? Ask for the first local eclipse starting 2 days before the global peak.
    let local = null;
    try {
      const l = A().SearchLocalSolarEclipse(new Date(peak.getTime() - 2 * DAY), obs);
      if (Math.abs(l.peak.time.date - peak) < DAY) local = l;
    } catch (e) { /* none */ }
    let here = null;
    if (local) {
      const sunUp = local.peak.altitude > 0;
      here = {
        kind: local.kind, obscuration: local.obscuration, sunUpAtPeak: sunUp,
        peak: { t: local.peak.time.date, alt: local.peak.altitude, az: bodyPosition('Sun', local.peak.time.date, obs).az },
        partialBegin: solarEvent(local.partial_begin), totalBegin: solarEvent(local.total_begin),
        totalEnd: solarEvent(local.total_end), partialEnd: solarEvent(local.partial_end),
      };
      if (local.kind === 'total' || local.kind === 'annular') {
        here.centralMin = local.total_begin && local.total_end ? (local.total_end.time.date - local.total_begin.time.date) / 60000 : 0;
      }
    }
    const lat = g.latitude, lon = g.longitude;
    out.push({
      type: 'solar', kind: g.kind, title: SOLAR_NAMES[g.kind] || 'Solar eclipse', peak,
      where: (lat !== undefined && lat !== null) ? `Greatest eclipse near ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'}` : 'Partial eclipse only — no central line on Earth',
      here, visibility: here && here.sunUpAtPeak ? 'here' : 'none',
    });
    g = A().NextGlobalSolarEclipse(g.peak);
  }
  return out;
}

// ---------- special full Moons ----------

const MONTH_MOONS = ['Wolf Moon', 'Snow Moon', 'Worm Moon', 'Pink Moon', 'Flower Moon', 'Strawberry Moon', 'Buck Moon', 'Sturgeon Moon', 'Corn Moon', 'Hunter’s Moon', 'Beaver Moon', 'Cold Moon'];
const MONTH_BLURB = ['', '', 'Also the “Crow” or “Sap” moon', 'Named for spring’s pink phlox', '', '', '', '', 'Sometimes called the Harvest Moon', '', '', ''];
export const SUPER_KM = 362000, MICRO_KM = 405000;

export const moonDistanceKm = (date) => A().GeoMoon(date).Length() * AU_KM;

/** All full Moons from `from` for `months` months, with names and special flags. Blood Moon flag is added by the caller if needed. */
export function fullMoons(from, months, eclipses = []) {
  const end = from.getTime() + months * 30.5 * DAY;
  const list = [];
  let d = new Date(from.getTime() - 2 * DAY);
  for (;;) {
    const f = A().SearchMoonPhase(180, d, 40);
    if (!f || f.date.getTime() > end) break;
    list.push(f.date);
    d = new Date(f.date.getTime() + 20 * DAY);
  }
  // Harvest Moon = the full Moon closest to the September equinox; Hunter's Moon = the one after it.
  const years = [...new Set(list.map(x => x.getFullYear()))];
  const harvest = new Map();
  for (const y of years) {
    const eq = A().Seasons(y).sep_equinox.date;
    const all = [];
    let dd = new Date(eq.getTime() - 20 * DAY);
    for (let i = 0; i < 3; i++) { const f = A().SearchMoonPhase(180, dd, 40); all.push(f.date); dd = new Date(f.date.getTime() + 20 * DAY); }
    const h = all.reduce((a, b) => Math.abs(b - eq) < Math.abs(a - eq) ? b : a);
    harvest.set(h.getTime(), 'harvest');
    const hu = all.find(x => x > h); if (hu) harvest.set(hu.getTime(), 'hunter');
  }
  const monthKey = (x) => x.getFullYear() * 12 + x.getMonth();
  const counts = new Map();
  // count per local calendar month, including full Moons just outside the window so "blue" is right at the edges
  const wide = [...list];
  for (const x of wide) counts.set(monthKey(x), (counts.get(monthKey(x)) || 0) + 1);
  const seen = new Map();
  return list.filter(x => x >= from).map(x => {
    const k = monthKey(x); seen.set(k, (seen.get(k) || 0) + 1);
    const dist = moonDistanceKm(x);
    const flags = [];
    let name = MONTH_MOONS[x.getMonth()];
    const h = harvest.get(x.getTime());
    if (h === 'harvest') { name = 'Harvest Moon'; flags.push('harvest'); }
    else if (h === 'hunter') { name = 'Hunter’s Moon'; flags.push('hunter'); }
    if (dist <= SUPER_KM) flags.push('super');
    if (dist >= MICRO_KM) flags.push('micro');
    if (counts.get(k) > 1 && seen.get(k) === 2) { flags.push('blue'); }
    const ecl = eclipses.find(e => e.type === 'lunar' && Math.abs(e.peak - x) < DAY);
    if (ecl) flags.push(ecl.kind === 'total' ? 'blood' : ecl.kind === 'partial' ? 'partialEclipse' : 'penumbral');
    return { date: x, name, distKm: dist, flags, eclipse: ecl || null, blurb: h ? '' : MONTH_BLURB[x.getMonth()] };
  });
}

// ---------- planets ----------

const sep = (a, b) => {
  const dot = a.x * b.x + a.y * b.y + a.z * b.z;
  return Math.acos(Math.max(-1, Math.min(1, dot / (a.Length() * b.Length())))) * 180 / Math.PI;
};

/** Oppositions (best viewing), greatest elongations of Mercury/Venus, planet-planet conjunctions, equinoxes/solstices. */
export function planetEvents(from, months, loc) {
  const end = new Date(from.getTime() + months * 30.5 * DAY);
  const ev = [];
  const mag = (n, d) => { try { return A().Illumination(n, d).mag; } catch (e) { return null; } };

  for (const n of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
    let d = from;
    for (let i = 0; i < 6; i++) {
      const o = A().SearchRelativeLongitude(n, 0, d);
      if (!o || o.date > end) break;
      const dist = A().GeoVector(n, o.date, true).Length();
      ev.push({ type: 'planet', sub: 'opposition', body: n, date: o.date, title: `${n} at opposition`, detail: `Closest and brightest of the year, up all night. Magnitude ${mag(n, o.date)?.toFixed(1)} · ${dist.toFixed(2)} AU away.`, naked: n !== 'Uranus' && n !== 'Neptune' });
      d = new Date(o.date.getTime() + 30 * DAY);
    }
  }
  for (const n of ['Mercury', 'Venus']) {
    let d = from;
    for (let i = 0; i < 20; i++) {
      const m = A().SearchMaxElongation(n, d);
      if (!m || m.time.date > end) break;
      if (m.time.date >= from) {
        const eve = m.visibility === 'evening';
        ev.push({ type: 'planet', sub: 'elongation', body: n, date: m.time.date, title: `${n} — greatest ${eve ? 'evening' : 'morning'} view`,
          detail: `${m.elongation.toFixed(0)}° from the Sun, ${eve ? 'low in the west after sunset' : 'low in the east before sunrise'}. Best time to spot it this round.`, naked: true });
      }
      d = new Date(m.time.date.getTime() + 5 * DAY);
    }
  }
  // Planet–planet conjunctions (daily scan, local minima under 3.5 degrees)
  const bodies = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const steps = Math.ceil((end - from) / DAY);
  const vecs = bodies.map(b => { const arr = []; for (let i = 0; i <= steps + 1; i++) arr.push(A().GeoVector(b, new Date(from.getTime() + i * DAY), true)); return arr; });
  for (let a = 0; a < bodies.length; a++) for (let b = a + 1; b < bodies.length; b++) {
    const s = []; for (let i = 0; i <= steps + 1; i++) s.push(sep(vecs[a][i], vecs[b][i]));
    for (let i = 1; i <= steps; i++) {
      if (s[i] < s[i - 1] && s[i] <= s[i + 1] && s[i] < 3.5) {
        const when = new Date(from.getTime() + i * DAY);
        const sa = A().AngleFromSun(bodies[a], when), sb = A().AngleFromSun(bodies[b], when);
        const glare = Math.min(sa, sb) < 15;
        ev.push({ type: 'planet', sub: 'conjunction', body: bodies[a], date: when, title: `${bodies[a]} meets ${bodies[b]}`,
          detail: `Only ${s[i].toFixed(1)}° apart — a lovely pair. ${glare ? 'Very close to the Sun, so hard to see.' : 'Look for them together in the same part of the sky.'}`, naked: !glare });
      }
    }
  }
  for (const y of [from.getFullYear(), from.getFullYear() + 1, from.getFullYear() + 2]) {
    const s = A().Seasons(y);
    for (const [k, t] of [['mar_equinox', 'March equinox — spring begins'], ['jun_solstice', 'June solstice — longest day (N. Hemisphere)'], ['sep_equinox', 'September equinox — autumn begins'], ['dec_solstice', 'December solstice — shortest day (N. Hemisphere)']]) {
      const d = s[k].date;
      if (d >= from && d <= end) ev.push({ type: 'season', sub: k, date: d, title: t, detail: 'Equal day and night at the equinoxes; the Sun’s extremes at the solstices.', naked: true });
    }
  }
  void loc; void dirName;
  return ev.sort((x, y) => x.date - y.date);
}
