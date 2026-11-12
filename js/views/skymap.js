// views/skymap.js — live sky map: hold your phone up and see what's there (works day or night).
//   Live mode  : the map follows the phone's sensors, like a window onto the sky.
//   Drag mode  : swipe to look around (also how you preview the sky from the couch).
// Layers: stars, constellations, planets, Sun, Moon, satellites, deep-sky objects.  Tap anything to identify it.

import * as M from '../skymath.js';
import * as sky from '../sky.js';
import { loadSkyData, skyData, updateSkyPositions, vecAt } from '../skydata.js';
import { createOrientation } from '../compass.js';
import { compassCorrection, nudgeOffset, isCalibrated } from '../calibration.js';
import { store } from '../store.js';
import { isNativeApp } from '../platform.js';
import { icons, esc, toast, legendHTML } from '../ui.js';
import { loadGroup, overheadNow } from '../satellites.js';
import { fmtTime, fmtDayInline } from '../time.js';
import { col, mix } from '../colors.js';
import { loadComets, interestingComets, cometAt } from '../comets.js';
import { loadPlanes, planeLook, kmToMi, ktToMph, altColor, altLegend } from '../planes.js';
import { routeOf, routeLine } from '../routes.js';
import { routeHTML } from './planes.js';
import { rankCandidates, confidence } from '../identify.js';
import { planeAhead, spotLook, satTrack, strokeAhead, strokeTrail, drawMarks } from '../paths.js';
import { getLog, addToLog, removeFromLog, explain } from '../ufo.js';

const A = () => globalThis.Astronomy;
const RAD = Math.PI / 180, DEG = 180 / Math.PI;

// State that survives leaving and coming back to the screen.
const S = {
  mode: 'live', fov: 60, az: 180, alt: 35, offsetMs: 0, target: null, sel: null,
  layers: { stars: true, names: true, lines: true, conNames: true, planets: true, sats: true, planes: true, dso: true, grid: false, ground: true },
};
try { Object.assign(S.layers, store.getCache('skyLayers') || {}); } catch (e) { /* ignore */ }

const LAYER_LABELS = [
  ['stars', 'Stars'], ['names', 'Star names'], ['lines', 'Constellation lines'], ['conNames', 'Constellation names'],
  ['planets', 'Sun, Moon & planets'], ['sats', 'Satellites (ISS, Tiangong, Hubble…)'], ['planes', 'Planes (live, near you)'], ['dso', 'Clusters & nebulae'],
  ['grid', 'Altitude / direction grid'], ['ground', 'Shade below the horizon'],
];

