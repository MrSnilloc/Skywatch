// views/space.js — "Space": eye-candy views of where everything really is, animated in real time (or faster).
//   Earth   : 3D globe with day/night, coastlines and the satellites you can see from the ground (ISS, Tiangong,
//             Hubble, Starlink trains and the brightest ~150) on their real orbits. Drag to spin, pinch to zoom.
//   Moon    : the Earth–Moon system seen from above, with the Sun's direction and Earth's shadow.
//   Planets : the solar system from above (distances squeezed so Neptune fits on a phone).

import { col, mix, isNight } from '../colors.js';
import { icons, esc } from '../ui.js';
import { phaseName } from '../sky.js';
import { loadGroup, loadSat, loadStarlink, starlinkState } from '../satellites.js';
import { fmtTime, fmtDay } from '../time.js';

const A = () => globalThis.Astronomy;
const SAT = () => globalThis.satellite;
const RAD = Math.PI / 180, DEG = 180 / Math.PI, AU = 149597870.7, RE = 6371;

const SCENES = {
  earth: { label: 'Earth', speeds: [[1, 'Live'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 hr/s']] },
  moon: { label: 'Moon', speeds: [[3600, '1 hr/s'], [21600, '6 hr/s'], [86400, '1 day/s']] },
  solar: { label: 'Planets', speeds: [[86400, '1 day/s'], [604800, '1 wk/s'], [2592000, '1 mo/s']] },
};
const PLANETS = [
  ['Mercury', 87.97, 3, '#b9b2a8'], ['Venus', 224.7, 4.5, '#fff0c4'], ['Earth', 365.26, 4.6, '#5cb4ff'], ['Mars', 686.98, 3.6, '#ff7b5c'],
  ['Jupiter', 4332.6, 8.5, '#ffd9a0'], ['Saturn', 10759, 7.5, '#e8d49a'], ['Uranus', 30687, 5.5, '#9fe8f0'], ['Neptune', 60190, 5.5, '#7aa5ff'],
];
const FEATURED = { iss: '#5cc8ff', css: '#ffb454', hst: '#c49bff' };

// state kept between visits
const S = { scene: 'earth', speedIdx: { earth: 0, moon: 0, solar: 1 }, simMs: Date.now(), yaw: null, pitch: 0.5, zoom: { earth: 1, moon: 1, solar: 1 }, sel: null, paused: false };

let ctx, root, cv, g, W = 1, H = 1, dpr = 1, raf = 0, mounted = false, last = 0;
let land = null, sats = [], hits = [], stars = [], shade = null, shadeG = null;
let moonPath = null, orbitCache = null, belt = null;
const pointers = new Map();

// ---------- small vector maths ----------
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const llToEcef = (lat, lon) => { const a = lat * RAD, b = lon * RAD; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; };
const rotZ = (v, g) => [v[0] * Math.cos(g) - v[1] * Math.sin(g), v[0] * Math.sin(g) + v[1] * Math.cos(g), v[2]];

function camera() {
  const d = [Math.cos(S.pitch) * Math.cos(S.yaw), Math.cos(S.pitch) * Math.sin(S.yaw), Math.sin(S.pitch)];
  const right = norm(cross([0, 0, 1], d));
  return { d, right, up: cross(d, right) };
}

let eclRot = null;
function toEcl(v) {            // EQJ vector -> ecliptic [x,y,z]
  if (!eclRot) eclRot = A().Rotation_EQJ_ECL();
  const r = A().RotateVector(eclRot, v);
  return [r.x, r.y, r.z];
}

// ---------- data ----------
function loadLand() {
  if (land) return;
  land = [];
  fetch('data/land.json').then(r => r.json()).then(rings => {
    land = rings.map(r => { const out = []; for (let i = 0; i < r.length; i += 2) out.push(llToEcef(r[i + 1], r[i])); return out; });
  }).catch(() => { /* globe still draws without coastlines */ });
}

function buildSats() {
  const list = [], seen = new Set();
  const add = (name, satrec, kind, color, norad) => { if (!satrec || seen.has(norad)) return; seen.add(norad); list.push({ name, satrec, kind, color, norad }); };
  if (ctx.iss.satrec) add('ISS', ctx.iss.satrec, 'feat', FEATURED.iss, 25544);
  for (const e of Object.values(ctx.sats.items)) {
    if (!e.satrec) continue;
    if (e.train) add(`Starlink train · ${e.train.count} sats`, e.satrec, 'train', '#f2f5ff', e.norad);
    else add(e.name, e.satrec, FEATURED[e.id] ? 'feat' : 'other', FEATURED[e.id] || '#9fb4d6', e.norad);
  }
  for (const t of ctx.sats.group.list) add(t.name, t.satrec, 'other', /R\/B/.test(t.name) ? '#8a96aa' : '#b3c6e6', t.norad);
  sats = list;
}

function ensureData() {
  loadLand();
  if (ctx.sats.group.status === 'idle') loadGroup(ctx);
  ctx.config.sats.featured.forEach(f => { const e = ctx.sats.items[f.id]; if (e && e.status === 'idle') loadSat(ctx, f.id); });
  if (starlinkState(ctx).status === 'idle') loadStarlink(ctx);
  buildSats();
}

// ---------- canvas ----------
function resize() {
  const r = root.getBoundingClientRect();
  dpr = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  stars = Array.from({ length: 260 }, () => [rnd() * W, rnd() * H, rnd() * 1.2 + 0.2, rnd() * 0.6 + 0.25]);
}

function background() {
  g.fillStyle = col('#02040a'); g.fillRect(0, 0, W, H);
  g.fillStyle = col('#ffffff');
  for (const s of stars) { g.globalAlpha = s[3]; g.fillRect(s[0], s[1], s[2], s[2]); }
  g.globalAlpha = 1;
}

function label(text, x, y, color = '#e8eef9', font = '600 11px system-ui') {
  g.font = font; g.fillStyle = col(color); g.fillText(text, x, y);
}

function edgeMarker(vec2, text, color) {
  const n = Math.hypot(vec2[0], vec2[1]); if (n < 0.08) return;
  const ux = vec2[0] / n, uy = -vec2[1] / n, rad = Math.min(W, H) / 2 - 30;
  const x = W / 2 + ux * rad, y = H / 2 + uy * rad;
  g.save(); g.translate(x, y); g.rotate(Math.atan2(uy, ux));
  g.fillStyle = col(color); g.beginPath(); g.moveTo(10, 0); g.lineTo(-6, -7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.restore();
  g.textAlign = 'center'; label(text, x - ux * 22, y - uy * 22 + 4, color); g.textAlign = 'start';
}

// ---------- Earth scene ----------
function drawEarth(date) {
  const R = Math.min(W, H) * 0.27 * S.zoom.earth, cx = W / 2, cy = H / 2;
  const cam = camera();
  const gm = SAT().gstime(date);
  const sv = A().GeoVector('Sun', date, true), sun = norm([sv.x, sv.y, sv.z]);
  const P = (v) => [cx + R * dot(v, cam.right), cy - R * dot(v, cam.up), dot(v, cam.d)];

  // glow
  const glow = g.createRadialGradient(cx, cy, R * 0.98, cx, cy, R * 1.12);
  glow.addColorStop(0, col('#4fa3ff')); glow.addColorStop(1, 'rgba(79,163,255,0)');
  g.globalAlpha = 0.35; g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;

  // day/night shaded globe (low-res, scaled up)
  const n = Math.max(40, Math.min(260, Math.round(R * 0.8)));
  if (!shade || shade.width !== n) { shade = document.createElement('canvas'); shade.width = shade.height = n; shadeG = shade.getContext('2d'); }
  const img = shadeG.createImageData(n, n), d = img.data, red = isNight();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, w = 1 - (j + 0.5) / n * 2, rr = u * u + w * w, k = (j * n + i) * 4;
    if (rr > 1.08) { d[k + 3] = 0; continue; }
    const z = Math.sqrt(Math.max(0, 1 - rr));
    const nx = u * cam.right[0] + w * cam.up[0] + z * cam.d[0], ny = u * cam.right[1] + w * cam.up[1] + z * cam.d[1], nz = u * cam.right[2] + w * cam.up[2] + z * cam.d[2];
    const l = nx * sun[0] + ny * sun[1] + nz * sun[2];
    const t = Math.max(0, Math.min(1, (l + 0.1) / 0.2)), limb = 0.55 + 0.45 * z;
    let r = (5 + 25 * t) * limb, gg = (11 + 70 * t) * limb, b = (24 + 112 * t) * limb;
    if (red) { const L = 0.3 * r + 0.55 * gg + 0.15 * b; r = L * 1.4; gg = L * 0.15; b = L * 0.1; }
    d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
  }
  shadeG.putImageData(img, 0, 0);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
  g.imageSmoothingEnabled = true; g.drawImage(shade, cx - R, cy - R, 2 * R, 2 * R); g.restore();

  // graticule
  g.lineWidth = 0.7; g.strokeStyle = col('#3d6aa0'); g.globalAlpha = 0.35; g.beginPath();
  const ring = (fn) => { let pen = false; for (let i = 0; i <= 72; i++) { const p = P(rotZ(fn(i / 72), gm)); if (p[2] < 0) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } };
  for (const lat of [-60, -30, 0, 30, 60]) ring(t => llToEcef(lat, t * 360));
  for (let lon = 0; lon < 360; lon += 30) ring(t => llToEcef(-90 + t * 180, lon));
  g.stroke(); g.globalAlpha = 1;

  // coastlines: brighter on the day side
  if (land && land.length) {
    for (const day of [false, true]) {
      g.beginPath();
      for (const r of land) {
        let pen = false;
        for (const v0 of r) {
          const v = rotZ(v0, gm), p = P(v);
          const ok = p[2] > 0 && ((dot(v, sun) > 0) === day);
          if (!ok) { pen = false; continue; }
          pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true;
        }
      }
      g.lineWidth = day ? 1.2 : 0.9; g.strokeStyle = col(day ? '#9fe0b4' : '#3e6b74'); g.stroke();
    }
  }

  // you are here
  const loc = ctx.location();
  const me = rotZ(llToEcef(loc.lat, loc.lon), gm), mp = P(me);
  if (mp[2] > 0) {
    const pulse = 4 + 3 * Math.abs(Math.sin(performance.now() / 500));
    g.strokeStyle = col('#62f0a5'); g.lineWidth = 1.5; g.beginPath(); g.arc(mp[0], mp[1], pulse + 3, 0, 2 * Math.PI); g.stroke();
    g.fillStyle = col('#62f0a5'); g.beginPath(); g.arc(mp[0], mp[1], 3, 0, 2 * Math.PI); g.fill();
    label('You', mp[0] + 9, mp[1] - 6, '#62f0a5');
  }

  // satellites
  const hidden = (v, p) => p[2] < 0 && (dot(v, cam.right) ** 2 + dot(v, cam.up) ** 2) < 1;
  const lit = (v) => { const s = dot(v, sun); return s > 0 || (dot(v, v) - s * s) > 1; };
  for (const s of sats) {
    if (s.kind === 'other') continue;
    const per = 2 * Math.PI / s.satrec.no * 60000;   // orbit period in ms
    g.beginPath(); let pen = false;
    for (let k = 0; k <= 90; k++) {
      const pv = SAT().propagate(s.satrec, new Date(date.getTime() - per * 0.5 + per * k / 90));
      if (!pv || !pv.position) { pen = false; continue; }
      const v = [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE], p = P(v);
      if (hidden(v, p)) { pen = false; continue; }
      pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true;
    }
    g.strokeStyle = col(s.color); g.globalAlpha = 0.4; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1;
  }
  for (const s of sats) {
    const pv = SAT().propagate(s.satrec, date);
    if (!pv || !pv.position) continue;
    const v = [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE], p = P(v);
    if (hidden(v, p)) continue;
    const L = lit(v);
    if (s.kind === 'other') {
      g.globalAlpha = L ? 0.9 : 0.35; g.fillStyle = col(s.color); g.fillRect(p[0] - 1.2, p[1] - 1.2, 2.4, 2.4); g.globalAlpha = 1;
    } else {
      g.fillStyle = col(s.color); g.globalAlpha = 0.25; g.beginPath(); g.arc(p[0], p[1], 9, 0, 2 * Math.PI); g.fill(); g.globalAlpha = 1;
      g.beginPath(); g.arc(p[0], p[1], 3.6, 0, 2 * Math.PI); g.fill();
      label(s.name, p[0] + 9, p[1] + 4, s.color);
    }
    hits.push({ x: p[0], y: p[1], pri: s.kind === 'other' ? 0 : 10, info: () => satInfo(s, pv, v, L) });
  }

  // which way are the Sun and Moon?
  edgeMarker([dot(sun, cam.right), dot(sun, cam.up)], 'Sun', '#ffd84a');
  const mv = A().GeoMoon(date), mn = norm([mv.x, mv.y, mv.z]);
  edgeMarker([dot(mn, cam.right), dot(mn, cam.up)], 'Moon', '#efe9d6');
}

function satInfo(s, pv, v, L) {
  const alt = Math.hypot(...v) * RE - RE;
  const sp = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  const geo = SAT().eciToGeodetic(pv.position, SAT().gstime(simDate()));
  const lat = geo.latitude * DEG, lon = geo.longitude * DEG;
  return { title: s.name, lines: [
    `${Math.round(alt).toLocaleString()} km up · ${sp.toFixed(1)} km/s (${Math.round(sp * 2237).toLocaleString()} mph)`,
    `Over ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'} · ${L ? 'in sunlight' : 'in Earth’s shadow'}`,
    `One lap of Earth every ${Math.round(2 * Math.PI / s.satrec.no)} minutes`] };
}

// ---------- Moon scene ----------
function drawMoonScene(date) {
  const cx = W / 2, cy = H / 2, k = Math.min(W, H) * 0.42 * S.zoom.moon / 406000;
  if (!moonPath || Math.abs(moonPath.at - date) > 6 * 3600e3) {
    const pts = [];
    for (let i = 0; i <= 160; i++) { const t = new Date(date.getTime() + (i / 160 - 0.5) * 27.32 * 86400e3); const m = A().GeoMoon(t); const e = toEcl(m); pts.push([e[0] * AU, e[1] * AU]); }
    moonPath = { at: date.getTime(), pts };
  }
  const P = (x, y) => [cx + x * k, cy - y * k];
  const sv = toEcl(A().GeoVector('Sun', date, true)); const sa = Math.atan2(sv[1], sv[0]);
  const ux = Math.cos(sa), uy = Math.sin(sa);

  // sunlight wash from the Sun's side
  const gx = cx + ux * W, gy = cy - uy * W;
  const grd = g.createRadialGradient(gx, gy, 0, gx, gy, W * 1.4);
  grd.addColorStop(0, 'rgba(255,216,74,0.16)'); grd.addColorStop(1, 'rgba(255,216,74,0)');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);

  // Earth's shadow (exaggerated width)
  const er = 12;
  g.save(); g.translate(cx, cy); g.rotate(-sa + Math.PI);
  const sg = g.createLinearGradient(0, 0, 420000 * k, 0); sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0.1)');
  g.fillStyle = sg; g.fillRect(0, -er * 0.9, 420000 * k, er * 1.8); g.restore();

  // orbit
  g.strokeStyle = col('#6f86a8'); g.lineWidth = 1.2; g.setLineDash([4, 5]); g.beginPath();
  moonPath.pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]);

  const halfLit = (x, y, r, dark, light) => {
    g.fillStyle = col(dark); g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    g.fillStyle = col(light); g.beginPath(); g.arc(x, y, r, -sa - Math.PI / 2, -sa + Math.PI / 2); g.closePath(); g.fill();
  };
  halfLit(cx, cy, er, '#0c2440', '#4f9be8');
  label('Earth', cx + er + 6, cy + 18, '#9cc8ff');
  hits.push({ x: cx, y: cy, pri: 6, info: () => ({ title: 'Earth', lines: ['Seen from above the North Pole', 'Sizes are enlarged so you can see them'] }) });

  const mv = A().GeoMoon(date), me = toEcl(mv), dist = Math.hypot(...me) * AU;
  const mp = P(me[0] * AU, me[1] * AU);
  halfLit(mp[0], mp[1], 7, '#2b3242', '#f1ecd9');
  const ph = A().MoonPhase(date), ill = A().Illumination('Moon', date).phase_fraction;
  label(`Moon · ${phaseName(ph)}`, mp[0] + 12, mp[1] - 6, '#efe9d6');
  label(`${Math.round(dist).toLocaleString()} km`, mp[0] + 12, mp[1] + 9, '#9fb0c8', '11px system-ui');
  hits.push({ x: mp[0], y: mp[1], pri: 10, info: () => ({ title: 'Moon', lines: [`${phaseName(ph)} · ${Math.round(ill * 100)}% lit`, `${Math.round(dist).toLocaleString()} km from Earth (${dist < 362000 ? 'very close — supermoon range' : dist > 405000 ? 'near its farthest' : 'average distance'})`, 'Light takes 1.3 seconds to get here from the Moon'] }) });

  // perigee/apogee marks
  let pmin = null, pmax = null;
  for (const p of moonPath.pts) { const r = Math.hypot(p[0], p[1]); if (!pmin || r < pmin.r) pmin = { r, p }; if (!pmax || r > pmax.r) pmax = { r, p }; }
  for (const [m, t] of [[pmin, 'closest'], [pmax, 'farthest']]) { const q = P(m.p[0], m.p[1]); g.fillStyle = col('#6f86a8'); g.beginPath(); g.arc(q[0], q[1], 2.5, 0, 2 * Math.PI); g.fill(); label(t, q[0] + 6, q[1] + 4, '#6f86a8', '10px system-ui'); }

  edgeMarker([ux, uy], 'To the Sun', '#ffd84a');
}

