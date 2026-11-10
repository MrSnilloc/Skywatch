// views/tonight.js — "Look Up": a plan for today and tonight (what's worth looking at, when, which way),
// whether the sky will be clear, and what's coming in the next month. Daytime events (solar eclipses) live here too.

import * as sky from '../sky.js';
import { buildPlan } from '../outlook.js';
import { fetchClouds, avgCloud, cloudVerdict } from '../weather.js';
import { loadSat } from '../satellites.js';
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
  return `<div class="card tl"><div class="eyebrow">Timeline</div>${rows.join('')}<div class="tl-row"><span class="tl-l"></span><div class="tl-axis">${ticks.join('')}</div></div></div>`;
}

const fill = (it) => it.detail.replace('%T', fmtTime(it.when)).replace('%P', fmtTime(it.peak || it.when));

function cardHTML(it) {
  const ic = it.kind === 'pass' ? icons.iss : it.kind === 'shower' ? icons.showers : icons.events;
  const attr = it.sat ? `data-sat="${it.sat}"` : it.go ? `data-go="${it.go}" ${it.section ? `data-sec="${it.section}"` : ''}` : '';
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
  root.innerHTML = `${headerHTML(p)}${timelineHTML(p)}
    <h3 class="sect">Worth looking up for</h3>
    ${cards.length ? cards.map(cardHTML).join('') : '<div class="card"><div class="muted">A quiet one — nothing special tonight. The planets below are still worth a look, and there’s more coming up.</div></div>'}
    ${planetsHTML(p)}${laterHTML(p)}
    <p class="foot">Worked out for ${esc(ctx.location().name)}. Cloud forecast: Open-Meteo.com. Tap anything to explore.</p>`;
}

async function getClouds() {
  if (loadingClouds) return;
  loadingClouds = true;
  try { clouds = await fetchClouds(ctx.location()); cloudErr = ''; } catch (e) { cloudErr = e.message; }
  loadingClouds = false;
  render();
}

function onClick(e) {
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
    this._off = ctx.bus.on('iss', () => { if (Date.now() - planAt > 4000) render(); });
  },
  tick() { if (root && Date.now() - planAt > 60000) render(); },
  unmount() { if (this._off) this._off(); satTimers.forEach(clearTimeout); satTimers = []; root = null; },
};
void sky;
