// views/tonight.js — "Look Up": a plan for today and tonight (what's worth looking at, when, which way),
// whether the sky will be clear, and what's coming in the next month. Daytime events (solar eclipses) live here too.

import * as sky from '../sky.js';
import { buildPlan } from '../outlook.js';
import { fetchClouds, avgCloud, cloudVerdict } from '../weather.js';
import { loadSat, loadStarlink, starlinkState } from '../satellites.js';
import { loadLaunches } from '../launches.js';
import { loadComets } from '../comets.js';
import { loadPlanes, overheadSoon, kmToMi } from '../planes.js';
import { routeOf, routeLine } from '../routes.js';
import { store } from '../store.js';
import { fmtTime, fmtDay, fmtCountdown } from '../time.js';
import { icons, esc, moonSVG } from '../ui.js';

let root, ctx, plan = null, planAt = 0, clouds = null, cloudErr = '', loadingClouds = false, satTimers = [];

const PCT = (t, a, b) => Math.max(0, Math.min(100, (t - a) / (b - a) * 100));
const dirOf = sky.dirName;

// ---------- pieces ----------

function headerHTML(p) {
  const night = p.night, w0 = night.start, w1 = night.end;
  const sunUp = p.sunAlt > 0;
  const avg = clouds ? avgCloud(clouds, Math.max(Date.now(), w0.getTime()), w1.getTime()) : null;
  const v = cloudVerdict(avg);
  const nightsRow = p.nights.map((n, i) => {
    const a = clouds ? avgCloud(clouds, Math.max(Date.now(), n.start.getTime()), n.end.getTime()) : null;
    const vv = cloudVerdict(a);
    const label = i === 0 ? (night.isNow ? 'Tonight' : 'Tonight') : n.start.toLocaleDateString('en-US', { weekday: 'short' });
    return `<div class="nt ${vv.level}"><div class="sub">${label}</div><div class="val">${a == null ? '—' : Math.round(a) + '%'}</div><div class="sub">${a == null ? (cloudErr ? 'offline' : '…') : vv.label}</div></div>`;
  }).join('');
  const when = sunUp ? `Sunset ${fmtTime(p.night.start)} <span class="chip-s">${fmtCountdown(p.night.start - Date.now())}</span>` : `Sunrise ${fmtTime(p.night.end)} <span class="chip-s">${fmtCountdown(p.night.end - Date.now())}</span>`;
  const m = p.moon;
  return `<div class="card">
    <div class="eyebrow">${sunUp ? 'Today & tonight' : 'Rest of tonight'}</div>
    <div class="lu-head">
      <div><div class="big">${esc(v.label)}</div><div class="sub">${avg == null ? (cloudErr ? 'Cloud forecast needs a connection' : 'Checking the cloud forecast…') : `${Math.round(avg)}% average cloud while it’s dark`}</div></div>
      <div class="lu-moon">${moonSVG(m.phase, 46)}<div class="sub">${Math.round(m.fraction * 100)}% lit</div></div>
    </div>
    <div class="nights">${nightsRow}</div>
    <div class="kv"><span class="sub">Sun</span><span style="flex:1">${when}</span></div>
    <div class="kv"><span class="sub">Dark</span><span style="flex:1">${p.dark ? `${fmtTime(p.dark.start)} – ${fmtTime(p.dark.end)}` : 'Never fully dark tonight'}</span></div>
    <div class="kv"><span class="sub">Moon</span><span style="flex:1">${m.from ? `up ${fmtTime(m.from)} – ${fmtTime(m.to)}` : 'down all night'} · <span class="${m.rating.level === 'bad' ? 'bad' : m.rating.level === 'ok' ? 'warnc' : 'good'}">${m.rating.label}</span></span></div>
  </div>`;
}

