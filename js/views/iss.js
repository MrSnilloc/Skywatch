// views/iss.js — ISS flyover list: when to look, which direction, add-to-calendar.

import * as sky from '../sky.js';
import { issLive } from '../iss.js';
import { passesToICS, downloadICS } from '../ics.js';
import { refreshIss, visiblePasses } from '../issService.js';
import { entryFor, listChoices, loadSat, loadGroup, addFromGroup, computeEntry, loadStarlink, starlinkState } from '../satellites.js';
import { fmtTime, fmtTimeSec, fmtDay, fmtCountdown, fmtAge } from '../time.js';
import { store } from '../store.js';
import { icons, polarSVG, toast, esc } from '../ui.js';

let root, ctx, cur = 'iss';
const expanded = new Set();
const entry = () => entryFor(ctx, cur) || ctx.iss;
const satName = () => entry().name || 'ISS';

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
  const iss = entry(), nm = satName();
  if (!iss.satrec) return '';
  if (iss.status !== 'ready') return '';
  const p = issLive(iss.satrec, ctx.location(), new Date());
  if (!p) return '<div class="muted">Orbit data is too old to predict. Refresh in Settings.</div>';
  const hemi = `${Math.abs(p.lat).toFixed(0)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(0)}°${p.lon >= 0 ? 'E' : 'W'}`;
  if (p.el > 0) {
    return `<div class="eyebrow">${nm} right now</div>
      <div class="big">${sky.dirName(p.az)} · ${Math.round(p.el)}° up</div>
      <div class="muted">${p.sunlit ? 'Sunlit' : 'In Earth’s shadow'} · ${Math.round(p.rangeKm)} km away</div>
      <div class="actions"><button class="btn" data-act="track-now">Point me at it</button></div>`;
  }
  return `<div class="eyebrow">${nm} right now</div>
    <div class="big">Over ${hemi}</div>
    <div class="muted">${Math.round(p.heightKm)} km up · below your horizon</div>`;
}

function statusHTML() {
  const iss = entry(), nm = satName();
  if (iss.status === 'loading' || iss.status === 'idle') return `<div class="card"><div class="muted">Loading ${nm} orbit data and calculating passes…</div></div>`;
  if (iss.status === 'error') return `<div class="card warn"><div class="big">Couldn’t get ${nm} data</div>
      <div class="muted">${esc(iss.error || 'Unknown error')}. Check your connection, then try again.</div>
      <div class="actions"><button class="btn" data-act="refetch">Try again</button></div></div>`;
  return '';
}

function chipsHTML() {
  const ch = listChoices(ctx);
  return `<div class="chips">${ch.map(c => `<button class="chip-btn ${c.id === cur || (c.id === 'starlink' && cur.startsWith('sl')) ? 'on' : ''}" data-act="sat" data-sat="${c.id}">${esc(c.name)}</button>`).join('')}<button class="chip-btn" data-act="more">More…</button></div>`;
}

function trainsHTML() {
  const st = starlinkState(ctx);
  if (!(cur === 'starlink' || cur.startsWith('sl'))) return '';
  const intro = `<div class="card"><div class="eyebrow">Starlink trains</div>
    <div class="sub">Right after launch, Starlink satellites fly in a tight line — a “train” of 20–60 lights crossing the sky one after another. After about two weeks they spread out and climb higher, and the train fades. Thousands of older Starlinks are up there too, but they’re usually too faint to notice.</div></div>`;
  if (st.status !== 'ready') return intro;
  if (!st.trains.length) return intro + '<div class="card"><div class="muted">No Starlink launches in the last 30 days.</div></div>';
  return intro + `<div class="chips">${st.trains.map(id => { const e = ctx.sats.items[id]; return `<button class="chip-btn ${id === cur ? 'on' : ''}" data-act="sat" data-sat="${id}">Launched ~${esc(e.name.replace(/Starlink train \(|\)/g, ''))} · ${e.train.count} sats${e.train.fading ? ' · fading' : ''}</button>`; }).join('')}</div>`;
}

function render() {
  if (cur === 'starlink') {
    const st = starlinkState(ctx);
    if (st.status === 'ready' && st.trains.length) cur = st.trains[0];
  }
  const iss = entry();
  const list = iss.status === 'ready' ? visiblePasses(ctx, iss) : [];
  const showAll = store.get('showAllPasses');
  const age = iss.tle ? Date.now() - iss.tle.epoch : 0;
  const warn = iss.status === 'ready' && (iss.stale || iss.error);

  root.innerHTML = `
    ${chipsHTML()}
    ${trainsHTML()}
    ${statusHTML()}
    ${warn ? `<div class="card warn"><div class="sub">${iss.error ? 'Couldn’t refresh orbit data — using saved data. ' : ''}${iss.stale ? `${satName()} orbit data is ${fmtAge(age)} old; times may be off by a minute or more.` : ''}</div></div>` : ''}
    ${iss.status === 'ready' ? `<div class="card live" id="live">${liveHTML()}</div>
    <div class="toolbar">
      <div class="seg"><button class="${showAll ? '' : 'on'}" data-act="filter-vis">Visible</button><button class="${showAll ? 'on' : ''}" data-act="filter-all">All passes</button></div>
      <button class="btn small" data-act="cal-all">Add all to calendar</button>
    </div>
    ${list.length ? list.map(passCard).join('') : `<div class="card"><div class="muted">No ${showAll ? '' : 'visible '}passes in the next ${ctx.config.iss.passDays} days with your current settings.</div></div>`}
    <p class="foot">Visible = the satellite is sunlit while your sky is dark. Orbit data from ${iss.tle ? fmtAge(Date.now() - iss.tle.fetchedAt) + ' ago' : '—'}${iss.tle && iss.tle.source ? ' (' + esc(iss.tle.source) + ')' : ''}.</p>` : ''}`;
}

