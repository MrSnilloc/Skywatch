// views/planes.js — live planes around you, hosted inside the Passes tab ("✈ Planes" chip).
//   Radar : you in the middle, rings, trails, "visible above 10°" ring, arrows on planes heading your way.
//   Map   : dark street map with planes gliding in real time; North-up or Heading-up (turns with your phone).

import { loadPlanes, planeLook, kmToMi, ktToMph, altColor, closestApproach } from '../planes.js';
import { dirName } from '../sky.js';
import { createOrientation } from '../compass.js';
import { compassCorrection } from '../calibration.js';
import { store } from '../store.js';
import { col, isNight } from '../colors.js';
import { esc } from '../ui.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
const V = { mode: 'map', rangeMi: 50, zoom: 9, headingUp: false, follow: 'me', center: null };   // kept between visits
let ctx, host, cv, g, timer = null, sel = null, raf = 0, orient = null, heading = 0, W = 0, H = 0, dpr = 1;
const tiles = new Map();
const pointers = new Map();

// ---------- shared helpers ----------
function rows(rangeMi) {
  const P = ctx.planes; if (!P || !P.list.length) return [];
  const loc = ctx.location(), now = Date.now();
  return P.list.map(p => ({ p, lk: planeLook(p, loc, now), ca: closestApproach(p, loc, now) }))
    .filter(x => kmToMi(x.lk.groundKm) <= rangeMi).sort((a, b) => a.lk.groundKm - b.lk.groundKm);
}
const towardYou = (ca) => ca && ca.approaching && ca.distKm < 15 && ca.inSec < 900;

export function planesHTML(c) {
  ctx = c;
  const P = ctx.planes;
  const status = !P || P.status === 'idle' || (P.status === 'loading' && !P.list.length) ? '<div class="card"><div class="muted">Listening for planes…</div></div>'
    : P.status === 'error' ? (P.webOnly
      ? `<div class="card warn"><div class="big">✈ Live planes are in the Android app</div><div class="muted">Web browsers block the free plane-tracking feeds for websites, so live planes only work in the installed UpSight Android app. Everything else works here.</div></div>`
      : `<div class="card warn"><div class="big">Couldn’t reach the plane feeds</div><div class="muted">${esc(P.error || '')}</div></div>`) : '';
  const mapCtl = `<div class="map-ctl">
      <button class="chip" data-mz="1" aria-label="Zoom in">＋</button><button class="chip" data-mz="-1" aria-label="Zoom out">－</button>
      <button class="chip" data-a="me" aria-label="Centre on me">◎</button>
      <button class="chip ${V.headingUp ? 'on' : ''}" data-a="heading">${V.headingUp ? '🧭 Heading up' : 'N↑ North up'}</button></div>`;
  return `${status}
    <div class="card radar-card">
      <div class="tl-top"><div class="seg small"><button data-pm="map" class="${V.mode === 'map' ? 'on' : ''}">Map</button><button data-pm="radar" class="${V.mode === 'radar' ? 'on' : ''}">Radar</button></div>
        ${V.mode === 'radar' ? `<div class="seg small">${[25, 50, 100].map(r => `<button data-range="${r}" class="${r === V.rangeMi ? 'on' : ''}">${r} mi</button>`).join('')}</div>` : ''}</div>
      <div class="pv-wrap ${V.mode}"><canvas id="pv"></canvas>${V.mode === 'map' ? mapCtl + `<div class="map-attr">${esc(ctx.config.planes.mapAttribution)}</div>` : ''}</div>
      <div id="plane-sel"></div>
    </div>
    <div id="plane-list"></div>
    <p class="foot">Live positions from community ADS-B receivers${P && P.source ? ' (' + esc(P.source) + ')' : ''}. Some planes (military, private) don’t broadcast.</p>`;
}