function timelineHTML(p) {
  const a = Math.max(Date.now(), p.night.start.getTime()) - 20 * 60e3, b = p.night.end.getTime();
  const x = (t) => PCT(t instanceof Date ? t.getTime() : t, a, b);
  const bar = (from, to, cls, style = '') => `<i class="tl-bar ${cls}" style="left:${x(from)}%;width:${Math.max(1.2, x(to) - x(from))}%;${style}"></i>`;
  const row = (label, inner, title = '') => `<div class="tl-row"><span class="tl-l" title="${esc(title)}">${esc(label)}</span><div class="tl-track">${inner}</div></div>`;
  const rows = [];
  if (clouds) {
    const segs = clouds.filter(h => h.t.getTime() + 3600e3 > a && h.t.getTime() < b).map(h => bar(Math.max(a, h.t.getTime()), Math.min(b, h.t.getTime() + 3600e3), 'cl', `opacity:${(0.12 + h.cloud / 100 * 0.78).toFixed(2)}`)).join('');
    rows.push(row('Cloud', segs));
  }
  if (p.dark) rows.push(row('Dark', bar(p.dark.start, p.dark.end, 'dk')));
  if (p.moon.from) rows.push(row('Moon', bar(p.moon.from, p.moon.to, 'mn')));
  for (const pl of p.planets.filter(q => !q.far).slice(0, 5)) rows.push(row(pl.name, bar(pl.from || pl.best.t, pl.to || pl.best.t, 'pl', `background:${ctx.config.sky.planetColors[pl.name]}`)));
  const passes = p.items.filter(i => i.kind === 'pass');
  if (passes.length) rows.push(row('Satellites', passes.map(i => bar(i.when, i.until || new Date(i.when.getTime() + 4 * 60e3), 'ps')).join('')));
  const sh = p.items.filter(i => i.kind === 'shower');
  if (sh.length) rows.push(row('Meteors', sh.map(i => bar(i.when, i.until || new Date(i.when.getTime() + 3600e3), 'sh')).join('')));
  if (!rows.length) return '';
  const ticks = [];
  const first = new Date(Math.ceil(a / 3600e3) * 3600e3);
  for (let t = first.getTime(), n = 0; t < b && n < 14; t += 3600e3, n++) if (new Date(t).getHours() % 2 === 0) ticks.push(`<span style="left:${x(t)}%">${fmtTime(new Date(t)).replace(':00', '').replace(' ', '')}</span>`);
  return `<button class="card tl tap" data-act="timeline"><div class="tl-top"><span class="eyebrow">Timeline</span><span class="sub">Tap for details ›</span></div>${rows.join('')}<div class="tl-row"><span class="tl-l"></span><div class="tl-axis">${ticks.join('')}</div></div></button>`;
}

// ---------- expanded timeline (sheet) ----------