// ---------- solar system scene ----------
function solarScale() {
  const Rmax = Math.min(W, H) * 0.46 * S.zoom.solar;
  return (au) => Rmax * Math.sqrt(au / 30.3);
}

function drawSolar(date) {
  const cx = W / 2, cy = H / 2, sc = solarScale();
  if (!orbitCache) {
    orbitCache = PLANETS.map(([n, per]) => {
      const pts = [];
      for (let i = 0; i <= 120; i++) { const t = new Date(Date.now() + per * 86400e3 * i / 120); const e = toEcl(A().HelioVector(n, t)); pts.push([e[0], e[1]]); }
      return pts;
    });
    let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    belt = Array.from({ length: 320 }, () => { const a = 2.2 + rnd() * 1.1; return [a, rnd() * 2 * Math.PI, Math.pow(a, 1.5) * 365.25]; });
  }
  const P = (x, y) => { const r = Math.hypot(x, y) || 1e-9, s = sc(r) / r; return [cx + x * s, cy - y * s]; };

  // Sun
  const sg = g.createRadialGradient(cx, cy, 2, cx, cy, 34);
  sg.addColorStop(0, col('#fff2b0')); sg.addColorStop(0.3, col('#ffc94a')); sg.addColorStop(1, 'rgba(255,180,60,0)');
  g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, 34, 0, 2 * Math.PI); g.fill();
  hits.push({ x: cx, y: cy, pri: 4, info: () => ({ title: 'Sun', lines: ['Our star — 109 Earths wide', 'Distances here are squeezed so the outer planets fit'] }) });

  // asteroid belt (moves at its own pace)
  g.fillStyle = col('#8a7f6e'); g.globalAlpha = 0.55;
  const days = (date.getTime() - Date.UTC(2026, 0, 1)) / 86400e3;
  for (const [a, ph, per] of belt) { const ang = ph + 2 * Math.PI * days / per; const q = P(a * Math.cos(ang), a * Math.sin(ang)); g.fillRect(q[0], q[1], 1.2, 1.2); }
  g.globalAlpha = 1;

  // orbits + planets
  const earthE = toEcl(A().HelioVector('Earth', date));
  PLANETS.forEach(([n, , size, color], i) => {
    g.strokeStyle = col(color); g.globalAlpha = 0.28; g.lineWidth = 1; g.beginPath();
    orbitCache[i].forEach((p, j) => { const q = P(p[0], p[1]); j ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.globalAlpha = 1;
    const e = n === 'Earth' ? earthE : toEcl(A().HelioVector(n, date));
    const q = P(e[0], e[1]);
    if (q[0] < -20 || q[0] > W + 20 || q[1] < -20 || q[1] > H + 20) return;
    g.fillStyle = col(color); g.beginPath(); g.arc(q[0], q[1], size, 0, 2 * Math.PI); g.fill();
    if (n === 'Saturn') { g.strokeStyle = col('#d8c690'); g.lineWidth = 1.4; g.beginPath(); g.ellipse(q[0], q[1], size * 2, size * 0.7, -0.4, 0, 2 * Math.PI); g.stroke(); }
    if (n === 'Earth') { const mv = toEcl(A().GeoMoon(date)); const a = Math.atan2(mv[1], mv[0]); g.fillStyle = col('#efe9d6'); g.beginPath(); g.arc(q[0] + Math.cos(a) * 9, q[1] - Math.sin(a) * 9, 1.6, 0, 2 * Math.PI); g.fill(); }
    label(n === 'Earth' ? 'Earth (you)' : n, q[0] + size + 5, q[1] + 4, n === 'Earth' ? '#62f0a5' : '#d9e2f2');
    hits.push({ x: q[0], y: q[1], pri: 10, info: () => {
      const rS = Math.hypot(...e);
      const lines = [`${rS.toFixed(2)} AU from the Sun (${Math.round(rS * AU / 1e6).toLocaleString()} million km)`];
      if (n !== 'Earth') { const rE = Math.hypot(e[0] - earthE[0], e[1] - earthE[1], e[2] - earthE[2]); lines.push(`${rE.toFixed(2)} AU from Earth · light takes ${Math.round(rE * 499 / 60)} min to reach us`); }
      lines.push(`One trip around the Sun: ${PLANETS[i][1] < 800 ? Math.round(PLANETS[i][1]) + ' days' : (PLANETS[i][1] / 365.25).toFixed(1) + ' years'}`);
      return { title: n, lines };
    } });
  });
}

// ---------- frame / time ----------
const speed = () => SCENES[S.scene].speeds[S.speedIdx[S.scene]][0];
const isLive = () => S.scene === 'earth' && S.speedIdx.earth === 0 && Math.abs(S.simMs - Date.now()) < 3000;
const simDate = () => new Date(S.simMs);

function frame(ts) {
  if (!mounted) return;
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(250, ts - last) : 16; last = ts;
  if (!S.paused) S.simMs += dt * speed();
  if (S.scene === 'earth' && S.speedIdx.earth === 0 && Math.abs(S.simMs - Date.now()) < 3000) S.simMs = Date.now();
  const date = simDate();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  background(); hits = [];
  if (S.scene === 'earth') drawEarth(date); else if (S.scene === 'moon') drawMoonScene(date); else drawSolar(date);
  const t = root.querySelector('#sp-time');
  const txt = isLive() ? 'Live · ' + fmtTime(date) : `${fmtDay(date)}${date.getFullYear() !== new Date().getFullYear() ? ', ' + date.getFullYear() : ''} · ${fmtTime(date)}`;
  if (t.dataset.t !== txt) { t.textContent = txt; t.dataset.t = txt; }
  if (S.sel) {
    const box = root.querySelector('#sp-info');
    if (!box.dataset.live || performance.now() - +box.dataset.live > 500) { showInfo(); box.dataset.live = performance.now(); }
  }
}

function controls() {
  const sc = SCENES[S.scene];
  root.querySelector('#sp-scenes').innerHTML = Object.entries(SCENES).map(([k, v]) => `<button data-scene="${k}" class="${k === S.scene ? 'on' : ''}">${v.label}</button>`).join('');
  root.querySelector('#sp-speed').innerHTML = sc.speeds.map(([, l], i) => `<button data-speed="${i}" class="${i === S.speedIdx[S.scene] ? 'on' : ''}">${l}</button>`).join('') + '<button data-a="now">Now</button>';
  const z = root.querySelector('.sp-zoom');
  z.classList.toggle('hidden', S.scene !== 'solar');
  z.textContent = S.zoom.solar > 2 ? 'All planets' : 'Inner planets';
  root.querySelector('#sp-hint').textContent = S.scene === 'earth' ? `${sats.length ? sats.length + ' satellites · ' : ''}drag to spin · pinch to zoom · tap to identify` : S.scene === 'moon' ? 'View from above · sizes enlarged' : 'View from above · distances squeezed to fit';
}

let selIdx = null;
function showInfo() {
  const box = root.querySelector('#sp-info');
  if (!S.sel) { box.classList.add('hidden'); return; }
  const h = hits.reduce((b, x) => { const d = Math.hypot(x.x - S.sel.x, x.y - S.sel.y) - x.pri; return d < (b ? b.d : 30) ? { h: x, d } : b; }, null);
  if (!h) { if (!S.sel.keep) { S.sel = null; box.classList.add('hidden'); } return; }
  S.sel.x = h.h.x; S.sel.y = h.h.y;
  const inf = h.h.info();
  box.innerHTML = `<div class="si-head"><div class="big">${esc(inf.title)}</div><button class="x" data-a="close">✕</button></div>${inf.lines.map(l => `<div class="sub" style="margin-top:3px">${esc(l)}</div>`).join('')}`;
  box.classList.remove('hidden');
}
void selIdx;

function onClick(e) {
  const b = e.target.closest('[data-scene],[data-speed],[data-a]'); if (!b) return;
  if (b.dataset.scene) { S.scene = b.dataset.scene; S.sel = null; showInfo(); if (S.scene === 'earth' && S.speedIdx.earth === 0) S.simMs = Date.now(); }
  else if (b.dataset.speed) { S.speedIdx[S.scene] = +b.dataset.speed; if (S.scene === 'earth' && +b.dataset.speed === 0) S.simMs = Date.now(); }
  else if (b.dataset.a === 'now') { S.simMs = Date.now(); }
  else if (b.dataset.a === 'inner') { S.zoom.solar = S.zoom.solar > 2 ? 1 : 3.4; }
  else if (b.dataset.a === 'close') { S.sel = null; showInfo(); }
  controls();
}

function bindPointer() {
  let start = null, lastDist = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    start = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: false } : null;
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; lastDist = Math.hypot(a.x - b.x, a.y - b.y); }
  });
  cv.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (lastDist) S.zoom[S.scene] = Math.max(0.5, Math.min(S.scene === 'solar' ? 12 : 6, S.zoom[S.scene] * d / lastDist));
      lastDist = d; if (start) start.moved = true;
    } else if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      start.moved = true;
      if (S.scene === 'earth') { S.yaw -= dx * 0.006; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + dy * 0.006)); }
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (pointers.size === 1 && start && !start.moved) {
      const r = cv.getBoundingClientRect(); S.sel = { x: e.clientX - r.left, y: e.clientY - r.top }; showInfo();
    }
    pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; start = null;
  });
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); start = null; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); S.zoom[S.scene] = Math.max(0.5, Math.min(S.scene === 'solar' ? 12 : 6, S.zoom[S.scene] * (e.deltaY > 0 ? 0.9 : 1.1))); }, { passive: false });
}

