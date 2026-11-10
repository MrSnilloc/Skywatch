// views/skymap.js — live sky map: hold your phone up and see what's there (works day or night).
//   Live mode  : the map follows the phone's sensors, like a window onto the sky.
//   Drag mode  : swipe to look around (also how you preview the sky from the couch).
// Layers: stars, constellations, planets, Sun, Moon, satellites, deep-sky objects.  Tap anything to identify it.

import * as M from '../skymath.js';
import * as sky from '../sky.js';
import { loadSkyData, skyData, updateSkyPositions, vecAt } from '../skydata.js';
import { createOrientation } from '../compass.js';
import { currentDeclination } from '../magnetic.js';
import { store } from '../store.js';
import { icons, esc, toast } from '../ui.js';
import { loadGroup, overheadNow } from '../satellites.js';
import { fmtTime, fmtDayInline } from '../time.js';
import { col, mix } from '../colors.js';

const A = () => globalThis.Astronomy;
const RAD = Math.PI / 180, DEG = 180 / Math.PI;

// State that survives leaving and coming back to the screen.
const S = {
  mode: 'live', fov: 60, az: 180, alt: 35, offsetMs: 0, target: null, sel: null,
  layers: { stars: true, names: true, lines: true, conNames: true, planets: true, sats: true, dso: true, grid: false, ground: true },
};
try { Object.assign(S.layers, store.getCache('skyLayers') || {}); } catch (e) { /* ignore */ }

const LAYER_LABELS = [
  ['stars', 'Stars'], ['names', 'Star names'], ['lines', 'Constellation lines'], ['conNames', 'Constellation names'],
  ['planets', 'Sun, Moon & planets'], ['sats', 'Satellites (ISS, Tiangong, Hubble…)'], ['dso', 'Clusters & nebulae'],
  ['grid', 'Altitude / direction grid'], ['ground', 'Shade below the horizon'],
];

let ctx, root, cv, g, W = 0, H = 0, dpr = 1, raf = 0, dirty = true, orient = null, mounted = false;
let nightWas = false, model = null, modelSec = -1, hits = [], starScr = null, lastView = null, wakeLock = null, ready = false, noData = '';
const pointers = new Map();
let gc = null, gg = null;

// ---------- model: positions of everything that moves ----------
function nowDate() { return new Date(Date.now() + S.offsetMs); }
const loc = () => ctx.location();

function updateModel(force) {
  const date = nowDate();
  const sec = Math.floor(date.getTime() / 1000);
  if (!force && sec === modelSec) return;
  modelSec = sec;
  const l = loc(), obs = sky.makeObserver(l);
  updateSkyPositions(A(), date, obs, `${l.lat},${l.lon}`);
  const objs = new Map();
  const add = (o) => objs.set(o.id, o);
  const sun = sky.bodyPosition('Sun', date, obs);
  add({ id: 'sun', kind: 'sun', label: 'Sun', vec: M.azAltToVec(sun.az, sun.alt), az: sun.az, alt: sun.alt, color: '#ffd84a' });
  const moon = sky.bodyPosition('Moon', date, obs);
  add({ id: 'moon', kind: 'moon', label: 'Moon', vec: M.azAltToVec(moon.az, moon.alt), az: moon.az, alt: moon.alt, color: '#efe9d6', phase: A().MoonPhase(date) });
  for (const n of [...ctx.config.sky.planets, ...ctx.config.sky.farPlanets]) {
    const p = sky.bodyPosition(n, date, obs);
    let mag = 5; try { mag = A().Illumination(n, date).mag; } catch (e) { /* ignore */ }
    add({ id: 'planet:' + n, kind: 'planet', label: n, vec: M.azAltToVec(p.az, p.alt), az: p.az, alt: p.alt, mag, color: ctx.config.sky.planetColors[n] });
  }
  const dark = sun.alt < -4;
  const sats = [];
  if (S.layers.sats) {
    for (const s of overheadNow(ctx, l, date, ctx.config.sats.overheadMinEl)) {
      const o = { id: 'sat:' + s.id, kind: 'sat', label: s.name, vec: M.azAltToVec(s.az, s.el), az: s.az, alt: s.el, rangeKm: s.rangeKm, sunlit: s.sunlit, seen: s.sunlit && dark };
      add(o); sats.push(o);
    }
  }
  model = { date, obs, sunAlt: sun.alt, objs, sats };
  dirty = true;
}

