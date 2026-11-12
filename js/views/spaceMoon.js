// views/spaceMoon.js — the Moon up close (part of the Space tab's "Moon" view).
// A globe you can spin, lit exactly as it is at the chosen time, tilted the way it hangs in YOUR sky, with
// named seas and craters and the six Apollo landing sites. The glowing band along the day/night line is
// "today's lit edge": shadows are longest there, so that is where binoculars show the most.
// Surface picture: ../moonSurface.js (NASA's real Moon). Names: ../moonmap.js. Orientation and lighting: ../moons.js. The Space screen hands in a drawing
// kit `k`: { g, W, H, col, label, hits, night, ctx }.

import { moonGlobe } from '../moons.js';
import { FEATURES, llVec } from '../moonmap.js';
import { moonSurface } from '../moonSurface.js';
import { phaseName, dirName } from '../sky.js';

const RAD = Math.PI / 180;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mixv = (a, b, ca, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];

let buf = null, bufG = null, bufKey = '';

/** The viewer's camera: starts as the view from your backyard, then turned by the user's drag (yaw, pitch). */
function camera(mg, st) {
  const q = (mg.zenithAngle || 0) * RAD;
  const up0 = mixv(mg.north, mg.east, Math.cos(q), Math.sin(q)), d0 = mg.toEarth, r0 = cross(up0, d0);
  const d1 = mixv(d0, r0, Math.cos(st.yaw), Math.sin(st.yaw)), right = cross(up0, d1);
  return { d: mixv(d1, up0, Math.cos(st.pitch), Math.sin(st.pitch)), up: mixv(up0, d1, Math.cos(st.pitch), -Math.sin(st.pitch)), right };
}

/**
 * Paint the lit globe into an off-screen picture that covers the screen (one picture dot per `step` screen
 * pixels), so it stays sharp however far you zoom in. Re-used while the view and the light haven't changed.
 * V = { cx, cy, R, W, H, step, night }
 */