/** Every moment worth knowing tonight, in time order: [{t, until?, key, label, detail, color}] */
function momentList(p) {
  const out = [], tw = p.twilight, now = Date.now();
  const add = (t, key, label, detail, color, until) => { if (t && (until || t).getTime() >= now - 5 * 60e3) out.push({ t, until, key, label, detail, color }); };
  if (!p.night.isNow) add(p.night.start, 'sky', 'Sunset', 'The Sun goes down — bright planets start to show', '#ffb454');
  add(tw.civilEnd, 'sky', 'Twilight deepens', 'Bright stars and planets easy to see', '#a58bff');
  add(tw.nauticalEnd, 'sky', 'Getting dark', 'Most stars visible; satellites still sunlit', '#a58bff');
  add(tw.astroEnd, 'sky', 'Fully dark', 'Best for meteors and faint objects', '#62f0a5');
  add(tw.astroStart, 'sky', 'Dawn begins', 'Sky starts to brighten', '#a58bff');
  add(tw.civilStart, 'sky', 'Bright twilight', 'Only the brightest planets remain', '#a58bff');
  add(p.night.end, 'sky', 'Sunrise', '', '#ffb454');
  const m = p.moon;
  if (m.from && m.from.getTime() > p.night.start.getTime() + 20 * 60e3) add(m.from, 'moon', 'Moonrise', `${Math.round(m.fraction * 100)}% lit`, '#e9e4d2');
  if (m.peak && m.peak.alt > 10 && m.peak.t - m.from > 40 * 60e3 && m.to - m.peak.t > 40 * 60e3) add(m.peak.t, 'moon', 'Moon highest', `${dirOf(m.peak.az)}, ${Math.round(m.peak.alt)}° up`, '#e9e4d2');
  if (m.to && m.to.getTime() < p.night.end.getTime() - 20 * 60e3) add(m.to, 'moon', 'Moonset', m.fraction > 0.5 ? 'Darker skies after this' : '', '#e9e4d2');
  for (const q of p.planets) {
    const c = ctx.config.sky.planetColors[q.name], k = 'planet:' + q.name;
    if (q.from && q.from.getTime() > p.night.start.getTime() + 30 * 60e3) add(q.from, k, `${q.name} climbs into view`, 'More than 10° above the horizon', c);
    add(q.best.t, k, `${q.name} at its best`, `${dirOf(q.best.az)}, ${Math.round(q.best.alt)}° up · mag ${q.mag.toFixed(1)}${q.far ? ' · telescope' : ''}`, c);
    if (q.to && q.to.getTime() < p.night.end.getTime() - 30 * 60e3) add(q.to, k, `${q.name} gets low`, 'Drops below 10°', c);
  }
  for (const it of p.items) {
    if (it.kind === 'planet') continue;
    const key = it.kind === 'pass' ? 'pass' : it.kind === 'shower' ? 'shower' : it.kind === 'launch' ? 'launch' : it.kind === 'comet' ? 'comet' : 'event';
    const color = { pass: '#5cc8ff', shower: '#62f0a5', launch: '#ff7a7a', event: '#ffb454', comet: '#7fe3d0' }[key];
    add(it.when, key, it.title, fill(it), color, it.until && it.until - it.when > 120e3 ? it.until : null);
  }
  return out.sort((a, b) => a.t - b.t);
}

function bigTimelineHTML(p, filter) {
  const a = Math.max(Date.now(), p.night.start.getTime()) - 30 * 60e3, b = p.night.end.getTime() + 15 * 60e3;
  const x = (t) => PCT(t instanceof Date ? t.getTime() : t, a, b);
  const bar = (from, to, cls, style = '', txt = '') => `<i class="tl-bar ${cls}" style="left:${x(from)}%;width:${Math.max(1, x(to) - x(from))}%;${style}">${txt}</i>`;
  const row = (key, label, inner) => `<button class="tl-row ${filter && filter !== key ? 'dimmed' : ''} ${filter === key ? 'sel' : ''}" data-row="${key}"><span class="tl-l">${esc(label)}</span><div class="tl-track">${inner}</div></button>`;
  const tw = p.twilight, rows = [];
  // sky darkness bands
  const sk = [[p.night.start, tw.civilEnd, '#3b3f7a'], [tw.civilEnd, tw.nauticalEnd, '#2a2d63'], [tw.nauticalEnd, tw.astroEnd, '#1b1d47'], [tw.astroEnd, tw.astroStart, '#0b0c22'],
    [tw.astroStart, tw.nauticalStart, '#1b1d47'], [tw.nauticalStart, tw.civilStart, '#2a2d63'], [tw.civilStart, p.night.end, '#3b3f7a']];
  rows.push(row('sky', 'Sky', sk.filter(s => s[0] && s[1] && s[1] > s[0]).map(s => bar(s[0], s[1], '', `background:${s[2]};border-radius:0`)).join('')));
  if (clouds) rows.push(row('cloud', 'Cloud', clouds.filter(h => h.t.getTime() + 3600e3 > a && h.t.getTime() < b).map(h => bar(Math.max(a, h.t.getTime()), Math.min(b, h.t.getTime() + 3600e3), 'cl', `opacity:${(0.15 + h.cloud / 100 * 0.8).toFixed(2)}`, `<b>${Math.round(h.cloud)}</b>`)).join('')));
  if (p.moon.from) rows.push(row('moon', 'Moon', bar(p.moon.from, p.moon.to, 'mn')));
  for (const q of p.planets) rows.push(row('planet:' + q.name, q.name, bar(q.from || q.best.t, q.to || q.best.t, 'pl', `background:${ctx.config.sky.planetColors[q.name]}${q.far ? ';opacity:.5' : ''}`) + `<i class="tl-dot" style="left:${x(q.best.t)}%"></i>`));
  const kinds = [['comet', 'Comets', 'cm'], ['pass', 'Satellites', 'ps'], ['shower', 'Meteors', 'sh'], ['launch', 'Launches', 'ln'], ['event', 'Events', 'ev']];
  for (const [k, lab, cls] of kinds) {
    const its = p.items.filter(i => (k === 'event' ? i.kind === 'event' : i.kind === k));
    if (its.length) rows.push(row(k, lab, its.map(i => bar(i.when, i.until && i.until > i.when ? i.until : new Date(i.when.getTime() + 6 * 60e3), cls)).join('')));
  }
  const ticks = [];
  const stepH = (b - a) / 3600e3 > 9 ? 2 : 1;
  for (let t = Math.ceil(a / 3600e3) * 3600e3; t < b; t += 3600e3) if (new Date(t).getHours() % stepH === 0) ticks.push(`<span style="left:${x(t)}%">${fmtTime(new Date(t)).replace(':00', '').replace(' ', '')}</span>`);
  const nowX = Date.now() > a && Date.now() < b ? `<i class="tl-now" style="left:calc(70px + (100% - 70px) * ${x(Date.now()) / 100})"></i>` : '';
  return `<div class="tl-big">${nowX}${rows.join('')}<div class="tl-row axis"><span class="tl-l"></span><div class="tl-axis">${ticks.join('')}</div></div></div>`;
}

