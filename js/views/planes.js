// views/planes.js — live planes around you: a radar (you in the middle) and a nearest-first list.
// Used inside the Passes tab (the "✈ Planes" chip). Exports render/tick/stop so the Passes screen can host it.

import { loadPlanes, planeLook, kmToMi, ktToMph } from '../planes.js';
import { dirName } from '../sky.js';
import { col } from '../colors.js';
import { esc } from '../ui.js';

const RAD = Math.PI / 180;
let ctx, host, cv, g, timer = null, rangeMi = 50, sel = null;

export function planesHTML(c) {
  ctx = c;
  const P = ctx.planes;
  const status = !P || P.status === 'idle' || (P.status === 'loading' && !P.list.length) ? '<div class="card"><div class="muted">Listening for planes…</div></div>'
    : P.status === 'error' ? `<div class="card warn"><div class="big">Couldn’t reach the plane feeds</div><div class="muted">${esc(P.error || '')}</div><p class="tip">These free feeds sometimes block web apps; the Android-app version won’t have that problem.</p></div>` : '';
  return `${status}
    <div class="card radar-card"><div class="tl-top"><span class="eyebrow">Radar · ${rangeMi} miles</span>
      <div class="seg small">${[25, 50, 100].map(r => `<button data-range="${r}" class="${r === rangeMi ? 'on' : ''}">${r}</button>`).join('')}</div></div>
      <canvas id="radar"></canvas></div>
    <div id="plane-list"></div>
    <p class="foot">Live positions from community ADS-B receivers${P && P.source ? ' (' + esc(P.source) + ')' : ''}. Some planes (military, private) don’t broadcast.</p>`;
}

function rows() {
  const P = ctx.planes; if (!P || !P.list.length) return [];
  const loc = ctx.location(), now = Date.now();
  return P.list.map(p => ({ p, lk: planeLook(p, loc, now) })).filter(x => kmToMi(x.lk.groundKm) <= rangeMi).sort((a, b) => a.lk.groundKm - b.lk.groundKm);
}

function drawRadar() {
  if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1), S = Math.round(r.width);
  if (cv.width !== S * dpr) { cv.width = S * dpr; cv.height = S * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const c = S / 2, R = c - 14;
  g.clearRect(0, 0, S, S);
  const bg = g.createRadialGradient(c, c, 0, c, c, R); bg.addColorStop(0, col('#0e2a22')); bg.addColorStop(1, col('#050d0b'));
  g.fillStyle = bg; g.beginPath(); g.arc(c, c, R, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = col('#1f5a45'); g.lineWidth = 1;
  for (const f of [1 / 3, 2 / 3, 1]) { g.beginPath(); g.arc(c, c, R * f, 0, 2 * Math.PI); g.stroke(); }
  g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
  g.font = '10px system-ui'; g.fillStyle = col('#4fae8a');
  for (const f of [1 / 3, 2 / 3]) g.fillText(`${Math.round(rangeMi * f)} mi`, c + 3, c - R * f - 3);
  g.textAlign = 'center'; g.font = '700 11px system-ui';
  [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([t, x, y]) => g.fillText(t, c + x * (R + 8), c + y * (R + 8) + 4));
  g.textAlign = 'start';
  // sweep
  const a = (performance.now() / 4000 % 1) * 2 * Math.PI - Math.PI / 2;
  const sw = g.createConicGradient ? g.createConicGradient(a - 0.6, c, c) : null;
  if (sw) { sw.addColorStop(0, 'rgba(98,240,165,0)'); sw.addColorStop(0.095, 'rgba(98,240,165,0.22)'); sw.addColorStop(0.1, 'rgba(98,240,165,0)'); g.fillStyle = sw; g.beginPath(); g.arc(c, c, R, 0, 2 * Math.PI); g.fill(); }
  // you
  g.fillStyle = col('#62f0a5'); g.beginPath(); g.arc(c, c, 3.5, 0, 2 * Math.PI); g.fill();
  // planes
  for (const { p, lk } of rows()) {
    const d = kmToMi(lk.groundKm) / rangeMi * R, x = c + Math.sin(lk.az * RAD) * d, y = c - Math.cos(lk.az * RAD) * d;
    const isSel = sel === p.id;
    g.save(); g.translate(x, y); g.rotate(p.track * RAD);
    g.fillStyle = col(isSel ? '#ffffff' : p.altFt > 20000 ? '#9fe0ff' : '#ffd27a');
    g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2.5); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    g.font = '10px system-ui'; g.fillStyle = col(isSel ? '#ffffff' : '#bfe8d6');
    g.fillText(p.call, x + 8, y - 2); g.fillStyle = col('#6fb59a'); g.fillText(`${Math.round(p.altFt / 100) / 10}k ft`, x + 8, y + 9);
    if (isSel) { g.strokeStyle = col('#ffffff'); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 11, 0, 2 * Math.PI); g.stroke(); }
  }
}

function drawList() {
  const el = host && host.querySelector('#plane-list'); if (!el) return;
  const list = rows();
  const html = list.length ? `<div class="list">${list.slice(0, 25).map(({ p, lk }) => `<button class="row tap ${sel === p.id ? 'sel' : ''}" data-plane="${p.id}">
      <span class="grow"><span class="name">${esc(p.call)}${p.type ? ` <span class="muted">· ${esc(p.type)}</span>` : ''}</span>
      <span class="sub">${Math.round(p.altFt).toLocaleString()} ft · ${Math.round(ktToMph(p.gsKt))} mph heading ${dirName(p.track)}${p.ownOp ? ' · ' + esc(p.ownOp) : ''}</span></span>
      <span class="right"><span class="val">${Math.round(kmToMi(lk.groundKm))} mi</span><span class="sub">${lk.el > 1 ? `${dirName(lk.az)} · ${Math.round(lk.el)}° up` : 'below horizon'}</span></span></button>`).join('')}</div>`
    : (ctx.planes && ctx.planes.status === 'ready' ? '<div class="card"><div class="muted">No planes in range right now.</div></div>' : '');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
}

export function startPlanes(c, el) {
  ctx = c; host = el;
  cv = host.querySelector('#radar'); g = cv.getContext('2d');
  host.onclick = (e) => {
    const r = e.target.closest('[data-range]'); if (r) { rangeMi = +r.dataset.range; host.querySelectorAll('[data-range]').forEach(b => b.classList.toggle('on', b === r)); drawRadar(); drawList(); return; }
    const pl = e.target.closest('[data-plane]');
    if (pl) { if (sel === pl.dataset.plane) ctx.go('sky', { target: 'plane:' + pl.dataset.plane }); else { sel = pl.dataset.plane; drawList(); } }
  };
  loadPlanes(ctx, { force: !ctx.planes || ctx.planes.status !== 'ready' });
  clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') loadPlanes(ctx); }, ctx.config.planes.refreshSec * 1000);
  const loop = () => { if (!cv || !cv.isConnected) return; drawRadar(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  drawList();
}
export function tickPlanes() { drawList(); }
export function stopPlanes() { clearInterval(timer); timer = null; cv = null; host = null; }