function renderGlobe(mg, cam, V) {
  const M = moonSurface(), { cx, cy, R, step } = V;
  const bw = Math.ceil(V.W / step), bh = Math.ceil(V.H / step);
  const key = [M.id, bw, bh, step, V.night, cx, cy, R.toFixed(1), ...[...cam.d, ...cam.up, ...mg.sunDir].map(v => v.toFixed(3))].join(',');
  if (key === bufKey) return buf;
  if (!buf || buf.width !== bw || buf.height !== bh) { buf = document.createElement('canvas'); buf.width = bw; buf.height = bh; bufG = buf.getContext('2d'); }
  const img = bufG.createImageData(bw, bh), d = img.data;
  const ax = (v) => [dot(v, mg.xm), dot(v, mg.ym), dot(v, mg.zm)];       // into the Moon's own axes
  const Rv = ax(cam.right), U = ax(cam.up), D = ax(cam.d), S = ax(mg.sunDir);
  const rgb = M.rgb, tone = M.tone, mw = M.w, mh = M.h, sw = M.sw, sh = M.sh, relief = M.relief, edgePx = R / step;
  const j0 = Math.max(0, Math.floor((cy - R) / step)), j1 = Math.min(bh - 1, Math.ceil((cy + R) / step));
  const i0b = Math.max(0, Math.floor((cx - R) / step)), i1b = Math.min(bw - 1, Math.ceil((cx + R) / step));
  for (let j = j0; j <= j1; j++) for (let i = i0b; i <= i1b; i++) {
    const u = ((i + 0.5) * step - cx) / R, w = (cy - (j + 0.5) * step) / R, rr = u * u + w * w;
    if (rr > 1) continue;
    const q = (j * bw + i) * 4, z = Math.sqrt(1 - rr);
    const x = u * Rv[0] + w * U[0] + z * D[0], y = u * Rv[1] + w * U[1] + z * D[1], zz = u * Rv[2] + w * U[2] + z * D[2];
    const lonD = Math.atan2(y, x) / RAD + 180, latD = 90 - Math.asin(Math.max(-1, Math.min(1, zz))) / RAD;
    // colour: look the spot up in the surface picture, blending the four nearest cells so it stays smooth
    let fx = lonD / 360 * mw - 0.5, fy = Math.max(0, Math.min(mh - 1.001, latD / 180 * mh - 0.5));
    let a0 = Math.floor(fx), b0 = Math.floor(fy), tx = fx - a0, ty = fy - b0;
    let a = b0 * mw + ((a0 % mw) + mw) % mw, b2 = b0 * mw + ((a0 + 1) % mw + mw) % mw, c = a + mw, e = b2 + mw;
    let w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    let cr, cg, cb;
    if (rgb) {
      a *= 4; b2 *= 4; c *= 4; e *= 4;
      cr = tone[rgb[a]] * w00 + tone[rgb[b2]] * w10 + tone[rgb[c]] * w01 + tone[rgb[e]] * w11;
      cg = tone[rgb[a + 1]] * w00 + tone[rgb[b2 + 1]] * w10 + tone[rgb[c + 1]] * w01 + tone[rgb[e + 1]] * w11;
      cb = tone[rgb[a + 2]] * w00 + tone[rgb[b2 + 2]] * w10 + tone[rgb[c + 2]] * w01 + tone[rgb[e + 2]] * w11;
    } else { const al = M.alb[a] * w00 + M.alb[b2] * w10 + M.alb[c] * w01 + M.alb[e] * w11; cr = al; cg = al * 0.985; cb = al * 0.95; }
    // slope: the same lookup in the height map (it can be a different size)
    fx = lonD / 360 * sw - 0.5; fy = Math.max(0, Math.min(sh - 1.001, latD / 180 * sh - 0.5));
    a0 = Math.floor(fx); b0 = Math.floor(fy); tx = fx - a0; ty = fy - b0;
    a = b0 * sw + ((a0 % sw) + sw) % sw; b2 = b0 * sw + ((a0 + 1) % sw + sw) % sw; c = a + sw; e = b2 + sw;
    w00 = (1 - tx) * (1 - ty); w10 = tx * (1 - ty); w01 = (1 - tx) * ty; w11 = tx * ty;
    const sgx = M.gx[a] * w00 + M.gx[b2] * w10 + M.gx[c] * w01 + M.gx[e] * w11, sgy = M.gy[a] * w00 + M.gy[b2] * w10 + M.gy[c] * w01 + M.gy[e] * w11;
    const l = x * S[0] + y * S[1] + zz * S[2];
    // local east / north on the surface, to turn the map's slopes into light and shadow
    const el = Math.hypot(x, y) || 1e-6, ex = -y / el, ey = x / el;
    const nx = -zz * ey, ny = zz * ex, nzv = x * ey - y * ex;
    const se = ex * S[0] + ey * S[1], sn = nx * S[0] + ny * S[1] + nzv * S[2];
    const ll = l - relief * (sgx * se + sgy * sn);     // a slope facing the Sun is brighter, one facing away is in shadow
    // nothing is lit once the Sun is well below that spot's horizon, however the ground slopes
    const up = l < -0.05 ? 0 : l > 0.03 ? 1 : (l + 0.05) / 0.08;
    const lit = ll <= 0 ? 0 : Math.pow(Math.min(1, ll / 0.22), 0.8) * (0.78 + 0.22 * Math.max(0, l)) * up;
    const v = (0.04 + 0.96 * lit) * 250;
    let r = cr * v, gg = cg * v, bb = cb * v;
    if (l > -0.015 && l < 0.2) { const t = 0.3 * (1 - Math.abs(l - 0.05) / 0.16); if (t > 0) { r += (92 - r) * t * 0.6; gg += (200 - gg) * t * 0.55; bb += (255 - bb) * t * 0.6; } }   // today's lit edge
    if (V.night) { const L = 0.3 * r + 0.55 * gg + 0.15 * bb; r = L * 1.1; gg = L * 0.12; bb = L * 0.08; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = bb; d[q + 3] = Math.max(0, Math.min(1, (1 - Math.sqrt(rr)) * edgePx + 0.5)) * 255;
  }
  bufG.putImageData(img, 0, 0); bufKey = key;
  return buf;
}

const STYLE = {
  sea: { color: '#9fc0ea', font: 'italic 600 11px system-ui' },
  crater: { color: '#e6e9f0', font: '10.5px system-ui' },
  mount: { color: '#d9c9a8', font: 'italic 10.5px system-ui' },
  apollo: { color: '#ffd84a', font: '700 11px system-ui' },
};

export function drawMoonFace(k, st, date) {
  const { g, W, H, col } = k;
  const mg = moonGlobe(date, k.ctx.location()), cam = camera(mg, st);
  const R = Math.min(W, H) * 0.4 * st.zoom, cx = W / 2, cy = H / 2 + 6;
  const step = st.dragging ? k.ctx.config.space.moon.dragStep : k.ctx.config.space.moon.step;   // coarser while you drag, to stay quick
  g.imageSmoothingEnabled = true;
  const pic = renderGlobe(mg, cam, { cx, cy, R, W, H, step, night: k.night });
  g.drawImage(pic, 0, 0, pic.width * step, pic.height * step);

  // features: where each one is on screen, and how high the Sun is there
  const world = (f) => { const v = llVec(f.lat, f.lon); return [0, 1, 2].map(i => v[0] * mg.xm[i] + v[1] * mg.ym[i] + v[2] * mg.zm[i]); };
  const edge = [], boxes = [];
  const maxRank = st.zoom >= 2.2 ? 3 : st.zoom >= 1.35 ? 2 : 1;
  for (const f of FEATURES) {
    const v = world(f), sunAlt = Math.asin(Math.max(-1, Math.min(1, dot(v, mg.sunDir)))) / RAD;
    if (dot(v, mg.toEarth) > 0.12 && sunAlt > 0 && sunAlt < 12 && f.kind !== 'apollo') edge.push(f);
    const depth = dot(v, cam.d);
    if (depth < 0.1) continue;
    const x = cx + R * dot(v, cam.right), y = cy - R * dot(v, cam.up);
    if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    const lit = sunAlt > 0, info = () => ({ title: f.name, lines: [...f.lines, lit ? (sunAlt < 12 ? 'On today’s lit edge — long shadows, great in binoculars tonight' : 'In full sunlight right now') : 'In darkness right now'] });
    k.hits.push({ x, y, pri: f.kind === 'apollo' ? 12 : 6, id: 'mf:' + f.id, info });
    if (!st.names || f.rank > maxRank) continue;
    const s = STYLE[f.kind], text = f.name;
    g.font = s.font; const tw = g.measureText(text).width;
    const box = f.kind === 'sea' ? [x - tw / 2, y - 7, tw, 14] : [x + 7, y - 7, tw, 14];
    if (boxes.some(b => box[0] < b[0] + b[2] + 3 && box[0] + box[2] + 3 > b[0] && box[1] < b[1] + b[3] && box[1] + box[3] > b[1])) continue;
    boxes.push(box);
    g.globalAlpha = Math.min(1, (depth - 0.1) / 0.25) * (lit ? 1 : 0.55);
    if (f.kind === 'apollo') {                                    // a little flag
      g.strokeStyle = col(s.color); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 10); g.stroke();
      g.fillStyle = col(s.color); g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 7, y - 7.5); g.lineTo(x, y - 5); g.closePath(); g.fill();
    } else if (f.kind !== 'sea') { g.strokeStyle = col(s.color); g.lineWidth = 1; g.beginPath(); g.arc(x, y, Math.max(2.5, Math.min(40, f.sizeDeg * RAD * R)), 0, 2 * Math.PI); g.stroke(); }
    g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.strokeText(text, box[0], y + 4);
    g.fillStyle = col(s.color); g.fillText(text, box[0], y + 4);
    g.globalAlpha = 1;
  }

  // caption: phase, where it is in your sky, and what's on the lit edge
  const pct = Math.round(mg.fraction * 100);
  const where = mg.alt != null ? (mg.alt > 0 ? ` · ${dirName(mg.az)}, ${Math.round(mg.alt)}° up` : ' · below your horizon') : '';
  edge.sort((a, b) => b.sizeDeg - a.sizeDeg);
  const tip = pct >= 97 ? 'Full Moon: no shadows, so craters look flat — look for the bright rays of Tycho and Copernicus instead'
    : pct <= 3 ? 'New Moon: the lit side faces away from us'
    : edge.length ? `Blue band = today’s lit edge, the best place for binoculars: ${edge.slice(0, 4).map(f => f.name.replace('Mare ', 'M. ')).join(', ')}`
    : 'Blue band = today’s lit edge — shadows are longest there, best for binoculars';
  st.caption = `${phaseName(mg.phase)} · ${pct}% lit${where}`;
  st.tip = tip;
  st.turned = Math.abs(st.yaw) > 0.02 || Math.abs(st.pitch) > 0.02;
}
