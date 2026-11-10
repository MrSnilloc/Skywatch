// views/events.js — the sky calendar: Eclipses | Moon | Planets | Showers, all worked out for YOUR location.

import * as ev from '../events.js';
import { eventData } from '../events.js';
import * as sky from '../sky.js';
import { showersView } from './showers.js';
import { eventsToICS, downloadICS } from '../ics.js';
import { fmtTime, fmtDay, fmtDate, fmtCountdown } from '../time.js';
import { icons, esc, toast, moonSVG } from '../ui.js';

let root, body, ctx, section = 'eclipses', onlyVisible = false, sub = null;
const open = new Set();
const badge = (cls, t) => `<span class="badge ${cls}">${t}</span>`;
const dur = (min) => min >= 60 ? `${Math.floor(min / 60)} h ${Math.round(min % 60)} m` : `${Math.round(min)} min`;
const dirAlt = (az, alt) => alt > 0 ? `${sky.dirName(az)}, ${Math.round(alt)}° up` : 'below your horizon';
const stamp = (d) => `${fmtDay(d)} ${fmtTime(d)}`;

// ---------- eclipses ----------

function lunarCard(e) {
  const vis = e.visibility === 'all' ? badge('good', 'Visible from here') : e.visibility === 'part' ? badge('ok', 'Partly visible from here') : badge('dim', 'Not visible from here');
  const isBlood = e.kind === 'total';
  const id = 'L' + e.peak.getTime(), isOpen = open.has(id);
  const line = e.kind === 'total' ? `Totality lasts ${dur(e.totalityMin)}; the Moon glows red. ` : e.kind === 'partial' ? `Earth’s shadow covers part of the Moon for about ${dur(e.partialMin)}. ` : 'A subtle dimming — hard to notice. ';
  return `<article class="card pass ecl ${e.visibility === 'none' ? 'faded' : ''}" data-id="${id}">
    <button class="pass-head" data-act="toggle">
      <div class="when"><div class="day">${fmtDay(e.peak)}</div><div class="time">${fmtTime(e.peak)}</div><div class="count">${e.peak.getFullYear()}</div></div>
      <div class="ecl-icon">${moonSVG(isBlood ? 180 : 170, 54).replace('var(--moon)', isBlood ? '#b5412b' : 'var(--moon)')}</div>
      <div class="meta"><div class="dirs">${esc(e.title)}</div>
        <div class="sub">${line}${e.visibility !== 'none' ? `Peak: Moon ${dirAlt(e.peakAz, e.peakAlt)}.` : ''}</div>${vis}</div>
    </button>
    ${isOpen ? `<div class="pass-more">${e.stages.map(s => `<div class="kv"><span class="sub" style="width:92px">${fmtTime(s.t)}</span><span style="flex:1;${s.up ? '' : 'opacity:.5'}">${esc(s.label)}</span><span class="sub" style="width:96px;text-align:right">${s.up ? dirAlt(s.az, s.alt) : 'Moon down'}</span></div>`).join('')}
      <p class="tip">Safe to watch with your eyes — no glasses needed. Binoculars make it even better.</p>
      ${e.visibility !== 'none' ? '<div class="actions"><button class="btn" data-act="cal">Add to calendar</button></div>' : ''}</div>` : ''}
  </article>`;
}