function openMore() {
  const g = ctx.sats.group;
  if (g.status === 'idle' || g.status === 'error') loadGroup(ctx);
  const sheet = document.getElementById('sheet');
  const draw = () => {
    const have = new Set(listChoices(ctx).map(c => c.id));
    const body = g.status === 'ready' ? `<div class="card">${g.list.filter(t => !/DEB|R\/B/.test(t.name)).map(t => `<button class="srow find" data-n="${t.norad}"><span>${esc(t.name)}</span><span class="muted">${have.has('n' + t.norad) ? 'added' : ''}</span></button>`).join('')}</div>`
      : g.status === 'error' ? `<div class="card warn"><div class="muted">Couldn’t load the satellite list (${esc(g.error || '')}).</div></div>` : '<div class="card"><div class="muted">Loading the brightest satellites…</div></div>';
    sheet.innerHTML = `<div class="sheet-card"><div class="sheet-head"><h2>More satellites</h2><button class="btn ghost small" data-close>Close</button></div><p class="sub" style="margin:8px 0">The brightest objects in orbit — rocket bodies, old satellites, telescopes.</p>${body}</div>`;
  };
  draw(); sheet.classList.remove('hidden');
  const off = ctx.bus.on('sats', draw);
  const close = () => { off(); sheet.classList.add('hidden'); sheet.innerHTML = ''; };
  sheet.onclick = (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) return close();
    const b = e.target.closest('[data-n]'); if (!b) return;
    const id = addFromGroup(ctx, +b.dataset.n); close(); if (id) pick(id);
  };
}

function pick(id) {
  cur = id; expanded.clear();
  if (id === 'starlink') { const st = starlinkState(ctx); if (st.status === 'idle' || st.status === 'error') loadStarlink(ctx); render(); return; }
  const e = entry();
  if (id !== 'iss' && e.status === 'idle') { if (e.extra) { computeEntry(ctx, id); } else loadSat(ctx, id); }
  render();
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const card = b.closest('[data-id]');
  const pass = card ? entry().passes.find(p => key(p) === card.dataset.id) : null;
  switch (b.dataset.act) {
    case 'toggle': expanded.has(card.dataset.id) ? expanded.delete(card.dataset.id) : expanded.add(card.dataset.id); render(); break;
    case 'filter-vis': store.set('showAllPasses', false); render(); break;
    case 'filter-all': store.set('showAllPasses', true); render(); break;
    case 'sat': pick(b.dataset.sat); break;
    case 'more': openMore(); break;
    case 'track': case 'track-now': ctx.go('point', { target: 'sat:' + cur }); break;
    case 'cal': downloadICS(passesToICS([pass], ctx.config.iss.calendarLeadMin, satName())); toast('Open the file to add it to Calendar'); break;
    case 'cal-all': {
      const v = visiblePasses(ctx, entry()).filter(p => p.visible);
      if (!v.length) { toast('No visible passes to add'); break; }
      downloadICS(passesToICS(v, ctx.config.iss.calendarLeadMin, satName())); toast(`Open the file to add ${v.length} passes to Calendar`); break;
    }
    case 'refetch': cur === 'starlink' ? loadStarlink(ctx, { force: true }) : cur === 'iss' ? refreshIss(ctx, { forceFetch: true }) : loadSat(ctx, cur, { force: true }); break;
  }
}

export const issView = {
  id: 'passes', title: 'Passes', icon: icons.iss,
  mount(el, c, params) {
    ctx = c;
    if (params && params.sat) cur = params.sat;
    el.innerHTML = '<div class="stack" id="iss-body"></div>';
    root = el.querySelector('#iss-body');
    root.addEventListener('click', onClick);
    if (cur === 'starlink' || cur.startsWith('sl')) { const st = starlinkState(ctx); if (st.status === 'idle') loadStarlink(ctx); }
    const e0 = entry(); if (cur !== 'iss' && cur !== 'starlink' && e0.status === 'idle') { e0.extra ? computeEntry(ctx, cur) : loadSat(ctx, cur); }
    render();
    this._off = ctx.bus.on('iss', render);
  },
  tick() {
    if (!root || entry().status !== 'ready') return;
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
