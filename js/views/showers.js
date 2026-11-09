// views/showers.js — meteor showers: what's best tonight, and the calendar of upcoming peaks.

import * as showers from '../showers.js';
import * as sky from '../sky.js';
import { fmtTime, fmtCountdown } from '../time.js';
import { icons, esc } from '../ui.js';

let root, ctx, lastFull = 0;
const expanded = new Set();

const levelClass = (lvl) => (lvl === 'good' ? 'good' : lvl === 'ok' ? 'ok' : 'bad');

function peakChip(st) {
  if (st.phase === 'peak') return 'Peak night!';
  const d = Math.round(st.daysToPeak);
  if (st.phase === 'before') return d <= 1 ? 'Peaks tomorrow night' : `Peaks in ${d} days`;
  return 'Past its peak';
}

function tonightCard(list) {
  if (!list.length) {
    return `<div class="card"><div class="eyebrow">Tonight</div><div class="muted">No meteor showers are active tonight.</div></div>`;
  }
  const { sh, st, plan } = list[0];
  const moon = showers.moonRating(plan.moon.fraction, plan.moon.alt);
  const win = plan.window
    ? `Best ${fmtTime(plan.window.start)} – ${fmtTime(plan.window.end)} · radiant up to ${Math.round(plan.best.alt)}° (${sky.dirName(plan.best.az)})`
    : `Radiant stays low tonight (at most ${Math.round(plan.best.alt)}°)`;
  const others = list.slice(1).map(x => `${esc(x.sh.name)} (~${showers.formatRate(x.plan.rate)}/h)`).join(', ');
  return `<div class="card">
    <div class="eyebrow">Best tonight</div>
    <div class="big">${esc(sh.name)} <span class="chip-s">${peakChip(st)}</span></div>
    <div class="muted">About ${showers.formatRate(plan.rate)} per hour under a dark sky · up to ${sh.zhr}/hr at the peak</div>
    <div class="line">${win}</div>
    <div class="line"><span class="badge ${levelClass(moon.level)}">${moon.label}</span> <span class="sub inline">Moon ${Math.round(plan.moon.fraction * 100)}% lit${plan.moon.alt > 0 ? '' : ', below the horizon'} at the best time</span></div>
    <p class="tip">Lie back and look high. Meteors can show up anywhere, with the longest trails away from the radiant. Give your eyes 20 minutes to adjust.</p>
    <div class="actions"><button class="btn" data-act="radiant" data-code="${sh.code}">Point at radiant</button><button class="btn ghost" data-act="gaze" data-code="${sh.code}">Where to look</button></div>
    ${others ? `<div class="sub" style="margin-top:10px">Also active: ${others}</div>` : ''}
  </div>`;
}

function detailHTML(c, now, obs) {
  const { sh, st } = c;
  const r = showers.radiantNow(sh, now, obs);
  let where;
  if (r.alt > 0) where = `${sky.dirName(r.az)} · ${Math.round(r.alt)}° up right now`;
  else {
    const rise = showers.radiantRise(sh, now, obs);
    where = rise ? `below the horizon · rises ${fmtTime(rise)} in the ${sky.dirName(showers.radiantNow(sh, rise, obs).az)}` : 'stays below your horizon today';
  }
  const occ = st.current || st.next;
  return `<div class="pass-more">
    <div class="kv"><span class="sub">Radiant</span><span>${esc(sh.constellation)} — ${where}</span></div>
    <div class="kv"><span class="sub">Active</span><span>${showers.rangeLabel(occ)}</span></div>
    <div class="kv"><span class="sub">Speed</span><span>${sh.speed} km/s · parent: ${esc(sh.parent)}</span></div>
    <p class="tip">${esc(sh.note)}</p>
    <div class="actions"><button class="btn" data-act="radiant" data-code="${sh.code}">Point at radiant</button><button class="btn ghost" data-act="gaze" data-code="${sh.code}">Where to look</button></div>
  </div>`;
}

function calendarCard(c, now, obs) {
  const { sh, st, moonAtPeak } = c;
  const open = expanded.has(sh.code);
  const label = st.phase === 'peak' ? 'Peak tonight' : st.phase === 'after' ? 'Past peak' : 'Peak';
  const active = st.active ? '<span class="badge good">Active now</span> ' : '';
  return `<article class="card pass ${st.active ? '' : 'faded'}" data-code="${sh.code}">
    <button class="pass-head" data-act="toggle">
      <div class="when"><div class="day">${label}</div><div class="time sm">${showers.peakLabel(st.next)}</div>
        <div class="count" data-count="${st.next.peakAt.getTime()}" data-phase="${st.phase}"></div></div>
      <div class="meta"><div class="dirs">${esc(sh.name)}</div>
        <div class="sub">Up to ${sh.zhr} per hour</div>
        ${active}<span class="badge ${levelClass(moonAtPeak.level)}">${moonAtPeak.label} at peak</span></div>
    </button>
    ${open ? detailHTML(c, now, obs) : ''}
  </article>`;
}

function render() {
  const now = new Date();
  const obs = sky.makeObserver(ctx.location());
  const tonight = showers.tonight(now, obs, ctx.config.showers);
  const cal = showers.calendar(now, obs);
  root.innerHTML = `
    ${tonightCard(tonight)}
    <h3 class="sect">Upcoming peaks</h3>
    ${cal.map(c => calendarCard(c, now, obs)).join('')}
    <p class="foot">Peak dates are approximate (they shift by about a day each year). Rates are rough guesses for a dark, clear sky away from city lights.</p>`;
  lastFull = Date.now();
  updateCounts();
}

function updateCounts() {
  root.querySelectorAll('[data-count]').forEach(el => {
    const t = +el.dataset.count, ms = t - Date.now();
    el.textContent = el.dataset.phase === 'peak' ? 'tonight' : ms > 0 ? fmtCountdown(ms) : 'just peaked';
  });
}

function onClick(e) {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const code = b.dataset.code || (b.closest('[data-code]') && b.closest('[data-code]').dataset.code);
  switch (b.dataset.act) {
    case 'toggle': expanded.has(code) ? expanded.delete(code) : expanded.add(code); render(); break;
    case 'radiant': ctx.go('point', { target: 'radiant:' + code }); break;
    case 'gaze': ctx.go('point', { target: 'gaze:' + code }); break;
  }
}

export const showersView = {
  id: 'showers', title: 'Showers', icon: icons.showers,
  mount(el, c) {
    ctx = c;
    el.innerHTML = '<div class="stack" id="showers-body"></div>';
    root = el.querySelector('#showers-body');
    root.addEventListener('click', onClick);
    render();
    this._off = ctx.bus.on('iss', render);        // fires when location/settings change
  },
  tick() {
    if (!root) return;
    if (Date.now() - lastFull > 60000) render(); else updateCounts();
  },
  unmount() { if (this._off) this._off(); root = null; },
};