function openTimeline(filter = null) {
  const p = plan; if (!p) return;
  const sheet = document.getElementById('sheet');
  const list = momentList(p).filter(m => !filter || m.key === filter || (filter === 'cloud' && false));
  const cloudAt = (t) => { if (!clouds) return ''; const h = clouds.find(c => c.t.getTime() <= t && c.t.getTime() + 3600e3 > t); return h ? `${Math.round(h.cloud)}% cloud` : ''; };
  const items = (filter === 'cloud' && clouds)
    ? clouds.filter(h => h.t.getTime() + 3600e3 > Date.now() && h.t <= p.night.end).map(h => { const v = cloudVerdict(h.cloud); return `<div class="mo"><span class="mo-t">${fmtTime(h.t)}</span><span class="mo-dot" style="background:#9db0c9"></span><span class="grow"><b>${Math.round(h.cloud)}% cloud</b><span class="sub">${v.label}</span></span></div>`; }).join('')
    : list.map(m => `<div class="mo"><span class="mo-t">${fmtTime(m.t)}${m.until ? `<span class="sub">– ${fmtTime(m.until)}</span>` : ''}</span><span class="mo-dot" style="background:${m.color}"></span><span class="grow"><b>${esc(m.label)}</b>${m.detail ? `<span class="sub">${esc(m.detail)}</span>` : ''}${clouds && m.key !== 'sky' ? `<span class="sub mo-c">${cloudAt(m.t.getTime())}</span>` : ''}</span></div>`).join('');
  sheet.innerHTML = `<div class="sheet-card tall">
    <div class="sheet-head"><h2>${p.sunAlt > 0 ? 'Tonight' : 'Rest of tonight'}</h2><button class="btn ghost small" data-close>Done</button></div>
    <p class="sub" style="margin:4px 0 10px">${fmtDay(p.night.start)} ${fmtTime(p.night.start)} → ${fmtDay(p.night.end)} ${fmtTime(p.night.end)} · tap a row to see just that</p>
    <div class="card" style="padding:12px 10px">${bigTimelineHTML(p, filter)}</div>
    <h3 class="sect">${filter ? 'Showing one row · <button class="linkbtn" data-row="">show everything</button>' : 'Hour by hour'}</h3>
    <div class="card mo-list">${items || '<div class="muted">Nothing else in this row tonight.</div>'}</div>
  </div>`;
  sheet.classList.remove('hidden');
  sheet.onclick = (e) => {
    if (e.target === sheet || e.target.closest('[data-close]')) { sheet.classList.add('hidden'); sheet.innerHTML = ''; return; }
    const r = e.target.closest('[data-row]');
    if (r) openTimeline(r.dataset.row && r.dataset.row !== filter ? r.dataset.row : null);
  };
}

