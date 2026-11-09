// showers.js — annual meteor showers: the calendar, where each radiant is, and how good tonight is.
//
// Dates are approximate: real peaks wander by about a day from year to year, and sources differ by a day.
// TO ADD A SHOWER: add one entry to SHOWERS. Nothing else needs to change.
//
// Fields: code, name, start/end [month, day] of the active period, peak [month, day] = the EVENING of the
// peak night (so [11,17] means the night of Nov 17 into 18), zhr = rate under perfect dark sky with the
// radiant overhead, width = how many days from the peak the rate falls to about a third, ra/dec = radiant
// (degrees, J2000), speed km/s, constellation, parent body, note.

import { fixedPosition, bodyPosition, moonFractionAt, makeObserver } from './sky.js';

export const SHOWERS = [
  { code: 'QUA', name: 'Quadrantids', start: [12, 28], end: [1, 12], peak: [1, 3],   zhr: 120, width: 0.4, ra: 230, dec: 49,  speed: 41, constellation: 'Boötes / Draco', parent: 'Asteroid 2003 EH1', note: 'A sharp peak lasting only a few hours, so timing matters.' },
  { code: 'LYR', name: 'Lyrids',      start: [4, 14],  end: [4, 30], peak: [4, 21],  zhr: 18,  width: 1.5, ra: 271, dec: 34,  speed: 49, constellation: 'Lyra', parent: 'Comet Thatcher', note: 'Fast, with the occasional bright streak.' },
  { code: 'ETA', name: 'Eta Aquariids', start: [4, 19], end: [5, 28], peak: [5, 5], zhr: 50,  width: 3,   ra: 338, dec: -1,  speed: 66, constellation: 'Aquarius', parent: 'Halley’s Comet', note: 'Best just before dawn; stronger from the southern states.' },
  { code: 'SDA', name: 'Southern Delta Aquariids', start: [7, 12], end: [8, 23], peak: [7, 30], zhr: 25, width: 6, ra: 339, dec: -16, speed: 41, constellation: 'Aquarius', parent: 'Comet 96P/Machholz', note: 'Low in the south from Virginia; steady and fairly faint.' },
  { code: 'PER', name: 'Perseids',    start: [7, 17],  end: [8, 24], peak: [8, 12],  zhr: 100, width: 3,   ra: 48,  dec: 58,  speed: 59, constellation: 'Perseus', parent: 'Comet Swift-Tuttle', note: 'Fast and bright with many fireballs, on warm summer nights.' },
  { code: 'DRA', name: 'Draconids',   start: [10, 6],  end: [10, 10], peak: [10, 8], zhr: 10,  width: 0.8, ra: 262, dec: 54,  speed: 20, constellation: 'Draco', parent: 'Comet 21P/Giacobini-Zinner', note: 'Slow meteors, best in the early evening. Rates vary a lot by year.' },
  { code: 'ORI', name: 'Orionids',    start: [10, 2],  end: [11, 7], peak: [10, 21], zhr: 20,  width: 3,   ra: 95,  dec: 16,  speed: 66, constellation: 'Orion', parent: 'Halley’s Comet', note: 'Fast meteors from Halley’s Comet debris; best after midnight.' },
  { code: 'STA', name: 'Southern Taurids', start: [9, 28], end: [12, 2], peak: [11, 4], zhr: 5, width: 8, ra: 52, dec: 13, speed: 27, constellation: 'Taurus', parent: 'Comet Encke', note: 'Few meteors, but slow and often very bright fireballs.' },
  { code: 'NTA', name: 'Northern Taurids', start: [10, 20], end: [12, 10], peak: [11, 11], zhr: 5, width: 8, ra: 58, dec: 22, speed: 29, constellation: 'Taurus', parent: 'Comet Encke', note: 'Few meteors, but slow and often very bright fireballs.' },
  { code: 'LEO', name: 'Leonids',     start: [11, 6],  end: [11, 30], peak: [11, 17], zhr: 15,  width: 1.5, ra: 152, dec: 22,  speed: 71, constellation: 'Leo', parent: 'Comet Tempel-Tuttle', note: 'The fastest of the major showers. Best after midnight, when Leo is up.' },
  { code: 'GEM', name: 'Geminids',    start: [12, 4],  end: [12, 20], peak: [12, 13], zhr: 150, width: 1.5, ra: 112, dec: 33,  speed: 35, constellation: 'Gemini', parent: 'Asteroid 3200 Phaethon', note: 'Usually the best shower of the year: slow, bright and colourful.' },
  { code: 'URS', name: 'Ursids',      start: [12, 17], end: [12, 26], peak: [12, 21], zhr: 10,  width: 1.5, ra: 217, dec: 76,  speed: 33, constellation: 'Ursa Minor', parent: 'Comet 8P/Tuttle', note: 'A quiet shower near the Little Dipper; best before dawn.' },
];