// ---------- radar ----------
function drawRadar() {
  const c = W / 2, R = c - 16, rangeMi = V.rangeMi;
  g.clearRect(0, 0, W, H);
  const bg = g.createRadialGradient(c, c, 0, c, c, R); bg.addColorStop(0, col('#0e2a22')); bg.addColorStop(1, col('#050d0b'));
  g.fillStyle = bg; g.beginPath(); g.arc(c, c, R, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = col('#1f5a45'); g.lineWidth = 1;
  for (const f of [1 / 3, 2 / 3, 1]) { g.beginPath(); g.arc(c, c, R * f, 0, 2 * Math.PI); g.stroke(); }
  g.beginPath(); g.moveTo(c - R, c); g.lineTo(c + R, c); g.moveTo(c, c - R); g.lineTo(c, c + R); g.stroke();
  g.font = '10px system-ui'; g.fillStyle = col('#4fae8a');
  for (const f of [1 / 3, 2 / 3]) g.fillText(`${Math.round(rangeMi * f)} mi`, c + 3, c - R * f - 3);
  // "visible" ring: a jet at 35,000 ft is at least 10° above your horizon inside this circle
  const visMi = kmToMi(35000 * 0.3048 / 1000 / Math.tan(10 * RAD));
  if (visMi < rangeMi) {
    g.setLineDash([4, 5]); g.strokeStyle = col('#62f0a5'); g.globalAlpha = 0.55; g.beginPath(); g.arc(c, c, visMi / rangeMi * R, 0, 2 * Math.PI); g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = col('#62f0a5'); g.fillText('easy to see', c - 28, c + visMi / rangeMi * R - 4);
  }
  g.textAlign = 'center'; g.font = '700 11px system-ui';
  [['N', 0, -1], ['E', 1, 0], ['S', 0, 1], ['W', -1, 0]].forEach(([t, x, y]) => g.fillText(t, c + x * (R + 9), c + y * (R + 9) + 4));
  g.textAlign = 'start';
  const a = (performance.now() / 4000 % 1) * 2 * Math.PI - Math.PI / 2;
  if (g.createConicGradient) { const sw = g.createConicGradient(a - 0.6, c, c); sw.addColorStop(0, 'rgba(98,240,165,0)'); sw.addColorStop(0.095, 'rgba(98,240,165,0.22)'); sw.addColorStop(0.1, 'rgba(98,240,165,0)'); g.fillStyle = sw; g.beginPath(); g.arc(c, c, R, 0, 2 * Math.PI); g.fill(); }
  g.fillStyle = col('#62f0a5'); g.beginPath(); g.arc(c, c, 3.5, 0, 2 * Math.PI); g.fill();
  const loc = ctx.location();
  const toXY = (lat, lon) => { const lk = planeLook({ lat, lon, altFt: 0, gsKt: 0, track: 0, vrate: 0, seen: Date.now() }, loc); const d = kmToMi(lk.groundKm) / rangeMi * R; return [c + Math.sin(lk.az * RAD) * d, c - Math.cos(lk.az * RAD) * d]; };
  for (const { p, lk, ca } of rows(rangeMi)) {
    const d = kmToMi(lk.groundKm) / rangeMi * R, x = c + Math.sin(lk.az * RAD) * d, y = c - Math.cos(lk.az * RAD) * d;
    trail(p, (la, lo) => toXY(la, lo), [x, y], altColor(p.altFt));
    planeIcon(x, y, p.track * RAD, altColor(p.altFt), sel === p.id, 1);
    g.font = '10px system-ui'; g.fillStyle = col(sel === p.id ? '#ffffff' : '#bfe8d6');
    g.fillText(p.call + (towardYou(ca) ? ' ▸you' : ''), x + 9, y - 2); g.fillStyle = col('#6fb59a'); g.fillText(`${(Math.round(p.altFt / 100) / 10).toFixed(1)}k ft`, x + 9, y + 9);
    hit(p.id, x, y);
  }
}

// ---------- map (Web Mercator tiles) ----------
const worldPx = (lat, lon, z) => {
  const s = 256 * Math.pow(2, z), sin = Math.sin(lat * RAD);
  return [(lon + 180) / 360 * s, (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s];
};
let useFallback = false, tileErrors = 0;
function tile(layer, z, x, y) {
  const n = Math.pow(2, z); x = ((x % n) + n) % n;
  if (y < 0 || y >= n) return null;
  const tpl = useFallback ? (layer === 0 ? ctx.config.planes.mapFallback : null) : ctx.config.planes.mapLayers[layer];
  if (!tpl) return null;
  const key = `${useFallback ? 'f' : layer}/${z}/${x}/${y}`;
  let t = tiles.get(key);
  if (!t) {
    t = new Image(); t.decoding = 'async';
    t.onerror = () => { if (!useFallback && layer === 0 && ++tileErrors > 4) { useFallback = true; tiles.clear(); const a = host && host.querySelector('.map-attr'); if (a) a.textContent = ctx.config.planes.mapFallbackAttribution; } };
    t.src = tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y);
    tiles.set(key, t);
    if (tiles.size > 400) tiles.delete(tiles.keys().next().value);
  }
  return t;
}
function mapCenter() {
  if (V.follow && V.follow !== 'me' && ctx.planes) {
    const p = ctx.planes.list.find(x => x.id === V.follow);
    if (p) { const lk = planeLook(p, ctx.location()); return { lat: lk.lat, lon: lk.lon }; }
  }
  if (V.follow === 'me' || !V.center) { const l = ctx.location(); return { lat: l.lat, lon: l.lon }; }
  return V.center;
}
function drawMap() {
  const z = V.zoom, zi = Math.floor(z), sc = Math.pow(2, z - zi);
  const cen = mapCenter(), cw = worldPx(cen.lat, cen.lon, z);
  const rot = V.headingUp ? -heading * RAD : 0;
  g.clearRect(0, 0, W, H);
  g.fillStyle = col('#0b0d12'); g.fillRect(0, 0, W, H);
  g.save(); g.translate(W / 2, H / 2); g.rotate(rot);
  // OpenStreetMap backup is a light map: flip it dark. Red night mode tints everything red.
  const base = useFallback ? 'invert(1) hue-rotate(180deg) brightness(.85) contrast(.9) saturate(.6)' : '';
  g.filter = (base + (isNight() ? ' sepia(1) saturate(4) hue-rotate(-40deg) brightness(.8)' : '')).trim() || 'none';
  const half = Math.hypot(W, H) / 2 + 256, tsz = 256 * sc;
  const cwi = [cw[0] / sc, cw[1] / sc];                      // centre in integer-zoom pixels
  const x0 = Math.floor((cwi[0] - half / sc) / 256), x1 = Math.floor((cwi[0] + half / sc) / 256);
  const y0 = Math.floor((cwi[1] - half / sc) / 256), y1 = Math.floor((cwi[1] + half / sc) / 256);
  for (let layer = 0; layer < 2; layer++) for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) {
    const im = tile(layer, zi, tx, ty);
    if (im && im.complete && im.naturalWidth) g.drawImage(im, tx * tsz - cw[0], ty * tsz - cw[1], tsz + 0.5, tsz + 0.5);
  }
  g.filter = 'none';
  const P = (lat, lon) => { const w = worldPx(lat, lon, z); return [w[0] - cw[0], w[1] - cw[1]]; };
  // you (with the way your phone faces)
  const l = ctx.location(), me = P(l.lat, l.lon);
  if (orient && orient.readAxes()) {
    g.save(); g.translate(me[0], me[1]); g.rotate(heading * RAD);
    const cone = g.createRadialGradient(0, 0, 0, 0, 0, 60); cone.addColorStop(0, 'rgba(98,240,165,.45)'); cone.addColorStop(1, 'rgba(98,240,165,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 60, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45); g.closePath(); g.fill(); g.restore();
  }
  g.fillStyle = col('#62f0a5'); g.beginPath(); g.arc(me[0], me[1], 6, 0, 2 * Math.PI); g.fill();
  g.strokeStyle = '#04070d'; g.lineWidth = 2; g.stroke();
  // planes
  const loc = ctx.location(), now = Date.now();
  const out = [];
  for (const p of (ctx.planes ? ctx.planes.list : [])) {
    const lk = planeLook(p, loc, now), q = P(lk.lat, lk.lon);
    if (Math.abs(q[0]) > half || Math.abs(q[1]) > half) continue;
    trail(p, P, q, altColor(p.altFt));
    planeIcon(q[0], q[1], p.track * RAD, altColor(p.altFt), sel === p.id, 1.15);
    out.push({ p, q });
  }
  g.restore();
  // labels drawn upright, after un-rotating
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (const { p, q } of out) {
    const x = W / 2 + q[0] * cs - q[1] * sn, y = H / 2 + q[0] * sn + q[1] * cs;
    if (x < -40 || x > W + 40 || y < -20 || y > H + 20) continue;
    if (V.zoom >= 8.5 || sel === p.id) {
      g.font = '600 10px system-ui'; g.lineWidth = 3; g.strokeStyle = '#000b';
      const t = `${p.call} · ${(Math.round(p.altFt / 100) / 10).toFixed(1)}k`;
      g.strokeText(t, x + 11, y - 4); g.fillStyle = col(sel === p.id ? '#ffffff' : '#dbe6f5'); g.fillText(t, x + 11, y - 4);
    }
    hit(p.id, x, y);
  }
  // compass rose when heading-up
  if (V.headingUp) {
    g.save(); g.translate(W - 30, 30); g.rotate(rot);
    g.fillStyle = col('#ff6b5c'); g.beginPath(); g.moveTo(0, -14); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
    g.fillStyle = col('#c9d4e6'); g.beginPath(); g.moveTo(0, 14); g.lineTo(5, 0); g.lineTo(-5, 0); g.closePath(); g.fill();
    g.restore(); g.font = '700 10px system-ui'; g.fillStyle = col('#ff6b5c'); g.textAlign = 'center';
    g.fillText('N', W - 30 + Math.sin(-rot) * -22, 30 - Math.cos(-rot) * 22 + 4); g.textAlign = 'start';
  }
}

// ---------- shared drawing ----------
let hits = [];
const hit = (id, x, y) => hits.push({ id, x, y });
function trail(p, P, head, color) {
  const tr = ctx.planes.trails && ctx.planes.trails[p.id];
  if (!tr || tr.length < 1) return;
  const pts = tr.map(t => P(t.lat, t.lon)); pts.push(head);
  for (let i = 1; i < pts.length; i++) {
    g.strokeStyle = col(color); g.globalAlpha = 0.12 + 0.6 * (i / pts.length); g.lineWidth = 2;
    g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  }
  g.globalAlpha = 1;
}
function planeIcon(x, y, ang, color, isSel, s) {
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
  g.fillStyle = col(isSel ? '#ffffff' : color);
  g.beginPath(); g.moveTo(0, -9); g.lineTo(1.6, -3); g.lineTo(8, 1); g.lineTo(8, 3); g.lineTo(1.6, 1); g.lineTo(1.2, 6); g.lineTo(3.5, 8); g.lineTo(3.5, 9);
  g.lineTo(0, 8); g.lineTo(-3.5, 9); g.lineTo(-3.5, 8); g.lineTo(-1.2, 6); g.lineTo(-1.6, 1); g.lineTo(-8, 3); g.lineTo(-8, 1); g.lineTo(-1.6, -3); g.closePath(); g.fill();
  g.restore();
  if (isSel) { g.strokeStyle = col('#ffffff'); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 14, 0, 2 * Math.PI); g.stroke(); }
}

