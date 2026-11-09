// views/iss.js — ISS flyover list: when to look, which direction, add-to-calendar.

import * as sky from '../sky.js';
import { issLive } from '../iss.js';
import { passesToICS, downloadICS } from '../ics.js';
import { refreshIss, visiblePasses } from '../issService.js';
import { fmtTime, fmtTimeSec, fmtDay, fmtCountdown, fmtAge } from '../time.js';
import { store } from '../store.js';
import { icons, polarSVG, toast, esc } from '../ui.js';

let root, ctx;
const expanded = new Set();

const key = (p) => String(p.rise.t.getTime());

function passCard(p) {
  const open = expanded.has(key(p));
  const when = p.visStart || p.rise.t;
  const badge = p.visible
    ? '<span class="badge good">Visible</span>'
    : `<span class="badge dim">${esc(p.reason)}</span>`;
  const inProg = p.rise.t <= new Date() && p.set.t >= new Date();
  return `<article class="card pass ${p.visible ? '' : 'faded'}" data-id="${key(p)}">
    <button class="pass-head" data-act="toggle">
      <div class="when"><div class="day">${fmtDay(p.rise.t)}</div><div class="time">${fmtTime(when)}</div>
        <div class="count" data-count="${when.getTime()}">${inProg ? 'overhead now' : fmtCountdown(when - Date.now())}</div></div>
      ${polarSVG(p.track, 64)}
      <div class="meta"><div class="dirs">${sky.dirName(p.rise.az)} <span class="arrow">→</span> ${sky.dirName(p.set.az)}</div>
        <div class="sub">Up to ${Math.round(p.peak.el)}° · ${p.brightness}</div>${badge}</div>
    </button>
    ${open ? `<div class="pass-more">
      <div class="trio">
        <div><div class="sub">Rises</div><div class="val">${fmtTimeSec(p.rise.t)}</div><div class="sub">${sky.dirName(p.rise.az)} ${Math.round(p.rise.az)}°</div></div>
        <div><div class="sub">Highest</div><div class="val">${fmtTimeSec(p.peak.t)}</div><div class="sub">${sky.dirName(p.peak.az)} · ${Math.round(p.peak.el)}° up</div></div>
        <div><div class="sub">Sets</div><div class="val">${fmtTimeSec(p.set.t)}</div><div class="sub">${sky.dirName(p.set.az)} ${Math.round(p.set.az)}°</div></div>
      </div>
      ${p.visible ? `<div class="sub">Brightest part you can see: ${fmtTimeSec(p.visStart)} – ${fmtTimeSec(p.visEnd)}</div>` : ''}
      <div class="actions"><button class="btn" data-act="cal">Add to calendar</button><button class="btn ghost" data-act="track">Track live</button></div>
    </div>` : ''}
  </article>`;
}

function liveHTML() {
  const iss = ctx.iss;
  if (iss.status !== 'ready') return '';
  const p = issLive(iss.satrec, ctx.location(), new Date());
  if (!p) return '<div class="muted">Orbit data is too old to predict. Refresh in Settings.</div>';
  const hemi = `${Math.abs(p.lat).toFixed(0)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(0)}°${p.lon >= 0 ? 'E' : 'W'}`;
  if (p.el > 0) {
    return `<div class="eyebrow">ISS right now</div>
      <div class="big">${sky.dirName(p.az)} · ${Math.round(p.el)}° up</div>
      <div class="muted">${p.sunlit ? 'Sunlit' : 'In Earth’s shadow'} · ${Math.round(p.rangeKm)} km away</div>
      <div class="actions"><button class="btn" data-act="track-now">Point me at it</button></div>`;
  }
  return `<div class="eyebrow">ISS right now</div>
    <div class="big">Over ${hemi}</div>
    <div class="muted">${Math.round(p.heightKm)} km up · below your horizon</div>`;
}