export const byCode = (code) => SHOWERS.find(s => s.code === code);

const HOUR = 3600e3, DAY = 86400e3;

// ---------- calendar ----------

/** One year's version of a shower's dates. */
function occurrenceFor(sh, y) {
  const [pm, pd] = sh.peak, [sm, sd] = sh.start, [em, ed] = sh.end;
  const eve = new Date(y, pm - 1, pd, 18, 0);           // evening the peak night begins
  const peakAt = new Date(y, pm - 1, pd + 1, 3, 0);     // middle of that night
  const over = new Date(peakAt.getTime() + 6 * HOUR);   // dawn after
  let start = new Date(y, sm - 1, sd, 0, 0);
  if (start > eve) start = new Date(y - 1, sm - 1, sd, 0, 0);
  let end = new Date(y, em - 1, ed, 23, 59);
  if (end < eve) end = new Date(y + 1, em - 1, ed, 23, 59);
  return { eve, peakAt, over, start, end };
}

/**
 * Where a shower stands right now.
 *  next:   the next peak that hasn't finished yet
 *  active: true if today is inside its active dates
 *  phase:  'peak' (peak night is now) | 'before' | 'after' | 'off'
 */
export function status(sh, now = new Date()) {
  const y = now.getFullYear();
  const occs = [y - 1, y, y + 1].map(yy => occurrenceFor(sh, yy));
  const next = occs.filter(o => o.over >= now).sort((a, b) => a.peakAt - b.peakAt)[0];
  const cur = occs.find(o => o.start <= now && now <= o.end);
  let phase = 'off';
  if (cur) phase = now >= cur.eve && now <= cur.over ? 'peak' : now < cur.eve ? 'before' : 'after';
  return { next, current: cur || null, active: !!cur, phase, daysToPeak: (next.peakAt - now) / DAY };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov 17–18" */
export function peakLabel(occ) {
  const a = occ.eve, b = new Date(occ.eve.getTime() + DAY);
  return a.getMonth() === b.getMonth()
    ? `${MONTHS[a.getMonth()]} ${a.getDate()}–${b.getDate()}`
    : `${MONTHS[a.getMonth()]} ${a.getDate()} – ${MONTHS[b.getMonth()]} ${b.getDate()}`;
}

/** "Oct 20 – Dec 10" — the active dates of an occurrence. */
export function rangeLabel(occ) {
  const f = (d) => `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${f(occ.start)} – ${f(occ.end)}`;
}

// ---------- sky ----------

export function radiantNow(sh, date, obs) {
  return fixedPosition(sh.ra, sh.dec, date, obs);
}

/** Next time the radiant climbs above the horizon within 24 h (or null). */
export function radiantRise(sh, now, obs) {
  let prev = radiantNow(sh, now, obs).alt;
  for (let m = 5; m <= 24 * 60; m += 5) {
    const t = new Date(now.getTime() + m * 60000);
    const a = radiantNow(sh, t, obs).alt;
    if (prev <= 0 && a > 0) return t;
    prev = a;
  }
  return null;
}

/** A spot to look at: 40–80° from the radiant, high up — where meteors have the longest trails. */
export function gazeSpot(radAz, radAlt) {
  return { az: (radAz + 180) % 360, alt: radAlt < 60 ? 70 : 40 };
}

export function moonRating(fraction, moonAlt) {
  if (moonAlt < 0) return { level: 'good', label: 'Moon down' };
  if (fraction < 0.25) return { level: 'good', label: 'Dark sky' };
  if (fraction < 0.6) return { level: 'ok', label: 'Some moonlight' };
  return { level: 'bad', label: 'Bright Moon' };
}

/**
 * Plan the coming (or current) dark stretch for one shower.
 * Returns null if there is no dark time in the lookahead. Otherwise:
 *   { darkStart, darkEnd, best:{t,az,alt}, window:{start,end}|null, moon:{alt,fraction}, rate, factor }
 * `rate` is a rough meteors-per-hour guess for dark, clear skies.
 */
export function nightPlan(sh, now, obs, cfg, occ) {
  const step = cfg.stepMin * 60000, end = now.getTime() + cfg.lookaheadHours * HOUR;
  let darkStart = null, darkEnd = null;
  const samples = [];
  for (let ms = now.getTime(); ms <= end; ms += step) {
    const t = new Date(ms);
    const dark = bodyPosition('Sun', t, obs).alt <= cfg.darkSunAlt;
    if (dark) {
      if (!darkStart) darkStart = t;
      darkEnd = t;
      const r = radiantNow(sh, t, obs);
      samples.push({ t, az: r.az, alt: r.alt });
    } else if (darkStart) break;      // first dark stretch only
  }
  if (!samples.length) return null;

  const best = samples.reduce((m, s) => (s.alt > m.alt ? s : m), samples[0]);
  const good = samples.filter(s => s.alt >= cfg.minAlt);
  const window = good.length ? { start: good[0].t, end: good[good.length - 1].t } : null;

  const mp = bodyPosition('Moon', best.t, obs);
  const moon = { alt: mp.alt, fraction: moonFractionAt(best.t) };

  const peakAt = (occ || status(sh, now).next).peakAt;
  const dDays = Math.abs(best.t - peakAt) / DAY;
  const factor = Math.exp(-dDays / sh.width);
  const moonFactor = moon.alt > 0 ? 1 - 0.65 * moon.fraction : 1;
  const rate = best.alt > 0 ? sh.zhr * factor * Math.sin(best.alt * Math.PI / 180) * moonFactor : 0;
  return { darkStart, darkEnd, best, window, moon, rate, factor };
}

// ---------- summaries for the screens ----------

/** Every shower, with status — soonest peak first. */
export function calendar(now, obs) {
  return SHOWERS.map(sh => {
    const st = status(sh, now);
    const pk = st.next.peakAt;
    const mp = bodyPosition('Moon', pk, obs);
    return { sh, st, moonAtPeak: moonRating(moonFractionAt(pk), mp.alt), moonFrac: moonFractionAt(pk) };
  }).sort((a, b) => {
    const pa = a.st.phase === 'peak' ? -1 : 0, pb = b.st.phase === 'peak' ? -1 : 0;
    return pa - pb || a.st.next.peakAt - b.st.next.peakAt;
  });
}

/** Active showers with a plan for the coming dark stretch, best first. */
export function tonight(now, obs, cfg) {
  return SHOWERS.map(sh => ({ sh, st: status(sh, now) }))
    .filter(x => x.st.active)
    .map(x => ({ ...x, plan: nightPlan(x.sh, now, obs, cfg, x.st.current) }))
    .filter(x => x.plan)
    .sort((a, b) => b.plan.rate - a.plan.rate);
}

export function formatRate(r) { return r < 1 ? '<1' : String(Math.round(r)); }

/** Showers whose radiant the Point screen should offer (those active now). */
export function activeShowers(now = new Date()) {
  return SHOWERS.filter(sh => status(sh, now).active);
}

export { makeObserver };