function frame() {
  if (!cv || !cv.isConnected) return;
  raf = requestAnimationFrame(frame);
  const r = cv.getBoundingClientRect();
  dpr = Math.min(3, devicePixelRatio || 1);
  const w = Math.round(r.width), h = Math.round(r.height);
  if (w !== W || h !== H) { W = w; H = h; cv.width = W * dpr; cv.height = H * dpr; }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (V.headingUp && orient) {
    const ax = orient.readAxes();
    if (ax) {
      const top = Math.hypot(ax.y[0], ax.y[1]) > 0.5 ? ax.y : ax.z.map(v => -v);   // flat: top of phone · upright: camera direction
      const hd = (Math.atan2(top[0], top[1]) * DEG + 360) % 360;
      const d = ((hd - heading + 540) % 360) - 180; heading = (heading + d * 0.2 + 360) % 360;
    }
  }
  hits = [];
  if (V.mode === 'radar') drawRadar(); else drawMap();
}

// ---------- list + selection ----------
function selHTML() {
  if (!sel || !ctx.planes) return '';
  const p = ctx.planes.list.find(x => x.id === sel); if (!p) return '';
  const loc = ctx.location(), lk = planeLook(p, loc), ca = closestApproach(p, loc);
  const near = ca && ca.approaching && ca.distKm < 8 && ca.inSec < 1200
    ? `Heading your way — passes within ${kmToMi(ca.distKm).toFixed(1)} mi in ${Math.max(1, Math.round(ca.inSec / 60))} min` : '';
  return `<div class="plane-card"><div class="si-head"><div><div class="big">${esc(p.call)}</div><div class="sub">${esc([p.desc || p.type, p.ownOp].filter(Boolean).join(' · ') || 'Aircraft')}</div></div><button class="x" data-back data-a="unsel">✕</button></div>
    <div class="sub">${Math.round(lk.altFt).toLocaleString()} ft${p.vrate > 300 ? ' ↗ climbing' : p.vrate < -300 ? ' ↘ descending' : ''} · ${Math.round(ktToMph(p.gsKt))} mph heading ${dirName(p.track)} · ${Math.round(kmToMi(lk.groundKm))} mi away</div>
    <div class="sub">${lk.el > 1 ? `In your sky: ${dirName(lk.az)}, ${Math.round(lk.el)}° up` : 'Below your horizon'}${near ? ' · <b class="good">' + esc(near) + '</b>' : ''}</div>
    <div class="actions"><button class="btn small" data-a="sky">Find it in the sky</button>${V.mode === 'map' ? `<button class="btn ghost small" data-a="follow">${V.follow === sel ? 'Following ✓' : 'Follow'}</button>` : ''}</div></div>`;
}
function drawList() {
  const el = host && host.querySelector('#plane-list'); if (!el) return;
  const list = rows(V.mode === 'radar' ? V.rangeMi : 70);
  const html = list.length ? `<div class="list">${list.slice(0, 25).map(({ p, lk, ca }) => `<button class="row tap ${sel === p.id ? 'sel' : ''}" data-plane="${p.id}">
      <span class="dot" style="--c:${altColor(p.altFt)}"></span>
      <span class="grow"><span class="name">${esc(p.call)}${p.type ? ` <span class="muted">· ${esc(p.type)}</span>` : ''}${towardYou(ca) ? ' <span class="badge good" style="margin:0 0 0 4px">toward you</span>' : ''}</span>
      <span class="sub">${Math.round(p.altFt).toLocaleString()} ft · ${Math.round(ktToMph(p.gsKt))} mph ${dirName(p.track)}${p.ownOp ? ' · ' + esc(p.ownOp) : ''}</span></span>
      <span class="right"><span class="val">${Math.round(kmToMi(lk.groundKm))} mi</span><span class="sub">${lk.el > 1 ? `${dirName(lk.az)} · ${Math.round(lk.el)}° up` : 'below horizon'}</span></span></button>`).join('')}</div>`
    : (ctx.planes && ctx.planes.status === 'ready' ? '<div class="card"><div class="muted">No planes in range right now.</div></div>' : '');
  if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
  const sb = host.querySelector('#plane-sel'), sh = selHTML();
  if (sb && sb.dataset.h !== sh) { sb.innerHTML = sh; sb.dataset.h = sh; }
}