const fill = (it) => it.detail.replace('%T', fmtTime(it.when)).replace('%P', fmtTime(it.peak || it.when));

function cardHTML(it) {
  const ic = it.kind === 'comet' ? '<b style="font-size:19px">☄</b>' : it.kind === 'launch' ? icons.rocket : it.kind === 'pass' ? icons.iss : it.kind === 'shower' ? icons.showers : icons.events;
  const attr = it.target ? `data-target="${it.target}"` : it.sat ? `data-sat="${it.sat}"` : it.go ? `data-go="${it.go}" ${it.section ? `data-sec="${it.section}"` : ''}` : '';
  const timeTxt = it.noTime ? fmtDay(it.when) : `${it.day ? 'Daytime · ' : ''}${fmtDay(it.when)} ${fmtTime(it.when)}${it.until && it.until - it.when > 120e3 ? ' – ' + fmtTime(it.until) : ''}`;
  return `<button class="card tap lu-card ${it.score >= 80 ? 'hot' : ''}" ${attr}>
    <span class="lu-ic">${ic}</span>
    <span class="grow"><span class="name">${esc(it.title)}</span><span class="sub">${esc(timeTxt)}</span><span class="sub">${esc(fill(it))}</span></span></button>`;
}

function planetsHTML(p) {
  if (!p.planets.length) return '';
  return `<h3 class="sect">Planets tonight</h3><div class="list">${p.planets.map(q => `<button class="row tap" data-target="planet:${q.name}">
    <span class="dot" style="--c:${ctx.config.sky.planetColors[q.name]}"></span>
    <span class="grow"><span class="name">${q.name}</span><span class="sub">${q.from ? `Up ${fmtTime(q.from)} – ${fmtTime(q.to)}` : 'Low'} · best ${fmtTime(q.best.t)}${q.far ? ' · telescope' : ''}</span></span>
    <span class="right"><span class="val">${dirOf(q.best.az)} · ${Math.round(q.best.alt)}°</span><span class="sub">mag ${q.mag.toFixed(1)}</span></span></button>`).join('')}</div>`;
}

function laterHTML(p) {
  if (!p.later.length) return '';
  return `<h3 class="sect">Coming up · next 30 days</h3><div class="list">${p.later.map(l => `<button class="row tap" data-go="events" data-sec="${l.section}">
    <span class="grow"><span class="name">${esc(l.title)}</span><span class="sub">${esc(l.detail)}</span></span>
    <span class="right"><span class="val">${fmtDay(l.when)}</span><span class="sub">${l.when.getFullYear() !== new Date().getFullYear() ? l.when.getFullYear() : ''}</span></span></button>`).join('')}</div>`;
}

function render() {
  if (!root) return;
  plan = buildPlan(ctx, new Date()); planAt = Date.now();
  const p = plan;
  const cards = p.items.filter(i => i.kind !== 'planet').slice(0, 8);
  root.innerHTML = `<div id="lu-plane"></div>${headerHTML(p)}${timelineHTML(p)}
    <h3 class="sect">Worth looking up for</h3>
    ${cards.length ? cards.map(cardHTML).join('') : '<div class="card"><div class="muted">A quiet one — nothing special tonight. The planets below are still worth a look, and there’s more coming up.</div></div>'}
    ${planetsHTML(p)}${laterHTML(p)}
    <p class="foot">Worked out for ${esc(ctx.location().name)}. Cloud forecast: Open-Meteo.com. Tap anything to explore.</p>`;
  planeBanner();
}