/** Where is the thing with this id right now? -> {vec,label} or null. */
function vecOf(id) {
  if (!id) return null;
  const D = skyData();
  if (id.startsWith('star:') && D) {
    const i = +id.slice(5);
    return { vec: vecAt(i), label: starName(i) };
  }
  if (id.startsWith('dso:') && D) {
    const i = +id.slice(4);
    const d = D.raw.dso[i];
    return { vec: vecAt(D.dsoStart + i), label: d[5] || d[4] };
  }
  const o = model && model.objs.get(id);
  return o ? { vec: o.vec, label: o.label } : null;
}

function starName(i) {
  const D = skyData();
  return (D.raw.names[i]) || `Star (mag ${D.mag[i].toFixed(1)})`;
}

// ---------- view ----------
function screenAngle() {
  if (screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle;
  return window.orientation || 0;
}

function currentView() {
  if (S.mode === 'live' && orient) {
    const ax = orient.readAxes();
    if (ax) {
      const v = M.viewFromDevice(ax, screenAngle());
      const p = M.vecToAzAlt(v.fwd);
      S.az = p.az; S.alt = p.alt;              // so Drag mode starts from where you were looking
      noData = '';
      return v;
    }
    noData = orient.running ? 'Waiting for the compass… move your phone in a figure-8' : 'Motion sensors are off';
  } else noData = '';
  return M.viewFromAzAlt(S.az, Math.max(-89.5, Math.min(89.5, S.alt)));
}

// ---------- drawing ----------
function resize() {
  const r = cv.parentElement.getBoundingClientRect();
  dpr = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  gc = document.createElement('canvas'); gc.width = Math.ceil(W / 6); gc.height = Math.ceil(H / 6); gg = gc.getContext('2d');
  dirty = true;
}

function drawMoon(x, y, r, phase, view, sunVec) {
  const k = Math.cos(phase * RAD);
  const sx = M.dot(sunVec, view.right), sy = M.dot(sunVec, view.up);
  g.save(); g.translate(x, y); g.rotate(Math.atan2(-sy, sx));
  g.fillStyle = col('#2b3242'); g.beginPath(); g.arc(0, 0, r, 0, 2 * Math.PI); g.fill();
  g.fillStyle = col('#f1ecd9'); g.beginPath();
  g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
  g.ellipse(0, 0, Math.max(0.01, Math.abs(k) * r), r, 0, Math.PI / 2, -Math.PI / 2, k > 0);
  g.fill();
  g.restore();
}

function draw() {
  if (!g || !ready || !model) return;
  const D = skyData();
  const L = S.layers;
  const view = currentView(); lastView = view;
  const span = Math.max(W, H), scale = M.scaleFor(S.fov, span);
  const cx = W / 2, cy = H / 2;
  const P = (v) => { const p = M.project(v, view, scale); return p ? [cx + p[0], cy + p[1], p[2]] : null; };
  const onScr = (p, m = 30) => p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m;
  hits = [];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // background: night blue -> day blue by Sun altitude
  const dayT = Math.max(0, Math.min(1, (model.sunAlt + 12) / 12));
  g.fillStyle = col(mix('#02040a', '#2d5a8c', dayT)); g.fillRect(0, 0, W, H);
  const starA = 1 - 0.5 * dayT;

  // ground shading (inverse stereographic per low-res pixel)
  if (L.ground && gg) {
    const gw = gc.width, gh = gc.height, img = gg.createImageData(gw, gh), d = img.data;
    const base = document.documentElement.classList.contains('night') ? [12, 1, 1] : [3, 5, 9];
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const u = (i * 6 + 3 - cx) / scale, w = -(j * 6 + 3 - cy) / scale;
      const rho = Math.hypot(u, w), th = 2 * Math.atan(rho / 2), c = Math.cos(th), s = rho > 0 ? Math.sin(th) / rho : 0;
      const z = view.fwd[2] * c + (view.right[2] * u + view.up[2] * w) * s;
      const a = Math.max(0, Math.min(1, 0.5 - z * 30)) * 0.62;
      const k = (j * gw + i) * 4; d[k] = base[0]; d[k + 1] = base[1]; d[k + 2] = base[2]; d[k + 3] = Math.round(a * 255);
    }
    gg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true; g.drawImage(gc, 0, 0, gc.width * 6, gc.height * 6);
  }

  // alt/az grid
  if (L.grid) {
    g.strokeStyle = col('#2a4468'); g.lineWidth = 1; g.globalAlpha = 0.7;
    const poly = (fn, n) => { g.beginPath(); let pen = false; for (let i = 0; i <= n; i++) { const p = P(fn(i / n)); if (!p) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } g.stroke(); };
    for (const alt of [15, 30, 45, 60, 75]) poly(t => M.azAltToVec(t * 360, alt), 120);
    for (let az = 0; az < 360; az += 30) poly(t => M.azAltToVec(az, -5 + t * 95), 40);
    g.globalAlpha = 1;
  }

  // constellation lines
  if (L.lines && D) {
    g.strokeStyle = col('#3f6aa6'); g.lineWidth = 1; g.globalAlpha = 0.6 * starA + 0.15; g.beginPath();
    for (const sg of D.segs) {
      let pen = false;
      for (let k = 0; k < sg.count; k++) {
        const p = P(vecAt(sg.start + k));
        if (!p) { pen = false; continue; }
        pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true;
      }
    }
    g.stroke(); g.globalAlpha = 1;
  }

  // deep-sky objects
  if (L.dso && D) {
    g.strokeStyle = col('#7fb0ff'); g.lineWidth = 1; g.fillStyle = col('#7fb0ff'); g.font = '10px system-ui'; g.globalAlpha = 0.85 * starA + 0.15;
    D.raw.dso.forEach((d, i) => {
      const p = P(vecAt(D.dsoStart + i));
      if (!onScr(p)) return;
      g.beginPath(); g.arc(p[0], p[1], 5, 0, 2 * Math.PI); g.setLineDash([2, 2]); g.stroke(); g.setLineDash([]);
      if (S.fov < 70 && d[5]) g.fillText(d[5], p[0] + 8, p[1] + 3);
      hits.push({ x: p[0], y: p[1], id: 'dso:' + i, label: d[5] || d[4], pri: 0 });
    });
    g.globalAlpha = 1;
  }

  // stars
  if (L.stars && D) {
    if (!starScr || starScr.length !== D.nStars * 2) starScr = new Float32Array(D.nStars * 2);
    const zf = Math.max(0.85, Math.min(1.9, 1 + (60 - S.fov) / 70));
    const labMag = S.fov > 80 ? 1.8 : S.fov > 50 ? 2.4 : S.fov > 30 ? 3.2 : 4.2;
    g.font = '11px system-ui';
    for (let i = 0; i < D.nStars; i++) {
      const p = P(vecAt(i));
      if (!onScr(p, 8)) { starScr[i * 2] = NaN; continue; }
      starScr[i * 2] = p[0]; starScr[i * 2 + 1] = p[1];
      const m = D.mag[i];
      const r = Math.max(0.55, Math.min(6.5, (6.6 - m) * 0.45 * zf));
      g.globalAlpha = Math.min(1, (0.55 + (6.2 - m) * 0.2)) * starA;
      g.fillStyle = col(M.bvColor(D.bv[i]));
      g.beginPath(); g.arc(p[0], p[1], r, 0, 2 * Math.PI); g.fill();
      if (m < 2.0) { g.globalAlpha = 0.16 * starA; g.beginPath(); g.arc(p[0], p[1], r * 2.4, 0, 2 * Math.PI); g.fill(); }
      if (L.names && m < labMag && D.raw.names[i]) {
        g.globalAlpha = 0.9 * starA; g.fillStyle = col('#a9bddb'); g.fillText(D.raw.names[i], p[0] + r + 4, p[1] + 4);
      }
    }
    g.globalAlpha = 1;
  }

  // constellation names
  if (L.conNames && D && S.fov <= 110) {
    g.font = '600 10px system-ui'; g.fillStyle = col('#6e92c8'); g.textAlign = 'center'; g.globalAlpha = 0.9 * starA + 0.1;
    D.raw.cons.forEach((c, i) => {
      const p = P(vecAt(D.labelStart + i));
      if (onScr(p, -10)) g.fillText(c.name.toUpperCase(), p[0], p[1]);
    });
    g.textAlign = 'start'; g.globalAlpha = 1;
  }

  // Sun, Moon, planets
  const sunO = model.objs.get('sun');
  if (L.planets) {
    for (const o of model.objs.values()) {
      if (o.kind === 'sat') continue;
      const p = P(o.vec);
      if (!onScr(p, 40)) continue;
      if (o.kind === 'sun') {
        const grd = g.createRadialGradient(p[0], p[1], 2, p[0], p[1], 34);
        grd.addColorStop(0, col('#ffe27a')); grd.addColorStop(1, 'rgba(255,216,74,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(p[0], p[1], 34, 0, 2 * Math.PI); g.fill();
        g.fillStyle = col('#fff1a8'); g.beginPath(); g.arc(p[0], p[1], 9, 0, 2 * Math.PI); g.fill();
      } else if (o.kind === 'moon') {
        const rr = Math.max(9, 0.26 * RAD * (2 / (1 + p[2])) * scale); // true size, never smaller than 9px
        drawMoon(p[0], p[1], rr, o.phase, view, sunO.vec);
      } else {
        const r = Math.max(2.6, Math.min(6.5, 3.4 + (1.2 - o.mag) * 0.55));
        g.fillStyle = col(o.color); g.beginPath(); g.arc(p[0], p[1], r, 0, 2 * Math.PI); g.fill();
        g.globalAlpha = 0.2; g.beginPath(); g.arc(p[0], p[1], r * 2.2, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
      }
      g.font = '600 11px system-ui'; g.fillStyle = col(o.kind === 'sun' ? '#ffe27a' : '#f3f0e6');
      g.fillText(o.label, p[0] + 12, p[1] - 8);
      hits.push({ x: p[0], y: p[1], id: o.id, label: o.label, pri: 12 });
    }
  }

  // satellites
  if (L.sats) {
    g.font = '10px system-ui';
    for (const o of model.sats) {
      const p = P(o.vec);
      if (!onScr(p, 30)) continue;
      const c = o.seen ? '#5cc8ff' : '#6b7c96';
      g.strokeStyle = col(c); g.fillStyle = col(c); g.lineWidth = o.seen ? 2 : 1.2;
      g.beginPath(); g.moveTo(p[0], p[1] - 6); g.lineTo(p[0] + 6, p[1]); g.lineTo(p[0], p[1] + 6); g.lineTo(p[0] - 6, p[1]); g.closePath();
      o.seen ? g.fill() : g.stroke();
      g.fillText(o.label + (o.seen ? '' : o.sunlit ? '' : ' (shadow)'), p[0] + 9, p[1] + 4);
      hits.push({ x: p[0], y: p[1], id: o.id, label: o.label, pri: 10 });
    }
  }

  // horizon line + directions
  g.strokeStyle = col('#74a8e0'); g.lineWidth = 1.6; g.beginPath();
  { let pen = false; for (let a = 0; a <= 360; a += 3) { const p = P(M.azAltToVec(a, 0)); if (!p) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } }
  g.stroke();
  g.textAlign = 'center';
  [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]].forEach(([n, a]) => {
    const p = P(M.azAltToVec(a, 3));
    if (!onScr(p, -4)) return;
    const major = n.length === 1;
    g.font = (major ? '700 15px' : '600 11px') + ' system-ui';
    g.fillStyle = col(n === 'N' ? '#ff8a7a' : '#9cc4f5'); g.fillText(n, p[0], p[1]);
  });
  { const p = P([0, 0, 1]); if (onScr(p, -4)) { g.font = '10px system-ui'; g.fillStyle = col('#7f9cc4'); g.fillText('+ zenith', p[0], p[1] - 6); } }
  g.textAlign = 'start';

  // selection ring + guidance arrow
  const ring = (id, colr) => {
    const t = vecOf(id); if (!t) return null;
    const p = P(t.vec);
    if (onScr(p, -10)) {
      g.strokeStyle = col(colr); g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], 15, 0, 2 * Math.PI); g.stroke();
      return { on: true, t };
    }
    return { on: false, t };
  };
  if (S.sel) ring(S.sel.id, '#ffffff');
  if (S.target) {
    const r = ring(S.target, '#62f0a5');
    if (r && !r.on) {
      const sx = M.dot(r.t.vec, view.right), sy = M.dot(r.t.vec, view.up);
      const ang = Math.atan2(sy, sx), rad = Math.min(W, H) / 2 - 40;
      const ax = cx + Math.cos(ang) * rad, ay = cy - Math.sin(ang) * rad;
      const dist = Math.round(M.angleBetween(r.t.vec, view.fwd));
      g.save(); g.translate(ax, ay); g.rotate(-ang);
      g.fillStyle = col('#62f0a5'); g.beginPath(); g.moveTo(20, 0); g.lineTo(-10, -13); g.lineTo(-4, 0); g.lineTo(-10, 13); g.closePath(); g.fill();
      g.restore();
      g.font = '600 12px system-ui'; g.fillStyle = col('#62f0a5'); g.textAlign = 'center';
      g.fillText(`${r.t.label} · ${dist}°`, Math.max(60, Math.min(W - 60, ax)), ay + (ay > cy ? -22 : 30)); g.textAlign = 'start';
    } else if (r && r.on && M.angleBetween(r.t.vec, view.fwd) < 1.5 && S.mode === 'live') {
      toast(`${r.t.label} is right there`); S.target = null; updateButtons();
    }
  }

  // centre reticle (live only) and HUD
  if (S.mode === 'live') {
    g.strokeStyle = col('#ffffff'); g.globalAlpha = 0.35; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); g.stroke(); g.globalAlpha = 1;
  }
  const c = M.vecToAzAlt(view.fwd);
  const hud = root.querySelector('#sky-hud');
  const txt = `${sky.dirName(c.az)} ${Math.round(c.az)}° · ${Math.round(c.alt)}° up · ${Math.round(S.fov)}° view`;
  if (hud.dataset.t !== txt) { hud.textContent = txt; hud.dataset.t = txt; }
  const note = root.querySelector('#sky-note');
  const nt = noData || (dayT > 0.6 ? 'Daytime — stars are drawn for reference; you can’t see them now' : '');
  if (note.dataset.t !== nt) { note.textContent = nt; note.dataset.t = nt; note.classList.toggle('hidden', !nt); }
  const tl = root.querySelector('#sky-time');
  const tt = S.offsetMs === 0 ? 'Now' : `${fmtDayInline(model.date)} ${fmtTime(model.date)}`;
  if (tl.dataset.t !== tt) { tl.textContent = tt; tl.dataset.t = tt; }
}