function solarCard(e) {
  const h = e.here;
  const id = 'S' + e.peak.getTime(), isOpen = open.has(id);
  let vis, line;
  if (h && h.sunUpAtPeak) {
    const pct = Math.round(h.obscuration * 100);
    const kindHere = h.kind === 'total' ? 'TOTAL eclipse from here!' : h.kind === 'annular' ? 'Ring of fire from here!' : `Partial from here — ${pct}% of the Sun covered`;
    vis = badge(h.kind === 'partial' && pct < 20 ? 'ok' : 'good', h.kind === 'partial' ? `${pct}% from here` : kindHere);
    line = `${kindHere}. Peak ${fmtTime(h.peak.t)}, Sun ${Math.round(h.peak.alt)}° up (${sky.dirName(h.peak.az)}).`;
  } else {
    vis = badge('dim', h ? 'Sun is down here' : 'Not visible from here');
    line = `${e.where}.`;
  }
  return `<article class="card pass ecl ${h && h.sunUpAtPeak ? '' : 'faded'}" data-id="${id}">
    <button class="pass-head" data-act="toggle">
      <div class="when"><div class="day">${fmtDay(e.peak)}</div><div class="time">${fmtTime(h && h.sunUpAtPeak ? h.peak.t : e.peak)}</div><div class="count">${e.peak.getFullYear()}</div></div>
      <div class="ecl-icon"><svg viewBox="0 0 54 54" width="54" height="54"><circle cx="27" cy="27" r="19" fill="#ffd84a"/><circle cx="${e.kind === 'total' ? 27 : e.kind === 'annular' ? 27 : 36}" cy="27" r="${e.kind === 'annular' ? 15 : 19}" fill="var(--bg)"/></svg></div>
      <div class="meta"><div class="dirs">${esc(e.title)}</div><div class="sub">${esc(line)}</div>${vis}</div>
    </button>
    ${isOpen ? `<div class="pass-more">
      ${h ? [['Partial begins', h.partialBegin], h.totalBegin && [h.kind === 'annular' ? 'Ring begins' : 'Totality begins', h.totalBegin], ['Maximum', { t: h.peak.t, alt: h.peak.alt }], h.totalEnd && [h.kind === 'annular' ? 'Ring ends' : 'Totality ends', h.totalEnd], ['Partial ends', h.partialEnd]].filter(Boolean).map(([l, s]) => s ? `<div class="kv"><span class="sub" style="width:92px">${fmtTime(s.t)}</span><span style="flex:1;${s.alt > 0 ? '' : 'opacity:.5'}">${l}</span><span class="sub" style="width:96px;text-align:right">${s.alt > 0 ? Math.round(s.alt) + '° up' : 'Sun down'}</span></div>` : '').join('') : `<div class="muted">${esc(e.where)}. From your location the Sun is below the horizon during the eclipse.</div>`}
      <p class="tip"><b>Eye safety:</b> never look at the Sun without certified eclipse glasses (ISO 12312-2) — only during total phase is it safe without them. Phones: don’t point the camera at the Sun without a solar filter.</p>
      ${h && h.sunUpAtPeak ? '<div class="actions"><button class="btn" data-act="cal">Add to calendar</button></div>' : ''}</div>` : ''}
  </article>`;
}

function eclipseSummary(d) {
  const now = Date.now();
  const nl = d.lunar.find(e => e.peak > now && e.visibility !== 'none' && e.kind !== 'penumbral') || d.lunar.find(e => e.peak > now && e.visibility !== 'none');
  const nb = d.lunar.find(e => e.peak > now && e.kind === 'total' && e.visibility !== 'none');
  const ns = d.solar.find(e => e.peak > now && e.here && e.here.sunUpAtPeak);
  const nc = d.solar.find(e => e.peak > now && e.here && e.here.sunUpAtPeak && (e.here.kind === 'total' || e.here.kind === 'annular'));
  const row = (label, e, extra) => `<div class="kv"><span class="sub" style="width:118px">${label}</span><span style="flex:1">${e ? `<b>${fmtDay(e.peak)}</b>, ${e.peak.getFullYear()} · ${extra}` : '<span class="muted">None in the next few years</span>'}</span></div>`;
  return `<div class="card"><div class="eyebrow">Next from your location</div>
    ${row('Lunar eclipse', nl, nl ? (nl.kind === 'penumbral' ? 'faint penumbral only' : nl.kind) : '')}
    ${row('Blood Moon', nb, nb ? 'total, Moon ' + Math.round(nb.peakAlt) + '° up at peak' : '')}
    ${row('Solar eclipse', ns, ns ? `${ns.here.kind}, ${Math.round(ns.here.obscuration * 100)}% of the Sun` : '')}
    ${row('Total / ring', nc, nc ? nc.here.kind : '')}</div>`;
}

