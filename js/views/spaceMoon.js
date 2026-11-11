// views/spaceMoon.js — the Moon up close (part of the Space tab's "Moon" view).
// A globe you can spin, lit exactly as it is at the chosen time, tilted the way it hangs in YOUR sky, with
// named seas and craters and the six Apollo landing sites. The glowing band along the day/night line is
// "today's lit edge": shadows are longest there, so that is where binoculars show the most.
// Surface data: ../moonmap.js. Orientation and lighting: ../moons.js. The Space screen hands in a drawing
// kit `k`: { g, W, H, col, label, hits, night, ctx }.

import { moonGlobe } from '../moons.js';
import { moonMap, FEATURES, llVec } from '../moonmap.js';
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

/** Paint the lit globe into an off-screen picture n×n. Re-used while the view and the light haven't changed. */
function renderGlobe(mg, cam, n, night) {
  const key = [n, night, ...cam.d, ...cam.up, ...mg.sunDir].map(v => (typeof v === 'number' ? v.toFixed(3) : v)).join(',');
  if (key === bufKey) return buf;
  if (!buf || buf.width !== n) { buf = document.createElement('canvas'); buf.width = buf.height = n; bufG = buf.getContext('2d'); }
  const M = moonMap(), img = bufG.createImageData(n, n), d = img.data;
  const ax = (v) => [dot(v, mg.xm), dot(v, mg.ym), dot(v, mg.zm)];       // into the Moon's own axes
  const R = ax(cam.right), U = ax(cam.up), D = ax(cam.d), S = ax(mg.sunDir);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, w = 1 - (j + 0.5) / n * 2, rr = u * u + w * w, q = (j * n + i) * 4;
    if (rr > 1) { d[q + 3] = 0; continue; }
    const z = Math.sqrt(1 - rr);
    const x = u * R[0] + w * U[0] + z * D[0], y = u * R[1] + w * U[1] + z * D[1], zz = u * R[2] + w * U[2] + z * D[2];
    const lat = Math.asin(Math.max(-1, Math.min(1, zz))), lon = Math.atan2(y, x);
    // look the spot up in the surface map, blending the four nearest cells so it stays smooth
    const fx = (lon / RAD + 180) / 360 * M.w - 0.5, fy = Math.max(0, Math.min(M.h - 1.001, (90 - lat / RAD) / 180 * M.h - 0.5));
    const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
    const a = j0 * M.w + ((i0 % M.w) + M.w) % M.w, b2 = j0 * M.w + ((i0 + 1) % M.w + M.w) % M.w, c = a + M.w, e = b2 + M.w;
    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
    const alb = M.alb[a] * w00 + M.alb[b2] * w10 + M.alb[c] * w01 + M.alb[e] * w11;
    const sgx = M.gx[a] * w00 + M.gx[b2] * w10 + M.gx[c] * w01 + M.gx[e] * w11, sgy = M.gy[a] * w00 + M.gy[b2] * w10 + M.gy[c] * w01 + M.gy[e] * w11;
    const l = x * S[0] + y * S[1] + zz * S[2];
    // local east / north on the surface, to turn the map's slopes into light and shadow
    const el = Math.hypot(x, y) || 1e-6, ex = -y / el, ey = x / el;
    const nx = -zz * ey, ny = zz * ex, nzv = x * ey - y * ex;
    const se = ex * S[0] + ey * S[1], sn = nx * S[0] + ny * S[1] + nzv * S[2];
    const ll = l - 1.1 * (sgx * se + sgy * sn);     // a slope rising toward the Sun is brighter, one facing away is in shadow
    const b = ll <= 0 ? 0 : Math.pow(Math.min(1, ll / 0.22), 0.8) * (0.78 + 0.22 * Math.max(0, l));
    let v = alb * (0.04 + 0.96 * b) * 250;
    let r = v, gg = v * 0.985, bb = v * 0.95;
    if (l > -0.015 && l < 0.2) { const t = 0.3 * (1 - Math.abs(l - 0.05) / 0.16); if (t > 0) { r += (92 - r) * t * 0.6; gg += (200 - gg) * t * 0.55; bb += (255 - bb) * t * 0.6; } }   // today's lit edge
    if (night) { const L = 0.3 * r + 0.55 * gg + 0.15 * bb; r = L * 1.1; gg = L * 0.12; bb = L * 0.08; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = bb; d[q + 3] = rr > 0.985 ? 255 * (1 - rr) / 0.015 : 255;
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
  const n = Math.max(80, Math.min(st.dragging ? 170 : 320, Math.round(R * 1.1)));
  g.imageSmoothingEnabled = true;
  g.drawImage(renderGlobe(mg, cam, n, k.night), cx - R, cy - R, 2 * R, 2 * R);

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
