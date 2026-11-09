// views/tonight.js — "what's up right now": darkness, Moon, planets, next ISS pass.

import * as sky from '../sky.js';
import { fmtTime, fmtDay, fmtDayInline, fmtDate, fmtCountdown } from '../time.js';
import { visiblePasses } from '../issService.js';
import { icons, moonSVG, esc } from '../ui.js';

let root, ctx, timer, lastRun = 0;

function planetStatus(p, sunAlt) {
  const cfg = ctx.config.sky;
  if (p.elong < cfg.sunMinElongation) return { group: 3, text: 'Lost in the Sun’s glare', right: '—' };
  if (p.alt > 0) {
    const washed = sunAlt > -3 && p.mag > -3.5;
    return {
      group: washed ? 1 : 0,
      text: (washed ? 'Up, but washed out by daylight' : 'Up now') + (p.set ? ` · sets ${fmtTime(p.set)}` : ''),
      right: `${sky.dirName(p.az)} · ${Math.round(p.alt)}°`,
    };
  }
  return { group: 2, text: p.rise ? `Rises ${fmtDayInline(p.rise)} ${fmtTime(p.rise)}` : 'Below the horizon', right: 'Below horizon' };
}

function planetRow(p, sunAlt) {
  const st = planetStatus(p, sunAlt);
  const color = ctx.config.sky.planetColors[p.name];
  return {
    group: st.group, mag: p.mag,
    html: `<button class="row tap" data-target="planet:${p.name}">
      <span class="dot" style="--c:${color}"></span>
      <span class="grow"><span class="name">${p.name}</span><span class="sub">${st.text}</span></span>
      <span class="right"><span class="val">${st.right}</span><span class="sub">mag ${p.mag.toFixed(1)}</span></span>
    </button>`,
  };
}

function issTeaser() {
  const iss = ctx.iss;
  if (iss.status === 'loading' || iss.status === 'idle') return `<div class="card tap" data-go="iss"><div class="eyebrow">Space Station</div><div class="muted">Loading ISS orbit data…</div></div>`;
  if (iss.status === 'error') return `<div class="card tap warn" data-go="iss"><div class="eyebrow">Space Station</div><div>Couldn’t load ISS orbit data — tap for details.</div></div>`;
  const next = visiblePasses(ctx).find(p => p.visible);
  if (!next) return `<div class="card tap" data-go="iss"><div class="eyebrow">Space Station</div><div class="muted">No visible ISS passes in the next ${ctx.config.iss.passDays} days.</div></div>`;
  const when = next.visStart || next.rise.t;
  return `<div class="card tap" data-go="iss">
    <div class="eyebrow">Next visible ISS pass</div>
    <div class="big">${fmtDay(when)} · ${fmtTime(when)} <span class="chip-s">${fmtCountdown(when - Date.now())}</span></div>
    <div class="muted">${sky.dirName(next.rise.az)} → ${sky.dirName(next.set.az)} · up to ${Math.round(next.peak.el)}° · ${next.brightness}</div></div>`;
}

function render() {
  const now = new Date();
  const obs = sky.makeObserver(ctx.location());
  const sunAlt = sky.sunAltitude(now, obs);
  const st = sky.skyState(sunAlt);
  const moon = sky.moonInfo(now, obs);

  const cfg = ctx.config.sky;
  const rows = cfg.planets.map(n => planetRow(sky.planetInfo(n, now, obs), sunAlt))
    .sort((a, b) => a.group - b.group || a.mag - b.mag);
  const far = cfg.farPlanets.map(n => planetRow(sky.planetInfo(n, now, obs), sunAlt));

  const moonUp = moon.alt > 0;
  const moonLine = moonUp
    ? `${sky.dirName(moon.az)} · ${Math.round(moon.alt)}° up · sets ${fmtTime(moon.set)}`
    : `Below horizon · rises ${fmtDayInline(moon.rise)} ${fmtTime(moon.rise)}`;

  root.innerHTML = `
    <div class="skystate"><span class="pill ${st.key}">${st.label}</span><span class="muted">Sun ${sunAlt >= 0 ? '+' : ''}${sunAlt.toFixed(0)}° · ${fmtTime(now)}</span></div>
    <button class="card moon-card tap" data-target="moon">
      ${moonSVG(moon.phase)}
      <div class="grow">
        <div class="eyebrow">Moon</div>
        <div class="big">${moon.name}</div>
        <div class="muted">${Math.round(moon.fraction * 100)}% lit · ${moonLine}</div>
        <div class="sub">Full ${fmtDate(moon.nextFull)} · New ${fmtDate(moon.nextNew)}</div>
      </div>
    </button>
    ${issTeaser()}
    <h3 class="sect">Planets</h3>
    <div class="list">${rows.map(r => r.html).join('')}</div>
    <details class="fold"><summary>Faint planets (need binoculars / telescope)</summary>
      <div class="list">${far.map(r => r.html).join('')}</div></details>
    <p class="foot">Tap anything to point your phone at it.</p>`;
  lastRun = Date.now();
}

function onClick(e) {
  const t = e.target.closest('[data-target],[data-go]');
  if (!t) return;
  if (t.dataset.target) ctx.go('point', { target: t.dataset.target });
  else ctx.go(t.dataset.go);
}

export const tonightView = {
  id: 'tonight', title: 'Tonight', icon: icons.tonight,
  mount(el, c) {
    root = el; ctx = c;
    root.innerHTML = '<div class="stack" id="tonight-body"></div>';
    root = root.querySelector('#tonight-body');
    root.addEventListener('click', onClick);
    render();
    this._off = ctx.bus.on('iss', () => render());
  },
  tick() {
    if (Date.now() - lastRun >= ctx.config.sky.lightRefreshMs) render();
  },
  unmount() { if (this._off) this._off(); root = null; },
};