function renderEclipses(d) {
  const now = Date.now() - 3 * 3600e3;
  let list = d.eclipses.filter(e => e.peak > now);
  if (onlyVisible) list = list.filter(e => e.type === 'lunar' ? e.visibility !== 'none' : e.visibility === 'here');
  return `${eclipseSummary(d)}
    <div class="toolbar"><div class="seg"><button class="${onlyVisible ? '' : 'on'}" data-act="all">All eclipses</button><button class="${onlyVisible ? 'on' : ''}" data-act="vis">Visible here</button></div></div>
    ${list.length ? list.map(e => e.type === 'lunar' ? lunarCard(e) : solarCard(e)).join('') : '<div class="card"><div class="muted">Nothing visible from here in the next few years.</div></div>'}
    <p class="foot">Times are in your phone’s time zone, worked out for ${esc(ctx.location().name)}. Lunar eclipses are visible from anywhere the Moon is up; solar eclipses only along a narrow path.</p>`;
}

// ---------- moon ----------

const FLAG = {
  super: ['good', 'Supermoon'], micro: ['dim', 'Micromoon'], blue: ['ok', 'Blue Moon'], blood: ['bad', 'Blood Moon'],
  harvest: ['ok', 'Harvest Moon'], hunter: ['ok', 'Hunter’s Moon'], partialEclipse: ['ok', 'Partial lunar eclipse'], penumbral: ['dim', 'Faint eclipse'],
};

function moonSummary(d) {
  const now = Date.now();
  const find = (f) => d.moons.find(m => m.date > now && m.flags.includes(f));
  const rows = [['Supermoon', 'super'], ['Blue Moon', 'blue'], ['Blood Moon', 'blood'], ['Harvest Moon', 'harvest'], ['Hunter’s Moon', 'hunter']].map(([l, f]) => {
    const m = find(f);
    return `<div class="kv"><span class="sub" style="width:118px">${l}</span><span style="flex:1">${m ? `<b>${fmtDay(m.date)}</b>, ${m.date.getFullYear()}` : '<span class="muted">—</span>'}</span></div>`;
  }).join('');
  return `<div class="card"><div class="eyebrow">Coming up</div>${rows}</div>`;
}

function moonCard(m) {
  const obs = sky.makeObserver(ctx.location());
  const rs = sky.riseSet('Moon', new Date(m.date.getTime() - 14 * 3600e3), obs);
  const flags = m.flags.map(f => FLAG[f] ? badge(FLAG[f][0], FLAG[f][1]) : '').join(' ');
  const pct = Math.round((384400 - m.distKm) / 384400 * 100);
  const note = m.flags.includes('super') ? `Closer than usual (${Math.round(m.distKm).toLocaleString()} km) — looks a little bigger and brighter.`
    : m.flags.includes('micro') ? `Farther than usual (${Math.round(m.distKm).toLocaleString()} km) — a touch smaller.`
    : `${Math.round(m.distKm).toLocaleString()} km from Earth${pct > 0 ? '' : ''}.`;
  const eclNote = m.eclipse ? ` ${m.eclipse.kind === 'total' ? 'Total' : m.eclipse.kind === 'partial' ? 'Partial' : 'Penumbral'} eclipse: ${m.eclipse.visibility === 'none' ? 'Moon below your horizon' : m.eclipse.visibility === 'part' ? 'partly visible here' : 'visible from here'}.` : '';
  return `<article class="card"><div class="moon-row">
    ${moonSVG(180, 52)}
    <div class="grow"><div class="big">${esc(m.name)}</div>
    <div class="sub">${fmtDay(m.date)}, ${m.date.getFullYear()} · peak ${fmtTime(m.date)}${rs.rise ? ` · rises ${fmtTime(rs.rise)}` : ''}</div>
    <div class="sub">${note}${eclNote}</div>${flags}</div></div></article>`;
}

function renderMoon(d) {
  const list = d.moons.filter(m => m.date > Date.now() - 12 * 3600e3);
  return `${moonSummary(d)}<h3 class="sect">Full Moons</h3>${list.map(moonCard).join('')}
    <p class="foot">Supermoon = full Moon within about 362,000 km of Earth. Blue Moon = second full Moon in a calendar month. Blood Moon = total lunar eclipse. Harvest Moon = full Moon nearest the September equinox.</p>`;
}

// ---------- planets ----------