function frame() {
  if (!mounted) return;
  raf = requestAnimationFrame(frame);
  if (!ready) return;
  updateModel(false);
  const nightNow = document.documentElement.classList.contains('night');
  if (nightNow !== nightWas) { nightWas = nightNow; dirty = true; }
  if (S.mode === 'live' || dirty) { draw(); dirty = false; }
}

// ---------- identify ----------
function pick(x, y) {
  let best = null, bd = 28;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y) - h.pri; if (d < bd) { bd = d; best = h; } }
  const D = skyData();
  if (D && starScr) {
    for (let i = 0; i < D.nStars; i++) {
      const sx = starScr[i * 2]; if (sx !== sx) continue;
      const d = Math.hypot(sx - x, starScr[i * 2 + 1] - y) - (D.mag[i] < 2.5 ? 4 : 0);
      if (d < bd) { bd = d; best = { id: 'star:' + i, label: starName(i), x: sx, y: starScr[i * 2 + 1] }; }
    }
  }
  return best;
}

function describe(id) {
  const t = vecOf(id); if (!t) return null;
  const date = model.date, obs = model.obs;
  const pos = M.vecToAzAlt(t.vec);
  const rows = [];
  let title = t.label, sub = '';
  const rs = (name) => { const r = sky.riseSet(name, date, obs); if (r.rise) rows.push(['Rises', `${fmtDayInline(r.rise)} ${fmtTime(r.rise)}`]); if (r.set) rows.push(['Sets', `${fmtDayInline(r.set)} ${fmtTime(r.set)}`]); };
  if (id === 'sun') { sub = 'Our star — never look at it directly or through optics'; rs('Sun'); }
  else if (id === 'moon') { const m = sky.moonInfo(date, obs); sub = `${m.name} · ${Math.round(m.fraction * 100)}% lit`; rs('Moon'); if (m.nextFull) rows.push(['Next full', fmtDayInline(m.nextFull)]); }
  else if (id.startsWith('planet:')) { const p = sky.planetInfo(id.slice(7), date, obs); sub = `Planet · magnitude ${p.mag.toFixed(1)} · ${Math.round(p.elong)}° from the Sun`; rs(id.slice(7)); }
  else if (id.startsWith('sat:')) { const o = model.objs.get(id); sub = o ? `Satellite · ${Math.round(o.rangeKm)} km away · ${o.seen ? 'sunlit — visible to the eye' : o.sunlit ? 'sunlit, but the sky is too bright' : 'in Earth’s shadow — can’t be seen'}` : 'Satellite'; }
  else if (id.startsWith('star:')) { const i = +id.slice(5), D = skyData(); sub = `Star · magnitude ${D.mag[i].toFixed(1)}`; if (!D.raw.names[i]) title = 'Unnamed star'; }
  else if (id.startsWith('dso:')) { const d = skyData().raw.dso[+id.slice(4)]; const kinds = { oc: 'Open cluster', gc: 'Globular cluster', g: 'Galaxy', gn: 'Nebula', pn: 'Planetary nebula', en: 'Nebula', sn: 'Supernova remnant' }; title = d[5] || d[4]; sub = `${kinds[d[3]] || 'Deep-sky object'} · ${d[4]} · mag ${d[2]}`; }
  return { title, sub, pos, rows };
}