function statusHTML() {
  const iss = ctx.iss;
  if (iss.status === 'loading' || iss.status === 'idle') return `<div class="card"><div class="muted">Loading ISS orbit data and calculating passes…</div></div>`;
  if (iss.status === 'error') return `<div class="card warn"><div class="big">Couldn’t get ISS data</div>
      <div class="muted">${esc(iss.error || 'Unknown error')}. Check your connection, then try again.</div>
      <div class="actions"><button class="btn" data-act="refetch">Try again</button></div></div>`;
  return '';
}

function render() {
  const iss = ctx.iss;
  const list = iss.status === 'ready' ? visiblePasses(ctx) : [];
  const showAll = store.get('showAllPasses');
  const age = iss.tle ? Date.now() - iss.tle.epoch : 0;
  const warn = iss.status === 'ready' && (iss.stale || iss.error);

  root.innerHTML = `
    ${statusHTML()}
    ${warn ? `<div class="card warn"><div class="sub">${iss.error ? 'Couldn’t refresh orbit data — using saved data. ' : ''}${iss.stale ? `Orbit data is ${fmtAge(age)} old; times may be off by a minute or more.` : ''}</div></div>` : ''}
    ${iss.status === 'ready' ? `<div class="card live" id="live">${liveHTML()}</div>
    <div class="toolbar">
      <div class="seg"><button class="${showAll ? '' : 'on'}" data-act="filter-vis">Visible</button><button class="${showAll ? 'on' : ''}" data-act="filter-all">All passes</button></div>
      <button class="btn small" data-act="cal-all">Add all to calendar</button>
    </div>
    ${list.length ? list.map(passCard).join('') : `<div class="card"><div class="muted">No ${showAll ? '' : 'visible '}passes in the next ${ctx.config.iss.passDays} days with your current settings.</div></div>`}
    <p class="foot">Visible = the station is sunlit while your sky is dark. Orbit data from ${iss.tle ? fmtAge(Date.now() - iss.tle.fetchedAt) + ' ago' : '—'}.</p>` : ''}`;
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const card = b.closest('[data-id]');
  const pass = card ? ctx.iss.passes.find(p => key(p) === card.dataset.id) : null;
  switch (b.dataset.act) {
    case 'toggle': expanded.has(card.dataset.id) ? expanded.delete(card.dataset.id) : expanded.add(card.dataset.id); render(); break;
    case 'filter-vis': store.set('showAllPasses', false); render(); break;
    case 'filter-all': store.set('showAllPasses', true); render(); break;
    case 'track': case 'track-now': ctx.go('point', { target: 'iss' }); break;
    case 'cal': downloadICS(passesToICS([pass], ctx.config.iss.calendarLeadMin)); toast('Open the file to add it to Calendar'); break;
    case 'cal-all': {
      const v = visiblePasses(ctx).filter(p => p.visible);
      if (!v.length) { toast('No visible passes to add'); break; }
      downloadICS(passesToICS(v, ctx.config.iss.calendarLeadMin)); toast(`Open the file to add ${v.length} passes to Calendar`); break;
    }
    case 'refetch': refreshIss(ctx, { forceFetch: true }); break;
  }
}

export const issView = {
  id: 'iss', title: 'ISS', icon: icons.iss,
  mount(el, c) {
    ctx = c;
    el.innerHTML = '<div class="stack" id="iss-body"></div>';
    root = el.querySelector('#iss-body');
    root.addEventListener('click', onClick);
    render();
    this._off = ctx.bus.on('iss', render);
  },
  tick() {
    if (!root || ctx.iss.status !== 'ready') return;
    const live = root.querySelector('#live');
    if (live) {
      const html = liveHTML();
      if (live.dataset.h !== html) { live.innerHTML = html; live.dataset.h = html; }
    }
    root.querySelectorAll('[data-count]').forEach(el => {
      const t = +el.dataset.count;
      el.textContent = t - Date.now() > 0 ? fmtCountdown(t - Date.now()) : 'overhead now';
    });
  },
  unmount() { if (this._off) this._off(); root = null; },
};