// ---------- input ----------
function bind() {
  host.onclick = (e) => {
    const m = e.target.closest('[data-pm]'); if (m) { V.mode = m.dataset.pm; rerender(); return; }
    const r = e.target.closest('[data-range]'); if (r) { V.rangeMi = +r.dataset.range; rerender(); return; }
    const z = e.target.closest('[data-mz]'); if (z) { V.zoom = Math.max(5, Math.min(15, V.zoom + +z.dataset.mz)); return; }
    const a = e.target.closest('[data-a]');
    if (a) {
      const act = a.dataset.a;
      if (act === 'me') { V.follow = 'me'; V.center = null; }
      else if (act === 'heading') { V.headingUp = !V.headingUp; if (V.headingUp) startCompass(); a.textContent = V.headingUp ? '🧭 Heading up' : 'N↑ North up'; a.classList.toggle('on', V.headingUp); }
      else if (act === 'unsel') { sel = null; if (V.follow !== 'me') V.follow = null; drawList(); }
      else if (act === 'follow') { V.follow = V.follow === sel ? null : sel; if (!V.follow) V.center = mapCenterNow(); drawList(); }
      else if (act === 'sky') ctx.go('sky', { target: 'plane:' + sel });
      return;
    }
    const pl = e.target.closest('[data-plane]'); if (pl) { sel = pl.dataset.plane; drawList(); }
  };
  let start = null, lastDist = 0;
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); start = pointers.size === 1 ? { x: e.clientX, y: e.clientY, moved: false } : null; if (pointers.size === 2) { const [a, b] = [...pointers.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); } });
  cv.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (V.mode !== 'map') return;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (lastDist) V.zoom = Math.max(5, Math.min(15, V.zoom + Math.log2(d / lastDist))); lastDist = d; if (start) start.moved = true; return; }
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      start.moved = true;
      if (V.follow || !V.center) { V.center = mapCenterNow(); V.follow = null; }
      const rot = V.headingUp ? -heading * RAD : 0, cs = Math.cos(-rot), sn = Math.sin(-rot);
      const wx = dx * cs - dy * sn, wy = dx * sn + dy * cs;              // screen drag -> map drag
      const c = worldPx(V.center.lat, V.center.lon, V.zoom), s = 256 * Math.pow(2, V.zoom);
      const nx = c[0] - wx, ny = c[1] - wy;
      V.center = { lon: nx / s * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * ny / s))) * DEG };
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (start && !start.moved) {
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 26; for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < bd) { bd = d; best = h; } }
      sel = best ? best.id : null; drawList();
    }
    pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; start = null;
  });
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); start = null; });
  cv.addEventListener('wheel', (e) => { if (V.mode !== 'map') return; e.preventDefault(); V.zoom = Math.max(5, Math.min(15, V.zoom + (e.deltaY > 0 ? -0.25 : 0.25))); }, { passive: false });
}
const mapCenterNow = () => mapCenter();

function startCompass() {
  if (orient) return;
  orient = createOrientation({ smoothing: 0.25, getCorrection: () => compassCorrection(ctx.location()) });
  orient.start().catch(() => {});
}

function rerender() {
  const p = host.parentElement;
  stopPlanes(true);
  host.innerHTML = planesHTML(ctx);
  startPlanes(ctx, host);
  void p;
}

export function startPlanes(c, el) {
  ctx = c; host = el; document.body.classList.add('planes-on');
  cv = host.querySelector('#pv'); g = cv.getContext('2d'); W = 0;
  bind();
  if (V.headingUp || V.mode === 'map') startCompass();
  loadPlanes(ctx, { force: !ctx.planes || ctx.planes.status !== 'ready' });
  clearInterval(timer); timer = setInterval(() => { if (document.visibilityState === 'visible') loadPlanes(ctx); }, ctx.config.planes.refreshSec * 1000);
  cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  drawList();
}
export function tickPlanes() { drawList(); }
export function stopPlanes(keepCompass = false) {
  clearInterval(timer); timer = null; cancelAnimationFrame(raf); cv = null;
  if (!keepCompass && orient) { orient.stop(); orient = null; }
  if (!keepCompass) { host = null; document.body.classList.remove('planes-on'); }
}