export const spaceView = {
  id: 'space', title: 'Space', icon: icons.space,
  mount(el, c) {
    ctx = c; mounted = true; last = 0;
    el.classList.add('edge');
    el.innerHTML = `<div class="sky-wrap sp-wrap">
      <canvas id="sp-cv"></canvas>
      <div class="sky-top"><div class="seg" id="sp-scenes"></div><div id="sp-time" class="sp-time"></div></div>
      <button class="chip sp-zoom hidden" data-a="inner">Inner planets</button>
      <div id="sp-hint" class="sky-hud"></div>
      <div id="sp-info" class="sky-info hidden"></div>
      <div class="sky-time" id="sp-speed"></div>
    </div>`;
    root = el.querySelector('.sp-wrap'); cv = root.querySelector('#sp-cv'); g = cv.getContext('2d');
    if (S.yaw === null) {   // start with your side of the planet facing you
      const loc = ctx.location(); S.yaw = loc.lon * RAD + SAT().gstime(new Date()); S.pitch = Math.max(-1.2, Math.min(1.2, loc.lat * RAD * 0.8));
    }
    if (S.scene === 'earth' && S.speedIdx.earth === 0) S.simMs = Date.now();
    root.addEventListener('click', onClick);
    bindPointer(); resize(); window.addEventListener('resize', resize);
    ensureData(); controls();
    this._off = ctx.bus.on('sats', () => { buildSats(); controls(); });
    this._off2 = ctx.bus.on('iss', () => { buildSats(); controls(); });
    raf = requestAnimationFrame(frame);
  },
  tick() { /* animates itself */ },
  unmount() {
    mounted = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
    if (this._off) this._off(); if (this._off2) this._off2();
    if (root && root.parentElement) root.parentElement.classList.remove('edge');
    root = null; cv = null; g = null; pointers.clear();
  },
};
void mix;