function showInfo() {
  const box = root.querySelector('#sky-info');
  if (!S.sel) { box.classList.add('hidden'); return; }
  const d = describe(S.sel.id);
  if (!d) { box.classList.add('hidden'); return; }
  const dir = `${sky.dirName(d.pos.az)} ${Math.round(d.pos.az)}° · ${d.pos.alt >= 0 ? Math.round(d.pos.alt) + '° up' : 'below horizon (' + Math.round(-d.pos.alt) + '° down)'}`;
  const pointable = !S.sel.id.startsWith('dso:');
  box.innerHTML = `<div class="si-head"><div><div class="big">${esc(d.title)}</div><div class="sub">${esc(d.sub)}</div></div><button class="x" data-a="close" aria-label="Close">✕</button></div>
    <div class="si-dir">${dir}</div>
    ${d.rows.map(r => `<div class="si-row"><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('')}
    <div class="actions"><button class="btn small" data-a="find">${S.target === S.sel.id ? 'Stop guiding' : 'Guide me to it'}</button>${pointable ? '<button class="btn ghost small" data-a="point">Finder screen</button>' : ''}</div>`;
  box.classList.remove('hidden');
}

function select(h) {
  S.sel = h ? { id: h.id, label: h.label } : null;
  showInfo(); dirty = true;
}

function guide(id) {
  if (S.target === id) { S.target = null; toast('Guide off'); }
  else {
    S.target = id;
    const t = vecOf(id);
    if (t && S.mode === 'free') { const p = M.vecToAzAlt(t.vec); S.az = p.az; S.alt = Math.max(-80, p.alt); }
    toast(S.mode === 'live' ? 'Turn toward the green arrow' : 'Centred on it');
  }
  showInfo(); updateButtons(); dirty = true;
}

// ---------- sheets ----------
function openSheet(html, after) {
  const sheet = document.getElementById('sheet');
  sheet.innerHTML = `<div class="sheet-card">${html}</div>`;
  sheet.classList.remove('hidden');
  const close = () => { sheet.classList.add('hidden'); sheet.innerHTML = ''; };
  sheet.onclick = (e) => { if (e.target === sheet || e.target.closest('[data-close]')) close(); else after && after(e, close); };
}

function openLayers() {
  const body = LAYER_LABELS.map(([k, n]) => `<label class="srow"><span>${n}</span><input type="checkbox" data-k="${k}" ${S.layers[k] ? 'checked' : ''}></label>`).join('');
  openSheet(`<div class="sheet-head"><h2>Show on map</h2><button class="btn ghost small" data-close>Done</button></div><div class="stack" style="margin-top:12px"><div class="card">${body}</div></div>`);
  document.getElementById('sheet').onchange = (e) => {
    const k = e.target.dataset.k; if (!k) return;
    S.layers[k] = e.target.checked; store.setCache('skyLayers', S.layers);
    if (k === 'sats' && e.target.checked) { loadGroup(ctx); }
    updateModel(true); dirty = true;
  };
}

function openFind() {
  const date = model.date;
  const rows = [];
  for (const o of model.objs.values()) {
    if (o.kind === 'sat' && !['iss', 'css', 'hst'].some(k => o.id === 'sat:' + k)) continue;
    rows.push({ id: o.id, label: o.label, az: o.az, alt: o.alt, group: o.kind === 'sat' ? 'Satellites' : 'Solar system' });
  }
  const D = skyData();
  const stars = [];
  Object.keys(D.raw.names).forEach(k => { const i = +k; if (D.mag[i] < 2.6) { const p = M.vecToAzAlt(vecAt(i)); stars.push({ id: 'star:' + i, label: D.raw.names[i], az: p.az, alt: p.alt, mag: D.mag[i], group: 'Bright stars' }); } });
  stars.sort((a, b) => a.mag - b.mag);
  const line = (r) => `<button class="srow find" data-id="${r.id}"><span>${esc(r.label)}</span><span class="${r.alt > 0 ? 'good' : 'muted'}">${r.alt > 0 ? sky.dirName(r.az) + ' · ' + Math.round(r.alt) + '° up' : 'below horizon'}</span></button>`;
  const sec = (name, list) => list.length ? `<div class="eyebrow" style="margin:14px 0 6px">${name}</div><div class="card">${list.map(line).join('')}</div>` : '';
  openSheet(`<div class="sheet-head"><h2>Find something</h2><button class="btn ghost small" data-close>Cancel</button></div>
    ${sec('Solar system', rows.filter(r => r.group === 'Solar system'))}${sec('Satellites', rows.filter(r => r.group === 'Satellites'))}${sec('Bright stars', stars)}`,
  (e, close) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    close(); S.target = null; select({ id: b.dataset.id, label: '' }); guide(b.dataset.id);
  });
  void date;
}

// ---------- controls ----------
function updateButtons() {
  if (!root) return;
  root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  const stop = root.querySelector('[data-a="stopguide"]'); if (stop) stop.classList.toggle('hidden', !S.target);
}

async function startLive() {
  if (!orient) return;
  try { await orient.start(); } catch (e) {
    await new Promise(r => setTimeout(r, 900));          // some browsers say "denied" yet still deliver sensor events
    if (!orient || orient.msSinceEvent > 2000) { toast('Motion sensors unavailable — using Drag mode'); S.mode = 'free'; updateButtons(); return; }
  }
  if (S.mode === 'live' && 'wakeLock' in navigator) { try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* ignore */ } }
}

function onClick(e) {
  const b = e.target.closest('[data-a],[data-mode]');
  if (!b) return;
  if (b.dataset.mode) {
    S.mode = b.dataset.mode; if (S.mode === 'live') startLive(); updateButtons(); dirty = true; return;
  }
  switch (b.dataset.a) {
    case 'layers': openLayers(); break;
    case 'find': if (b.closest('#sky-info')) { guide(S.sel.id); } else openFind(); break;
    case 'close': S.sel = null; showInfo(); dirty = true; break;
    case 'point': ctx.go('point', { target: S.sel.id }); break;
    case 'stopguide': S.target = null; updateButtons(); showInfo(); dirty = true; break;
    case 'zin': S.fov = Math.max(12, S.fov / 1.3); dirty = true; break;
    case 'zout': S.fov = Math.min(110, S.fov * 1.3); dirty = true; break;
    case 't': { const d = b.dataset.d; S.offsetMs = d === 'now' ? 0 : S.offsetMs + (+d) * 3600e3; updateModel(true); showInfo(); dirty = true; break; }
  }
}

function bindPointer() {
  let start = null, lastDist = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: false } : null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist > 0) { S.fov = Math.max(12, Math.min(110, S.fov * lastDist / d)); dirty = true; }
      lastDist = d; if (start) start.moved = true;
    } else if (pointers.size === 1) {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) start.moved = true;
      if (S.mode === 'free') {
        const dpp = M.degPerPx(S.fov, Math.max(W, H));
        S.az = ((S.az - dx * dpp / Math.max(0.35, Math.cos(S.alt * RAD))) % 360 + 360) % 360;
        S.alt = Math.max(-89, Math.min(89, S.alt + dy * dpp)); dirty = true;
      }
    }
  });
  const up = (e) => {
    const rect = cv.getBoundingClientRect();
    if (pointers.size === 1 && start && !start.moved && performance.now() - start.t < 500) {
      select(pick(e.clientX - rect.left, e.clientY - rect.top));
    }
    pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; start = null;
  };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); start = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); S.fov = Math.max(12, Math.min(110, S.fov * (e.deltaY > 0 ? 1.1 : 0.9))); dirty = true; }, { passive: false });
}

export const skyView = {
  id: 'sky', title: 'Sky', icon: icons.sky,
  mount(el, c, params) {
    ctx = c; mounted = true; ready = false; model = null; modelSec = -1;
    el.classList.add('edge');
    el.innerHTML = `<div class="sky-wrap">
      <canvas id="sky-cv"></canvas>
      <div class="sky-top">
        <div class="seg"><button data-mode="live">Live</button><button data-mode="free">Drag</button></div>
        <div class="sky-btns"><button class="chip" data-a="find">Find</button><button class="chip" data-a="layers">Layers</button></div>
      </div>
      <div id="sky-hud" class="sky-hud"></div>
      <div id="sky-note" class="sky-note hidden"></div>
      <button class="chip stop hidden" data-a="stopguide">Stop guiding</button>
      <div class="sky-zoom"><button class="chip" data-a="zin">＋</button><button class="chip" data-a="zout">－</button></div>
      <div id="sky-info" class="sky-info hidden"></div>
      <div class="sky-time"><button data-a="t" data-d="-24">−1d</button><button data-a="t" data-d="-1">−1h</button><button id="sky-time" data-a="t" data-d="now">Now</button><button data-a="t" data-d="1">+1h</button><button data-a="t" data-d="24">+1d</button></div>
    </div>`;
    root = el.querySelector('.sky-wrap'); cv = root.querySelector('#sky-cv'); g = cv.getContext('2d');
    root.addEventListener('click', onClick);
    bindPointer();
    window.addEventListener('resize', resize);
    orient = createOrientation({ smoothing: 0.3, getCorrection: () => currentDeclination(ctx.location()) + store.get('azOffset') });
    const hasSensors = 'DeviceOrientationEvent' in window && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
    if (params && params.mode) S.mode = params.mode; else if (!hasSensors) S.mode = 'free';
    if (params && params.target) { S.target = params.target; }
    if (S.mode === 'live') startLive();
    resize(); updateButtons();
    if (S.layers.sats && ctx.sats.group.status === 'idle') loadGroup(ctx);
    loadSkyData().then(() => { if (!mounted) return; ready = true; updateModel(true); if (S.target) { const t = vecOf(S.target); if (t && S.mode === 'free') { const p = M.vecToAzAlt(t.vec); S.az = p.az; S.alt = p.alt; } } dirty = true; })
      .catch((e) => { root.querySelector('#sky-note').textContent = 'Couldn’t load star data: ' + e.message; root.querySelector('#sky-note').classList.remove('hidden'); });
    this._off = ctx.bus.on('sats', () => { if (ready) { updateModel(true); dirty = true; } });
    this._off2 = ctx.bus.on('iss', () => { if (ready) { updateModel(true); dirty = true; } });
    raf = requestAnimationFrame(frame);
  },
  tick() { /* animates itself */ },
  unmount() {
    mounted = false; cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    if (orient) orient.stop(); orient = null;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
    if (this._off) this._off(); if (this._off2) this._off2();
    if (root && root.parentElement) root.parentElement.classList.remove('edge');
    root = null; cv = null; g = null; pointers.clear();
  },
};