let ctx, root, cv, g, W = 0, H = 0, dpr = 1, raf = 0, dirty = true, orient = null, mounted = false;
// "What's this?" aiming view (S.camMode). By day it shows the camera; at night (S.scope) the camera sees
// nothing, so it shows the live sky map with a crosshair instead.
let video = null, stream = null, camErr = '', camCircleDeg = 10, camP = null, scanning = 0;
// Full screen: the app's top bar and tabs are hidden and the map's own controls fade until you touch the screen.
let fadeTimer = 0, autoFull = false, turnTimer = 0;
// Is the phone held sideways? Worked out from the screen's own shape (some phones don't answer the CSS
// "orientation / pointer" questions reliably inside an app). Desktop browser windows don't count.
const sideways = () => innerWidth > innerHeight && (isNativeApp() || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches));
function showControls() {
  if (!root) return;
  root.classList.remove('ctl-fade'); clearTimeout(fadeTimer);
  if (S.full) fadeTimer = setTimeout(() => { if (root && S.full && !S.camMode) root.classList.add('ctl-fade'); }, ctx.config.sky.fullFadeMs);
}
function setFull(on, auto = false) {
  S.full = on; autoFull = on && auto;
  document.body.classList.toggle('sky-full', on);
  updateButtons(); showControls();
  setTimeout(() => { if (root) resize(); }, 60);                // the map just got bigger (or smaller)
}
/** Turning the phone sideways goes full screen; turning it back upright leaves it (if that's how you got in). */
function onTurn() {
  if (!root) return;
  const side = sideways();
  if (side && !S.full) setFull(true, true);
  else if (!side && S.full && autoFull) setFull(false);
  else resize();
}
// The screen reports its new shape a moment after the turn, so check now and again shortly after.
function onShape() { onTurn(); clearTimeout(turnTimer); turnTimer = setTimeout(onTurn, 350); }
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
  for (const it of interestingComets(ctx)) {
    const st = cometAt(it.c, date);
    const cid = 'comet:' + it.c.id;
    if (st.mag > ctx.config.comets.mapMag && S.target !== cid && !(S.sel && S.sel.id === cid)) continue;
    const p = sky.fixedPosition(st.ra, st.dec, date, obs);
    // tail direction: a point a little further from the Sun along the comet's own radius
    const k = 0.04 / st.r, tq = [st.geo[0] + st.helioEqj[0] * k, st.geo[1] + st.helioEqj[1] * k, st.geo[2] + st.helioEqj[2] * k];
    const tr = Math.hypot(...tq), tp = sky.fixedPosition(((Math.atan2(tq[1], tq[0]) * DEG) + 360) % 360, Math.asin(tq[2] / tr) * DEG, date, obs);
    add({ id: cid, kind: 'comet', label: it.c.id, vec: M.azAltToVec(p.az, p.alt), tail: M.azAltToVec(tp.az, tp.alt), az: p.az, alt: p.alt, mag: st.mag, comet: it.c, st });
  }
  const dark = sun.alt < -4, pc = ctx.config.paths;
  const picked = (id) => (S.sel && S.sel.id === id) || S.target === id;
  const sats = [];
  if (S.layers.sats) {
    for (const s of overheadNow(ctx, l, date, ctx.config.sats.overheadMinEl)) {
      const o = { id: 'sat:' + s.id, kind: 'sat', label: s.name, vec: M.azAltToVec(s.az, s.el), az: s.az, alt: s.el, rangeKm: s.rangeKm, sunlit: s.sunlit, seen: s.sunlit && dark,
        star: ctx.config.sats.highlight.includes(s.id) };
      // path: only for satellites worth following (visible now, the ISS, or the one you picked) — not the whole swarm
      if (o.seen || o.star || picked(o.id)) {
        const tr = satTrack(s.satrec, l, date, -pc.satTrailMin, pc.satAheadMin, pc.stepSec).filter(t => t.el > -2);
        const V = (t) => ({ vec: M.azAltToVec(t.az, t.el), mark: t.mark });
        o.behind = tr.filter(t => t.min < 0).map(V); o.ahead = tr.filter(t => t.min > 0).map(V);
      }
      add(o); sats.push(o);
    }
  }
  if (S.layers.planes && S.offsetMs === 0 && ctx.planes && ctx.planes.list.length) {
    for (const pl of ctx.planes.list) {
      const lk = planeLook(pl, l, date.getTime());
      if (lk.el < ctx.config.planes.minEl) continue;
      const ahead = planeLook(pl, l, date.getTime() + 20000);
      const id = 'plane:' + pl.id, V = (t) => { const k = spotLook(t.lat, t.lon, t.altFt ?? lk.altFt, l); return k.el > -1 ? { vec: M.azAltToVec(k.az, k.el), mark: t.mark || 0 } : null; };
      add({ id, kind: 'plane', label: pl.call, vec: M.azAltToVec(lk.az, lk.el), next: M.azAltToVec(ahead.az, ahead.el), az: lk.az, alt: lk.el, plane: pl, look: lk,
        behind: ((ctx.planes.trails || {})[pl.id] || []).map(V).filter(Boolean),
        ahead: pl.gsKt < 40 ? [] : planeAhead(pl, l, date.getTime(), picked(id) ? pc.planeAheadSelMin : pc.planeAheadMin, pc.stepSec).slice(1).map(V).filter(Boolean) });
    }
  }
  // passNow = a highlighted satellite (the ISS) that is up AND visible to the eye right now
  model = { date, obs, sunAlt: sun.alt, objs, sats, passNow: sats.find(o => o.star && o.seen) || null };
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
  const aiming = S.camMode, cam = aiming && !S.scope;
  let P;
  if (cam) {
    // camera lens = straight-line (gnomonic) projection; camFov is the angle across the video's long side
    const vw = (video && video.videoWidth) || W, vh = (video && video.videoHeight) || H;
    const f = (Math.max(vw, vh) / 2) / Math.tan(S.camFov * RAD / 2) * Math.max(W / vw, H / vh);
    camCircleDeg = Math.atan(Math.min(W, H) * 0.15 / f) * DEG;
    P = (v) => { const sz = M.dot(v, view.fwd); if (sz < 0.08) return null; return [cx + f * M.dot(v, view.right) / sz, cy - f * M.dot(v, view.up) / sz, sz]; };
  } else {
    P = (v) => { const p = M.project(v, view, scale); return p ? [cx + p[0], cy + p[1], p[2]] : null; };
    if (aiming) { camCircleDeg = Math.min(W, H) * 0.15 / scale * DEG; camP = P; }
  }
  const onScr = (p, m = 30) => p && p[0] > -m && p[0] < W + m && p[1] > -m && p[1] < H + m;
  hits = [];
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  // background: night blue -> day blue by Sun altitude
  const dayT = Math.max(0, Math.min(1, (model.sunAlt + 12) / 12));
  if (cam) {
    // Camera mode shows NOTHING but the live picture and the circle — the app only reveals what it is when asked.
    g.clearRect(0, 0, W, H); if (!video) { g.fillStyle = '#000'; g.fillRect(0, 0, W, H); }
    camP = P;
    const Rc = Math.min(W, H) * 0.15;
    g.strokeStyle = col('#62f0a5'); g.lineWidth = 2; g.shadowColor = '#000'; g.shadowBlur = 6;
    g.beginPath(); g.arc(cx, cy, Rc, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + dx * (Rc - 10), cy + dy * (Rc - 10)); g.lineTo(cx + dx * (Rc + 14), cy + dy * (Rc + 14)); }
    g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke(); g.shadowBlur = 0;
    if (scanning) {                                   // "scanning…" sweep while the app thinks
      const t = (performance.now() - scanning) / 1000, a = t * 7;
      g.strokeStyle = col('#62f0a5'); g.lineWidth = 4; g.globalAlpha = 0.9;
      g.beginPath(); g.arc(cx, cy, Rc + 7, a, a + 1.2); g.stroke();
      g.globalAlpha = 0.25 + 0.2 * Math.sin(t * 12); g.fillStyle = col('#62f0a5'); g.beginPath(); g.arc(cx, cy, Rc, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
    }
    const hint = root.querySelector('#cam-hint');
    const ht = camErr || noData || (scanning ? 'Scanning the sky…' : 'Put the mystery light in the circle');
    if (hint.textContent !== ht) hint.textContent = ht;
    return;
  }
  else { g.fillStyle = col(mix('#02040a', '#2d5a8c', dayT)); g.fillRect(0, 0, W, H); }
  const starA = cam ? 1 : 1 - 0.5 * dayT;

  // ground shading (inverse stereographic per low-res pixel)
  if (!cam && L.ground && gg) {
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
  if (!cam && L.grid) {
    g.strokeStyle = col('#2a4468'); g.lineWidth = 1; g.globalAlpha = 0.7;
    const poly = (fn, n) => { g.beginPath(); let pen = false; for (let i = 0; i <= n; i++) { const p = P(fn(i / n)); if (!p) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } g.stroke(); };
    for (const alt of [15, 30, 45, 60, 75]) poly(t => M.azAltToVec(t * 360, alt), 120);
    for (let az = 0; az < 360; az += 30) poly(t => M.azAltToVec(az, -5 + t * 95), 40);
    g.globalAlpha = 1;
  }

  // constellation lines
  if (L.lines && D) {
    g.strokeStyle = col(cam ? '#9cc4ff' : '#3f6aa6'); g.lineWidth = 1; g.globalAlpha = cam ? 0.3 : 0.6 * starA + 0.15; g.beginPath();
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
  if (!cam && L.dso && D) {
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
      const m = D.mag[i];
      if (cam && m > 2.6) { starScr[i * 2] = NaN; continue; }   // camera mode: only label the stars you can actually pick out
      starScr[i * 2] = p[0]; starScr[i * 2 + 1] = p[1];
      if (cam) {
        g.strokeStyle = col('#cfe0ff'); g.globalAlpha = 0.7; g.lineWidth = 1; g.beginPath(); g.arc(p[0], p[1], 6, 0, 2 * Math.PI); g.stroke();
        if (D.raw.names[i]) { g.fillStyle = col('#e6eeff'); g.fillText(D.raw.names[i], p[0] + 9, p[1] + 4); }
        g.globalAlpha = 1; continue;
      }
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
  if (!cam && L.conNames && D && S.fov <= 110) {
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
      if (o.kind === 'comet') {
        const p = P(o.vec), pt = P(o.tail);
        if (!onScr(p, 40)) continue;
        if (pt) {
          let dx = pt[0] - p[0], dy = pt[1] - p[1]; const n = Math.hypot(dx, dy) || 1; dx /= n; dy /= n;
          const len = Math.max(14, 46 - o.mag * 3.2) * Math.min(1.8, 60 / S.fov);
          const tg = g.createLinearGradient(p[0], p[1], p[0] + dx * len, p[1] + dy * len);
          tg.addColorStop(0, col('#bff6ea')); tg.addColorStop(1, 'rgba(160,240,225,0)');
          g.strokeStyle = tg; g.lineWidth = 3.2; g.beginPath(); g.moveTo(p[0], p[1]); g.lineTo(p[0] + dx * len, p[1] + dy * len); g.stroke();
        }
        g.fillStyle = col('#d8fff6'); g.beginPath(); g.arc(p[0], p[1], 3, 0, 2 * Math.PI); g.fill();
        g.font = '600 11px system-ui'; g.fillStyle = col('#a6f0e0'); g.fillText('Comet ' + o.label, p[0] + 10, p[1] + 14);
        hits.push({ x: p[0], y: p[1], id: o.id, label: o.label, pri: 11 });
        continue;
      }
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

  // where it's going (dotted, with minute marks) and where it's been (faded) — see paths.js
  const pathOf = (o, colr) => {
    const here = P(o.vec), isSel = (S.sel && S.sel.id === o.id) || S.target === o.id, far = (p) => (p && onScr(p, 200) ? p : null);
    if (o.behind && o.behind.length) strokeTrail(g, [...o.behind.map(t => far(P(t.vec))), here], colr);
    if (!o.ahead || !o.ahead.length) return;
    const xy = o.ahead.map(t => far(P(t.vec)));
    strokeAhead(g, [here, ...xy], isSel ? '#ffffff' : colr, isSel ? 0.95 : 0.7);
    drawMarks(g, o.ahead.map((t, i) => t.mark && xy[i] && { x: xy[i][0], y: xy[i][1], min: t.mark }).filter(Boolean), '#ffffff', { labels: isSel || o.star, gap: ctx.config.paths.labelGapPx });
  };

  // planes (coloured by altitude; the key shows while any are on screen)
  let anyPlane = false;
  if (L.planes) {
    const blink = Math.floor(performance.now() / 600) % 2;
    for (const o of model.objs.values()) {
      if (o.kind !== 'plane') continue;
      const p = P(o.vec); if (!onScr(p, 30)) continue;
      pathOf(o, altColor(o.look.altFt));
      const q = P(o.next); const ang = q ? Math.atan2(q[1] - p[1], q[0] - p[0]) : 0;
      anyPlane = true;
      g.save(); g.translate(p[0], p[1]); g.rotate(ang);
      g.fillStyle = col(altColor(o.look.altFt));
      g.beginPath(); g.moveTo(9, 0); g.lineTo(-6, -2); g.lineTo(-7, 0); g.lineTo(-6, 2); g.closePath(); g.fill();      // fuselage
      g.beginPath(); g.moveTo(2, 0); g.lineTo(-3, -8); g.lineTo(-5, -8); g.lineTo(-2, 0); g.lineTo(-5, 8); g.lineTo(-3, 8); g.closePath(); g.fill();  // wings
      g.fillStyle = col(blink ? '#ff4d4d' : '#3a1010'); g.fillRect(-4.5, -9, 2.2, 2.2);
      g.fillStyle = col(blink ? '#4dff88' : '#0f3a1d'); g.fillRect(-4.5, 7, 2.2, 2.2);
      g.restore();
      if (S.fov < 85 || o.look.rangeKm < 40) {
        g.font = '10px system-ui'; g.fillStyle = col('#cdd6e6');
        g.fillText(`${o.label} · ${Math.round(o.look.altFt / 100) * 100 >= 1000 ? (Math.round(o.look.altFt / 100) * 100).toLocaleString() : Math.round(o.look.altFt)} ft`, p[0] + 11, p[1] - 6);
      }
      hits.push({ x: p[0], y: p[1], id: o.id, label: o.label, pri: 9 });
    }
  }

  // satellites
  if (L.sats) {
    g.font = '10px system-ui';
    for (const o of model.sats) {
      const p = P(o.vec);
      if (!onScr(p, 30)) continue;
      const c = o.seen ? '#5cc8ff' : '#6b7c96';
      pathOf(o, c);
      const r = o.star ? 10 : 6;                       // highlighted satellites (the ISS) stand out from the rest
      g.strokeStyle = col(c); g.fillStyle = col(c); g.lineWidth = o.seen ? 2 : o.star ? 1.8 : 1.2;
      if (o.star && o.seen) { g.globalAlpha = 0.22; g.beginPath(); g.arc(p[0], p[1], 19, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1; }
      g.beginPath(); g.moveTo(p[0], p[1] - r); g.lineTo(p[0] + r, p[1]); g.lineTo(p[0], p[1] + r); g.lineTo(p[0] - r, p[1]); g.closePath();
      o.seen ? g.fill() : g.stroke();
      g.font = o.star ? '700 14px system-ui' : '10px system-ui';
      g.fillText(o.label + (o.seen ? '' : o.sunlit ? '' : ' (shadow)'), p[0] + (o.star ? 20 : r + 3), p[1] + (o.star ? 5 : 4));
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
  // arrow near the screen edge pointing toward something that is off-screen, with how far to turn
  const edgeArrow = (vec, label, colr) => {
    const sx = M.dot(vec, view.right), sy = M.dot(vec, view.up);
    const ang = Math.atan2(sy, sx), rad = Math.min(W, H) / 2 - 40;
    const ax = cx + Math.cos(ang) * rad, ay = cy - Math.sin(ang) * rad;
    const dist = Math.round(M.angleBetween(vec, view.fwd));
    g.save(); g.translate(ax, ay); g.rotate(-ang);
    g.fillStyle = col(colr); g.beginPath(); g.moveTo(20, 0); g.lineTo(-10, -13); g.lineTo(-4, 0); g.lineTo(-10, 13); g.closePath(); g.fill();
    g.restore();
    g.font = '600 12px system-ui'; g.fillStyle = col(colr); g.textAlign = 'center';
    g.fillText(`${label} · ${dist}°`, Math.max(60, Math.min(W - 60, ax)), ay + (ay > cy ? -22 : 30)); g.textAlign = 'start';
  };
  // a pass is happening: point at it whenever it is off-screen (no need to pick it under Find first)
  const pass = cam ? null : model.passNow;
  if (pass && S.target !== pass.id && !onScr(P(pass.vec), -10)) edgeArrow(pass.vec, pass.label, '#5cc8ff');
  if (S.sel) ring(S.sel.id, '#ffffff');
  if (S.target) {
    const r = ring(S.target, '#62f0a5');
    if (r && !r.on) edgeArrow(r.t.vec, r.t.label, '#62f0a5');
    else if (r && r.on && M.angleBetween(r.t.vec, view.fwd) < 1.5 && S.mode === 'live') {
      toast(`${r.t.label} is right there`); S.target = null; updateButtons();
    }
  }

  // crosshair: whatever is inside the circle is what you're asking about
  if (aiming) {
    const Rc = Math.min(W, H) * 0.15;
    g.strokeStyle = col('#62f0a5'); g.lineWidth = 2; g.shadowColor = '#000'; g.shadowBlur = 6;
    g.beginPath(); g.arc(cx, cy, Rc, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { g.moveTo(cx + dx * (Rc - 10), cy + dy * (Rc - 10)); g.lineTo(cx + dx * (Rc + 14), cy + dy * (Rc + 14)); }
    g.moveTo(cx - 6, cy); g.lineTo(cx + 6, cy); g.moveTo(cx, cy - 6); g.lineTo(cx, cy + 6); g.stroke(); g.shadowBlur = 0;
  }
  if (aiming) {
    if (scanning) {
      const Rc = Math.min(W, H) * 0.15, a = (performance.now() - scanning) / 1000 * 7;
      g.strokeStyle = col('#62f0a5'); g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, Rc + 7, a, a + 1.2); g.stroke();
    }
    const hint = root.querySelector('#cam-hint');
    const ht = noData || (scanning ? 'Scanning the sky…' : 'Night view — put the light in the circle');
    if (hint.textContent !== ht) hint.textContent = ht;
  }
  // centre reticle (live only) and HUD
  if (S.mode === 'live' && !aiming) {
    g.strokeStyle = col('#ffffff'); g.globalAlpha = 0.35; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy); g.moveTo(cx, cy - 10); g.lineTo(cx, cy + 10); g.stroke(); g.globalAlpha = 1;
  }
  const c = M.vecToAzAlt(view.fwd);
  const hud = root.querySelector('#sky-hud');
  const txt = `${sky.dirName(c.az)} ${Math.round(c.az)}° · ${Math.round(c.alt)}° up · ${Math.round(S.fov)}° view${S.mode === 'live' && isCalibrated() ? ' · calibrated ✓' : ''}`;
  if (hud.dataset.t !== txt) { hud.textContent = txt; hud.dataset.t = txt; }
  const note = root.querySelector('#sky-note');
  const nt = noData || (dayT > 0.6 ? 'Daytime — stars are drawn for reference; you can’t see them now' : '');
  if (note.dataset.t !== nt) { note.textContent = nt; note.dataset.t = nt; note.classList.toggle('hidden', !nt); }
  const pb = root.querySelector('#sky-pass');
  const pt = pass ? `${pass.label} pass ${S.offsetMs === 0 ? 'now' : 'at this time'} · ${sky.dirName(pass.az)}, ${Math.round(pass.alt)}° up` : '';
  if (pb.dataset.t !== pt) { pb.textContent = pt; pb.dataset.t = pt; pb.classList.toggle('hidden', !pt); }
  const lg = root.querySelector('#sky-legend');
  if (lg.classList.contains('hidden') === anyPlane) lg.classList.toggle('hidden', !anyPlane);
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
  if (S.mode === 'live' || S.camMode || dirty) { draw(); dirty = false; }
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
  let title = t.label, sub = '', extra = '';
  const rs = (name) => { const r = sky.riseSet(name, date, obs); if (r.rise) rows.push(['Rises', `${fmtDayInline(r.rise)} ${fmtTime(r.rise)}`]); if (r.set) rows.push(['Sets', `${fmtDayInline(r.set)} ${fmtTime(r.set)}`]); };
  if (id === 'sun') { sub = 'Our star — never look at it directly or through optics'; rs('Sun'); }
  else if (id === 'moon') { const m = sky.moonInfo(date, obs); sub = `${m.name} · ${Math.round(m.fraction * 100)}% lit`; rs('Moon'); if (m.nextFull) rows.push(['Next full', fmtDayInline(m.nextFull)]); }
  else if (id.startsWith('planet:')) { const p = sky.planetInfo(id.slice(7), date, obs); sub = `Planet · magnitude ${p.mag.toFixed(1)} · ${Math.round(p.elong)}° from the Sun`; rs(id.slice(7)); }
  else if (id.startsWith('sat:')) { const o = model.objs.get(id); sub = o ? `Satellite · ${Math.round(o.rangeKm)} km away · ${o.seen ? 'sunlit — visible to the eye' : o.sunlit ? 'sunlit, but the sky is too bright' : 'in Earth’s shadow — can’t be seen'}` : 'Satellite'; }
  else if (id.startsWith('plane:')) {
    const o = model.objs.get(id);
    if (o) { const p = o.plane, lk = o.look; title = p.call; sub = `${p.desc || p.type || 'Aircraft'}${p.ownOp ? ' · ' + p.ownOp : ''}`;
      rows.push(['Altitude', `${Math.round(lk.altFt).toLocaleString()} ft${p.vrate > 300 ? ' · climbing' : p.vrate < -300 ? ' · descending' : ''}`]);
      rows.push(['Speed', `${Math.round(ktToMph(p.gsKt))} mph heading ${sky.dirName(p.track)}`]);
      rows.push(['Distance', `${Math.round(kmToMi(lk.rangeKm))} miles away`]);
      if (p.reg) rows.push(['Registration', p.reg]);
      extra = routeHTML(ctx, p); }
  }
  else if (id.startsWith('comet:')) { const o = model.objs.get(id); if (o) { title = o.comet.name; sub = `Comet · about magnitude ${o.mag.toFixed(1)} (${o.mag <= 6 ? 'naked eye' : o.mag <= 9 ? 'binoculars' : 'telescope'}) · ${o.st.delta.toFixed(2)} AU away`; rows.push(['Brightness', 'a rough guess — comets surprise']); } }
  else if (id.startsWith('star:')) { const i = +id.slice(5), D = skyData(); sub = `Star · magnitude ${D.mag[i].toFixed(1)}`; if (!D.raw.names[i]) title = 'Unnamed star'; }
  else if (id.startsWith('dso:')) { const d = skyData().raw.dso[+id.slice(4)]; const kinds = { oc: 'Open cluster', gc: 'Globular cluster', g: 'Galaxy', gn: 'Nebula', pn: 'Planetary nebula', en: 'Nebula', sn: 'Supernova remnant' }; title = d[5] || d[4]; sub = `${kinds[d[3]] || 'Deep-sky object'} · ${d[4]} · mag ${d[2]}`; }
  return { title, sub, pos, rows, extra };
}

function showInfo() {
  const box = root.querySelector('#sky-info');
  if (!S.sel) { box.classList.add('hidden'); return; }
  const d = describe(S.sel.id);
  if (!d) { box.classList.add('hidden'); return; }
  const dir = `${sky.dirName(d.pos.az)} ${Math.round(d.pos.az)}° · ${d.pos.alt >= 0 ? Math.round(d.pos.alt) + '° up' : 'below horizon (' + Math.round(-d.pos.alt) + '° down)'}`;
  const pointable = !S.sel.id.startsWith('dso:');
  box.innerHTML = `<div class="si-head"><div><div class="big">${esc(d.title)}</div><div class="sub">${esc(d.sub)}</div></div><button class="x" data-back data-a="close" aria-label="Close">✕</button></div>
    <div class="si-dir">${dir}</div>
    ${d.rows.map(r => `<div class="si-row"><span>${r[0]}</span><b>${esc(r[1])}</b></div>`).join('')}${d.extra}
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
    if (k === 'planes' && e.target.checked) { loadPlanes(ctx, { force: true }); }
    updateModel(true); dirty = true;
  };
}

function openFind() {
  const date = model.date;
  const rows = [];
  for (const o of model.objs.values()) {
    if (o.kind === 'sat' && !['iss', 'css', 'hst'].some(k => o.id === 'sat:' + k)) continue;
    rows.push({ id: o.id, label: o.kind === 'comet' ? 'Comet ' + o.label : o.kind === 'plane' ? `${o.label} · ${Math.round(kmToMi(o.look.rangeKm))} mi` : o.label, az: o.az, alt: o.alt, range: o.look ? o.look.rangeKm : 0, group: o.kind === 'sat' ? 'Satellites' : o.kind === 'comet' ? 'Comets' : o.kind === 'plane' ? 'Planes' : 'Solar system' });
  }
  const D = skyData();
  const stars = [];
  Object.keys(D.raw.names).forEach(k => { const i = +k; if (D.mag[i] < 2.6) { const p = M.vecToAzAlt(vecAt(i)); stars.push({ id: 'star:' + i, label: D.raw.names[i], az: p.az, alt: p.alt, mag: D.mag[i], group: 'Bright stars' }); } });
  stars.sort((a, b) => a.mag - b.mag);
  const line = (r) => `<button class="srow find" data-id="${r.id}"><span>${esc(r.label)}</span><span class="${r.alt > 0 ? 'good' : 'muted'}">${r.alt > 0 ? sky.dirName(r.az) + ' · ' + Math.round(r.alt) + '° up' : 'below horizon'}</span></button>`;
  const sec = (name, list) => list.length ? `<div class="eyebrow" style="margin:14px 0 6px">${name}</div><div class="card">${list.map(line).join('')}</div>` : '';
  openSheet(`<div class="sheet-head"><h2>Find something</h2><button class="btn ghost small" data-close>Cancel</button></div>
    ${sec('Solar system', rows.filter(r => r.group === 'Solar system'))}${sec('Comets', rows.filter(r => r.group === 'Comets'))}${sec('Planes overhead', rows.filter(r => r.group === 'Planes').sort((a, b) => a.range - b.range).slice(0, 15))}${sec('Satellites', rows.filter(r => r.group === 'Satellites'))}${sec('Bright stars', stars)}`,
  (e, close) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    close(); S.target = null; select({ id: b.dataset.id, label: '' }); guide(b.dataset.id);
  });
  void date;
}

// ---------- "What's that light?" ----------

const candidatesAt = (fwd) => rankCandidates(ctx, model, fwd);

function candLine(c) {
  if (c.kind === 'plane') return `${c.label}${(() => { const e = routeOf(ctx, c.plane, { fetch: false }); return e.status === 'ok' ? ' · ' + routeLine(e) : ''; })()}${c.plane.type ? ' (' + c.plane.type + ')' : ''} · ${Math.round(c.look.altFt).toLocaleString()} ft · ${Math.round(kmToMi(c.look.rangeKm))} mi away`;
  if (c.mag != null) return `${c.label} · magnitude ${c.mag.toFixed(1)}`;
  return c.label;
}

async function enterCam() {
  S.camMode = true; S.mode = 'live'; S.sel = null; showInfo();
  S.camFov = +(store.getCache('camFov') || 66);
  // at night the camera only shows black: use the live sky map with a crosshair instead
  S.scope = sky.sunAltitude(new Date(), sky.makeObserver(loc())) < ctx.config.identify.nightSunAlt;
  root.classList.add('cam'); root.classList.toggle('scope', S.scope); document.body.classList.add('cam-on'); updateButtons(); startLive(); camErr = '';
  if (S.scope) { dirty = true; return; }
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('not supported here');
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
    if (!S.camMode) { stream.getTracks().forEach(t => t.stop()); stream = null; return; }
    video = document.createElement('video');
    video.playsInline = true; video.muted = true; video.autoplay = true; video.className = 'sky-video'; video.srcObject = stream;
    root.insertBefore(video, cv);
    await video.play().catch(() => {});
  } catch (e) { camErr = `Camera unavailable (${e.message}) — showing labels only`; }
  dirty = true;
}

function exitCam() {
  S.camMode = false; S.scope = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; if (video) video.remove(); video = null;
  if (root) root.classList.remove('cam', 'scope');
  document.body.classList.remove('cam-on');
  dirty = true;
}

function capturePhoto(mark = null) {
  try {
    const w = 360, h = Math.round(w * H / W), c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    if (video && video.videoWidth) {
      const s = Math.max(W / video.videoWidth, H / video.videoHeight), sw = W / s, sh = H / s;
      x.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, w, h);
    } else { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); }
    x.drawImage(cv, 0, 0, w, h);
    if (mark && camP) {
      const p = camP(mark.vec);
      if (p) {
        const k = w / W, px = p[0] * k, py = p[1] * k;
        x.strokeStyle = '#ffd84a'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 16, 0, 2 * Math.PI); x.stroke();
        x.font = '700 15px system-ui'; x.lineWidth = 4; x.strokeStyle = '#000a'; x.strokeText(mark.label, px + 21, py + 5);
        x.fillStyle = '#ffd84a'; x.fillText(mark.label, px + 21, py + 5);
      }
    }
    return c.toDataURL('image/jpeg', 0.62);
  } catch (e) { return null; }
}

function openUfo(photo = null, fwdIn = null) {
  if (!lastView || !model) return;
  const fwd = fwdIn || lastView.fwd, pos = M.vecToAzAlt(fwd);
  const list = candidatesAt(fwd), best = list[0], conf = confidence(ctx, best);
  const R = ctx.config.identify.radiusDeg;
  const alignable = best && ['planet', 'moon', 'star'].includes(best.kind);
  const where = `${sky.dirName(pos.az)} ${Math.round(pos.az)}° · ${Math.round(pos.alt)}° up`;
  const planesNote = ctx.planes && ctx.planes.status === 'ready' ? '' : '<p class="tip">Plane data isn’t loaded, so aircraft weren’t checked.</p>';
  const nLog = getLog().length;
  const why = (c) => c.passNow ? 'Passing over right now · ' : c.moving ? 'Moving · ' : '';
  const off = (c) => c.d < 3 ? 'Right where you’re pointing.' : `${Math.round(c.d)}° from where the phone is aimed${c.d > ctx.config.identify.sureDeg ? ' — within normal compass error' : ''}.`;
  const body = best ? `<div class="card ufo-best"><div class="eyebrow">${{ sure: 'UpSight says it’s…', probably: 'Most likely', nearest: 'Brightest thing near there' }[conf]}</div><div class="big">${esc(candLine(best))}</div>
      ${best.kind === 'plane' ? `<div id="ufo-route" data-plane="${esc(best.plane.id)}">${routeHTML(ctx, best.plane)}</div>` : ''}<div class="sub" style="margin-top:4px">${esc(explain(best))}</div><div class="sub" style="margin-top:4px">${why(best)}${off(best)}</div>
      <div class="actions"><button class="btn small" data-show="${esc(best.id)}">Show me</button></div></div>
    ${list.length > 1 ? `<h3 class="sect">Other possibilities</h3><div class="card">${list.slice(1, 6).map(c => `<button class="srow find" data-show="${esc(c.id)}"><span>${esc(candLine(c))}${c.moving ? ' <span class="muted">· moving</span>' : ''}</span><span class="muted">${Math.round(c.d)}°</span></button>`).join('')}</div>` : ''}`
    : `<div class="card ufo-best"><div class="eyebrow">Result</div><div class="big">🛸 Unidentified!</div>
      <div class="sub" style="margin-top:4px">Nothing UpSight knows about is within ${R}° of there — no planet, bright star, satellite${ctx.planes && ctx.planes.status === 'ready' ? ', plane' : ''} or launch. Could be a drone, a balloon, a plane without a transponder… or something else.</div></div>`;
  openSheet(`<div class="sheet-head"><h2>${{ sure: 'Identified!', probably: 'Probably…', nearest: 'Best guess', none: 'Hmm…' }[conf]}</h2><button class="btn ghost small" data-close>Close</button></div>
    ${photo ? `<img class="ufo-photo" src="${photo}" alt="">` : ''}
    <p class="sub" style="margin:4px 0 10px">Checked ${R}° around ${where}${S.mode === 'live' ? ', to allow for compass error' : ' (the centre of the map)'}. Ranked by brightness, movement and passes happening now.</p>
    ${body}${planesNote}
    ${alignable && S.camMode ? `<p class="tip">Is the light really ${esc(best.label)}? Then <button class="linkbtn" data-align="1">line the compass up with it</button> so every label sits right.</p>` : ''}
    <div class="actions" style="margin-top:12px"><button class="btn ${best ? 'ghost' : ''}" data-log="1">${best ? 'Not it — log as unidentified' : 'Log this sighting'}</button><button class="btn ghost" data-viewlog="1">UFO log (${nLog})</button></div>`,
  (e, close) => {
    const sh = e.target.closest('[data-show]');
    if (sh) {
      close(); const id = sh.dataset.show;
      if (S.camMode && !S.scope) return;                       // camera view: nothing to show on
      if (S.scope) { exitCam(); updateButtons(); }             // night view: drop back to the plain live map and guide there
      if (!id.startsWith('launch:')) { select({ id, label: '' }); if (S.target !== id) guide(id); }
      return;
    }
    if (e.target.closest('[data-align]')) {
      const tAz = M.vecToAzAlt(best.vec).az, d = ((tAz - pos.az + 540) % 360) - 180;
      close(); toast(nudgeOffset(ctx, d).message); return;
    }
    if (e.target.closest('[data-log]')) { openLogForm(pos, list, photo); return; }
    if (e.target.closest('[data-viewlog]')) { openLogList(); }
  });
}

function openLogForm(pos, list, photo = null) {
  const chips = (name, opts) => `<div class="chips" data-group="${name}">${opts.map(o => `<button class="chip-btn" data-v="${o}">${o}</button>`).join('')}</div>`;
  openSheet(`<div class="sheet-head"><h2>Log a sighting</h2><button class="btn ghost small" data-close>Cancel</button></div>
    <p class="sub" style="margin:4px 0 10px">${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} · ${sky.dirName(pos.az)} ${Math.round(pos.az)}°, ${Math.round(pos.alt)}° up · ${esc(ctx.location().name)}</p>
    <div class="card stack" style="gap:10px">
      <div><div class="eyebrow">How was it moving?</div>${chips('move', ['Still', 'Slow', 'Fast', 'Zig-zag', 'Hovered then shot off'])}</div>
      <div><div class="eyebrow">Colour</div>${chips('color', ['White', 'Orange', 'Red', 'Green', 'Blue', 'Changing'])}</div>
      <div><div class="eyebrow">Notes</div><textarea id="ufo-notes" rows="3" placeholder="Shape, how long you saw it, sounds…"></textarea></div>
    </div>
    <div class="actions" style="margin-top:12px"><button class="btn" data-save="1">Save to UFO log</button></div>`,
  (e, close) => {
    const c = e.target.closest('[data-v]');
    if (c) { c.parentElement.querySelectorAll('.chip-btn').forEach(x => x.classList.toggle('on', x === c)); return; }
    if (e.target.closest('[data-save]')) {
      const sheet = document.getElementById('sheet');
      const pick = (g) => { const b = sheet.querySelector(`[data-group="${g}"] .on`); return b ? b.dataset.v : ''; };
      const n = addToLog({ t: Date.now(), az: pos.az, alt: pos.alt, place: ctx.location().name, lat: ctx.location().lat, lon: ctx.location().lon,
        move: pick('move'), color: pick('color'), photo, notes: sheet.querySelector('#ufo-notes').value.trim(), nearby: list.slice(0, 3).map(candLine) });
      close(); toast(`Saved — ${n} in your UFO log`);
    }
  });
}

function openLogList() {
  const log = getLog();
  const text = (e) => `${new Date(e.t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })} — ${sky.dirName(e.az)} ${Math.round(e.az)}°, ${Math.round(e.alt)}° up from ${e.place}. ${[e.move, e.color].filter(Boolean).join(', ')}${e.notes ? '. ' + e.notes : ''}`;
  openSheet(`<div class="sheet-head"><h2>UFO log</h2><button class="btn ghost small" data-close>Done</button></div>
    ${log.length ? `<div class="card">${log.map(e => `<div class="mo"><span class="mo-t">${new Date(e.t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}<span class="sub">${fmtTime(new Date(e.t))}</span></span><span class="grow">${e.photo ? `<img class="ufo-thumb" src="${e.photo}" alt="">` : ''}<b>${sky.dirName(e.az)} · ${Math.round(e.alt)}° up</b><span class="sub">${esc([e.move, e.color].filter(Boolean).join(' · '))}</span>${e.notes ? `<span class="sub">${esc(e.notes)}</span>` : ''}${e.nearby && e.nearby.length ? `<span class="sub">Nearby: ${esc(e.nearby.join('; '))}</span>` : ''}</span><button class="x" data-del="${e.id}" aria-label="Delete">✕</button></div>`).join('')}</div>
      <div class="actions" style="margin-top:12px"><button class="btn ghost" data-share="1">Share / copy log</button></div>`
      : '<div class="card"><div class="muted">No sightings yet. Point at something odd and tap “What’s this?”.</div></div>'}`,
  (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { removeFromLog(+d.dataset.del); openLogList(); return; }
    if (e.target.closest('[data-share]')) {
      const all = 'UpSight UFO log\n\n' + log.map(text).join('\n');
      if (navigator.share) navigator.share({ title: 'UFO log', text: all }).catch(() => {});
      else if (navigator.clipboard) navigator.clipboard.writeText(all).then(() => toast('Copied to clipboard'));
    }
  });
}

// ---------- controls ----------
function updateButtons() {
  if (!root) return;
  root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === S.mode));
  const stop = root.querySelector('[data-a="stopguide"]'); if (stop) stop.classList.toggle('hidden', !S.target);
  const fb = root.querySelector('[data-a="full"]');
  if (fb) { fb.textContent = S.full ? '✕ Exit full screen' : '⛶'; fb.toggleAttribute('data-back', !!S.full); fb.setAttribute('aria-label', S.full ? 'Exit full screen' : 'Full screen'); }
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
    if (S.camMode) exitCam();
    S.mode = b.dataset.mode; if (S.mode === 'live') startLive(); updateButtons(); dirty = true; return;
  }
  switch (b.dataset.a) {
    case 'layers': openLayers(); break;
    case 'full': setFull(!S.full); break;
    case 'ufo': enterCam(); break;
    case 'camclose': exitCam(); break;
    case 'camcap': {
      if (scanning || !lastView) break;
      const fwd = lastView.fwd.slice(), best = candidatesAt(fwd)[0];
      const photo = capturePhoto(best);                // grab the moment you asked
      scanning = performance.now(); dirty = true;
      setTimeout(() => { scanning = 0; openUfo(photo, fwd); }, 1400);
      break;
    }
    case 'find': if (b.closest('#sky-info')) { guide(S.sel.id); } else openFind(); break;
    case 'close': S.sel = null; showInfo(); dirty = true; break;
    case 'point': ctx.go('point', { target: S.sel.id }); break;
    case 'passnow': { const o = model && model.passNow; if (o) { select({ id: o.id, label: o.label }); if (S.target !== o.id) guide(o.id); } break; }
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
      if (lastDist > 0) {
        if (S.camMode && !S.scope) { S.camFov = Math.max(30, Math.min(110, S.camFov * lastDist / d)); store.setCache('camFov', S.camFov); }
        else S.fov = Math.max(12, Math.min(110, S.fov * lastDist / d));
        dirty = true;
      }
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
        <div class="sky-btns"><button class="chip" data-a="find">Find</button><button class="chip" data-a="layers">Layers</button><button class="chip" data-a="full" aria-label="Full screen">⛶</button></div>
      </div>
      <div class="cam-ui">
        <div class="cam-top"><span class="chip" id="cam-hint">Put the light in the circle</span><button class="chip" data-back data-a="camclose" aria-label="Close camera">✕</button></div>
        <div class="cam-panel"><div class="sub" style="margin-bottom:8px">See something odd? Hold it in the circle and ask.</div><button class="btn cam-go" data-a="camcap">🔍 What’s this?</button></div>
      </div>

      <div id="sky-hud" class="sky-hud"></div>
      <div id="sky-note" class="sky-note hidden"></div>
      <button class="chip pass-now hidden" id="sky-pass" data-a="passnow"></button>
      <button class="chip stop hidden" data-a="stopguide">Stop guiding</button>
      <div class="sky-zoom"><button class="chip" data-a="zin">＋</button><button class="chip" data-a="zout">－</button></div>
      <div id="sky-info" class="sky-info hidden"></div>
      <div id="sky-legend" class="sky-legend hidden">${legendHTML(altLegend(), 'ft', col)}</div>
      <div class="sky-time"><button data-a="t" data-d="-24">−1d</button><button data-a="t" data-d="-1">−1h</button><button id="sky-time" data-a="t" data-d="now">Now</button><button data-a="t" data-d="1">+1h</button><button data-a="t" data-d="24">+1d</button></div>
    </div>`;
    root = el.querySelector('.sky-wrap'); cv = root.querySelector('#sky-cv'); g = cv.getContext('2d');
    root.addEventListener('click', onClick);
    root.addEventListener('pointerdown', showControls, true);
    this._offR = ctx.bus.on('routes', () => { showInfo(); const u = document.getElementById('ufo-route'); const pl = u && ctx.planes && ctx.planes.list.find(x => x.id === u.dataset.plane); if (pl) u.innerHTML = routeHTML(ctx, pl); });
    S.full = false; setTimeout(onTurn, 0);
    bindPointer();
    window.addEventListener('resize', onShape); window.addEventListener('orientationchange', onShape);
    orient = createOrientation({ smoothing: 0.3, getCorrection: () => compassCorrection(ctx.location()) });
    const hasSensors = 'DeviceOrientationEvent' in window && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent));
    if (params && params.mode) S.mode = params.mode; else if (!hasSensors) S.mode = 'free';
    if (params && params.target) { S.target = params.target; }
    if (params && params.cam) setTimeout(() => { if (mounted) enterCam(); }, 0);
    if (S.mode === 'live') startLive();
    resize(); updateButtons();
    if (S.layers.sats && ctx.sats.group.status === 'idle') loadGroup(ctx);
    if (!ctx.comets || ctx.comets.status === 'idle') loadComets(ctx);
    const pollPlanes = () => { if (S.layers.planes && document.visibilityState === 'visible') loadPlanes(ctx); };
    pollPlanes(); this._planeTimer = setInterval(pollPlanes, ctx.config.planes.refreshSec * 1000);
    this._off4 = ctx.bus.on('planes', () => { if (ready) { updateModel(true); dirty = true; } });
    loadSkyData().then(() => { if (!mounted) return; ready = true; updateModel(true); if (S.target) { const t = vecOf(S.target); if (t && S.mode === 'free') { const p = M.vecToAzAlt(t.vec); S.az = p.az; S.alt = p.alt; } } dirty = true; })
      .catch((e) => { root.querySelector('#sky-note').textContent = 'Couldn’t load star data: ' + e.message; root.querySelector('#sky-note').classList.remove('hidden'); });
    this._off = ctx.bus.on('sats', () => { if (ready) { updateModel(true); dirty = true; } });
    this._off2 = ctx.bus.on('iss', () => { if (ready) { updateModel(true); dirty = true; } });
    this._off3 = ctx.bus.on('comets', () => { if (ready) { updateModel(true); dirty = true; } });
    raf = requestAnimationFrame(frame);
  },
  tick() { /* animates itself */ },
  unmount() {
    mounted = false; cancelAnimationFrame(raf); exitCam();
    clearTimeout(fadeTimer); clearTimeout(turnTimer);
    S.full = false; document.body.classList.remove('sky-full'); if (this._offR) this._offR();
    window.removeEventListener('resize', onShape); window.removeEventListener('orientationchange', onShape);
    if (orient) orient.stop(); orient = null;
    if (wakeLock) { try { wakeLock.release(); } catch (e) { /* ignore */ } wakeLock = null; }
    if (this._off) this._off(); if (this._off2) this._off2(); if (this._off3) this._off3(); if (this._off4) this._off4(); clearInterval(this._planeTimer);
    if (root && root.parentElement) root.parentElement.classList.remove('edge');
    root = null; cv = null; g = null; pointers.clear();
  },
};