function renderPlanets(d) {
  const list = d.planets.filter(p => p.date > Date.now() - 86400e3);
  const icon = { opposition: '◉', elongation: '☾', conjunction: '⚯', season: '☼' };
  return `${list.map(p => `<article class="card"><div class="moon-row"><div class="evt-ic">${icon[p.sub] || '•'}</div>
    <div class="grow"><div class="big" style="font-size:17px">${esc(p.title)}</div>
    <div class="sub">${fmtDay(p.date)}, ${p.date.getFullYear()}</div><div class="sub">${esc(p.detail)}</div>
    ${p.type === 'planet' ? badge(p.naked ? 'good' : 'dim', p.naked ? 'Naked eye' : 'Binoculars / telescope') : ''}</div></div></article>`).join('')}
    <p class="foot">Opposition = the planet is opposite the Sun: closest, brightest, and up all night.</p>`;
}

// ---------- shell ----------

function leaveSub() { if (sub) { sub.unmount(); sub = null; } }

function render() {
  leaveSub();
  const tabs = [['eclipses', 'Eclipses'], ['moon', 'Moon'], ['planets', 'Planets'], ['showers', 'Showers']];
  root.innerHTML = `<div class="seg wide">${tabs.map(([k, n]) => `<button data-sec="${k}" class="${section === k ? 'on' : ''}">${n}</button>`).join('')}</div><div class="stack" id="ev-body"></div>`;
  body = root.querySelector('#ev-body');
  if (section === 'showers') { sub = showersView; sub.mount(body, ctx); return; }
  const d = eventData(ctx);
  body.innerHTML = section === 'moon' ? renderMoon(d) : section === 'planets' ? renderPlanets(d) : renderEclipses(d);
}

function onClick(e) {
  const t = e.target.closest('[data-sec]');
  if (t) { section = t.dataset.sec; render(); return; }
  const b = e.target.closest('[data-act]'); if (!b || section === 'showers') return;
  const card = b.closest('[data-id]');
  switch (b.dataset.act) {
    case 'toggle': open.has(card.dataset.id) ? open.delete(card.dataset.id) : open.add(card.dataset.id); render(); break;
    case 'all': onlyVisible = false; render(); break;
    case 'vis': onlyVisible = true; render(); break;
    case 'cal': {
      const d = eventData(ctx);
      const e1 = d.eclipses.find(x => (x.type === 'lunar' ? 'L' : 'S') + x.peak.getTime() === card.dataset.id);
      if (!e1) break;
      let start, end, desc;
      if (e1.type === 'lunar') {
        const up = e1.stages.filter(s => s.up);
        start = new Date((up[0] ? up[0].t : e1.peak).getTime() - 0); end = new Date((up[up.length - 1] ? up[up.length - 1].t : e1.peak).getTime());
        const key = e1.stages.find(s => s.key === 'tot0') || e1.stages.find(s => s.key === 'par0') || e1.stages.find(s => s.key === 'peak');
        start = key.up ? key.t : start;
        desc = `${e1.title}. Greatest at ${fmtTime(e1.peak)}. Look ${dirAlt(e1.peakAz, e1.peakAlt)}.`;
      } else {
        const h = e1.here; start = h.partialBegin ? h.partialBegin.t : h.peak.t; end = h.partialEnd ? h.partialEnd.t : new Date(h.peak.t.getTime() + 3600e3);
        desc = `${e1.title}: ${Math.round(h.obscuration * 100)}% of the Sun covered here at maximum (${fmtTime(h.peak.t)}). Use certified eclipse glasses.`;
      }
      if (end <= start) end = new Date(start.getTime() + 3600e3);
      downloadICS(eventsToICS([{ uid: 'ecl-' + e1.peak.getTime(), start, end, summary: e1.title, desc, leadMin: 60 }]));
      toast('Open the file to add it to Calendar'); break;
    }
  }
}

export const eventsView = {
  id: 'events', title: 'Events', icon: icons.events,
  mount(el, c, params) {
    ctx = c; root = el;
    if (params && params.section) section = params.section;
    root.addEventListener('click', onClick);
    render();
    this._off = ctx.bus.on('sats', () => {});
  },
  tick(c) { if (sub && sub.tick) sub.tick(c); },
  unmount() { leaveSub(); if (root) root.removeEventListener('click', onClick); if (this._off) this._off(); root = null; },
};
void fmtDate; void fmtCountdown;