async function getClouds() {
  if (loadingClouds) return;
  loadingClouds = true;
  try { clouds = await fetchClouds(ctx.location()); cloudErr = ''; } catch (e) { cloudErr = e.message; }
  loadingClouds = false;
  render();
}

function planeBanner() {
  const el = root && root.querySelector('#lu-plane'); if (!el) return;
  let html = '';
  if (store.get('planeAlerts')) {
    const cfg = ctx.config.planes, x = overheadSoon(ctx, cfg.overheadKm, cfg.overheadSec)[0];
    if (x) {
      const { p, c } = x, sec = Math.round(c.inSec);
      const when = sec <= 20 ? 'overhead now' : sec < 90 ? `overhead in ${sec} s` : `overhead in ${Math.round(sec / 60)} min`;
      const rl = routeLine(routeOf(ctx, p));
      html = `<button class="card tap lu-plane" data-go="passes" data-plane-chip="1"><span class="ic">✈</span><span class="grow"><span class="name">${esc(p.call)} passing ${when}</span>${rl ? `<span class="sub">${esc(rl)}</span>` : ''}
        <span class="sub">${Math.round(p.altFt).toLocaleString()} ft${p.type ? ' · ' + esc(p.type) : ''} · look ${dirOf(c.now.az)}, ${Math.max(1, Math.round(c.now.el))}° up now · closest ${kmToMi(c.distKm).toFixed(1)} mi</span></span></button>`;
    }
  }
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

function onClick(e) {
  if (e.target.closest('[data-plane-chip]')) { ctx.go('passes', { sat: 'planes' }); return; }
  if (e.target.closest('[data-act="timeline"]')) { openTimeline(); return; }
  const t = e.target.closest('[data-target],[data-go],[data-sat]');
  if (!t) return;
  if (t.dataset.sat) ctx.go('passes', { sat: t.dataset.sat });
  else if (t.dataset.target) ctx.go('point', { target: t.dataset.target });
  else ctx.go(t.dataset.go, t.dataset.sec ? { section: t.dataset.sec } : undefined);
}

export const tonightView = {
  id: 'tonight', title: 'Look Up', icon: icons.tonight,
  mount(el, c) {
    ctx = c;
    el.innerHTML = '<div class="stack" id="lu-body"></div>';
    root = el.querySelector('#lu-body');
    root.addEventListener('click', onClick);
    render();
    getClouds();
    // Load Tiangong + Hubble quietly so their passes can appear in the plan.
    ctx.config.sats.featured.forEach((f, i) => {
      const e = ctx.sats.items[f.id];
      if (e && e.status === 'idle') satTimers.push(setTimeout(() => loadSat(ctx, f.id), 1500 + i * 2500));
    });
    if (starlinkState(ctx).status === 'idle') satTimers.push(setTimeout(() => loadStarlink(ctx), 7000));
    if (!ctx.launches || ctx.launches.status === 'idle') loadLaunches(ctx);
    if (!ctx.comets || ctx.comets.status === 'idle') loadComets(ctx);
    this._offC = ctx.bus.on('comets', () => render());
    this._offP = ctx.bus.on('planes', () => planeBanner());
    this._offR = ctx.bus.on('routes', () => planeBanner());
    const poll = () => { if (store.get('planeAlerts') && document.visibilityState === 'visible') loadPlanes(ctx); };
    poll(); this._planeTimer = setInterval(poll, 20000);
    this._offL = ctx.bus.on('launches', () => render());
    this._off = ctx.bus.on('iss', () => { if (Date.now() - planAt > 4000) render(); });
  },
  tick() { if (!root) return; if (Date.now() - planAt > 60000) render(); else planeBanner(); },
  unmount() { if (this._off) this._off(); if (this._offL) this._offL(); if (this._offC) this._offC(); if (this._offP) this._offP(); if (this._offR) this._offR(); clearInterval(this._planeTimer); satTimers.forEach(clearTimeout); satTimers = []; root = null; },
};
void sky;
