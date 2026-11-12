// views/space.js — "Space": eye-candy views of where everything really is, animated in real time (or faster).
//   Earth        : 3D globe with day/night, coastlines and the satellites you can see from the ground (ISS, Tiangong,
//                  Hubble, Starlink trains and the brightest ~150) on their real orbits. Drag to spin, pinch to zoom.
//   Moon         : "Orbit" = the Earth–Moon system seen from above; "Close-up" = a Moon you can spin (spaceMoon.js).
//   Solar system : all the planets from above, or pick one planet for a close-up with its moons (spacePlanet.js).
// One shared speed control (Live, 1 min/s, 1 hr/s, 1 day/s, and rewind) drives every view.
//
// TO ADD A VIEW: write a file that exports draw(k, state, date) like spacePlanet.js, add it to viewKey() / the
// draw switch in frame(), and give it chips in controls().

import { col, isNight } from '../colors.js';
import { icons, esc } from '../ui.js';
import { phaseName } from '../sky.js';
import { loadGroup, loadSat, loadStarlink, starlinkState } from '../satellites.js';
import { fmtTime, fmtDay } from '../time.js';
import { loadComets, interestingComets, helioEcl, jd, cometAt } from '../comets.js';
import { eventData } from '../events.js';
import { toast } from '../ui.js';
import { drawPlanet, fitZoom } from './spacePlanet.js';
import { drawMoonFace } from './spaceMoon.js';
import { strokeAhead, strokeTrail, drawMarks } from '../paths.js';
import { PLANETS as PLANET_DATA, PLANET_NAMES, bestTonight } from '../moons.js';

const A = () => globalThis.Astronomy;
const SAT = () => globalThis.satellite;
const RAD = Math.PI / 180, DEG = 180 / Math.PI, AU = 149597870.7, RE = 6371;

const SCENES = { earth: { label: 'Earth' }, moon: { label: 'Moon' }, solar: { label: 'Solar system' } };
const PLANETS = [
  ['Mercury', 87.97, 3, '#b9b2a8'], ['Venus', 224.7, 4.5, '#fff0c4'], ['Earth', 365.26, 4.6, '#5cb4ff'], ['Mars', 686.98, 3.6, '#ff7b5c'],
  ['Jupiter', 4332.6, 8.5, '#ffd9a0'], ['Saturn', 10759, 7.5, '#e8d49a'], ['Uranus', 30687, 5.5, '#9fe8f0'], ['Neptune', 60190, 5.5, '#7aa5ff'],
];
const FEATURED = { iss: '#5cc8ff', css: '#ffb454', hst: '#c49bff' };

// state kept between visits
const S = { scene: 'earth', earthTurned: false, speedIdx: 0, dir: 1, hold: false, follow: false, simMs: Date.now(), yaw: null, pitch: 0.5, zoom: { earth: 1, moon: 1, solar: 1 }, sel: null, paused: false, pan: { moon: [0, 0], solar: [0, 0] },
  planet: { name: null, zoom: 1, pan: [0, 0], yaw: 0, pitch: 0, turned: false, dragging: false, bino: false, binoNote: '', caption: '' },      // Solar system → one planet
  face: { on: false, zoom: 1, yaw: 0, pitch: 0, pan: [0, 0], flat: false, slide: false, names: true, dragging: false, caption: '', tip: '', turned: false } };   // Moon → close-up

/** Which drawing is showing: 'earth' | 'moon' | 'face' | 'solar' | 'planet'. */
const viewKey = () => (S.scene === 'moon' && S.face.on ? 'face' : S.scene === 'solar' && S.planet.name ? 'planet' : S.scene);

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
  if (!ctx.comets || ctx.comets.status === 'idle') loadComets(ctx);
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

// ---------- a shaded globe (used by the Earth and Moon scenes) ----------
/** Draw Earth at (cx,cy) radius R. cam: {right,up,d} in Earth-centred inertial coords; sun: unit vector; gm: sidereal angle. */
function drawGlobe(cx, cy, R, cam, sun, gm, grid, moonER) {
  // Is the Moon close to the Sun as seen from Earth? Then work out its shadow on the ground (solar eclipse).
  const ecl = moonER && dot(norm(moonER), sun) > Math.cos(0.035);
  const PG = (v) => [cx + R * dot(v, cam.right), cy - R * dot(v, cam.up), dot(v, cam.d)];
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
    if (ecl && l > -0.05) {
      const mx = moonER[0] - nx, my = moonER[1] - ny, mz = moonER[2] - nz, md = Math.hypot(mx, my, mz);
      const ang = Math.acos(Math.max(-1, Math.min(1, (mx * sun[0] + my * sun[1] + mz * sun[2]) / md)));
      const mR = 0.2727 / md, sR = 0.004652;
      if (ang < mR + sR) {
        const cover = Math.max(0, Math.min(1, (mR + sR - ang) / (2 * Math.min(mR, sR)))) * Math.min(1, (mR / sR) ** 2);
        const f = 1 - 0.9 * cover; r *= f; gg *= f; b *= f;
      }
    }
    if (red) { const L = 0.3 * r + 0.55 * gg + 0.15 * b; r = L * 1.4; gg = L * 0.15; b = L * 0.1; }
    d[k] = r; d[k + 1] = gg; d[k + 2] = b; d[k + 3] = 255;
  }
  shadeG.putImageData(img, 0, 0);
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.clip();
  g.imageSmoothingEnabled = true; g.drawImage(shade, cx - R, cy - R, 2 * R, 2 * R); g.restore();

  // graticule
  if (grid) {
  g.lineWidth = 0.7; g.strokeStyle = col('#3d6aa0'); g.globalAlpha = 0.35; g.beginPath();
  const ring = (fn) => { let pen = false; for (let i = 0; i <= 72; i++) { const p = PG(rotZ(fn(i / 72), gm)); if (p[2] < 0) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; } };
  for (const lat of [-60, -30, 0, 30, 60]) ring(t => llToEcef(lat, t * 360));
  for (let lon = 0; lon < 360; lon += 30) ring(t => llToEcef(-90 + t * 180, lon));
  g.stroke(); g.globalAlpha = 1;
  }

  // coastlines: brighter on the day side
  if (land && land.length) {
    for (const day of [false, true]) {
      g.beginPath();
      for (const r of land) {
        let pen = false;
        for (const v0 of r) {
          const v = rotZ(v0, gm), p = PG(v);
          const ok = p[2] > 0 && ((dot(v, sun) > 0) === day);
          if (!ok) { pen = false; continue; }
          pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true;
        }
      }
      g.lineWidth = day ? 1.2 : 0.9; g.strokeStyle = col(day ? '#9fe0b4' : '#3e6b74'); g.stroke();
    }
  }

}

// ---------- Earth scene ----------
function drawEarth(date) {
  const R = Math.min(W, H) * 0.27 * S.zoom.earth, cx = W / 2, cy = H / 2;
  const cam = camera();
  const gm = SAT().gstime(date);
  const sv = A().GeoVector('Sun', date, true), sun = norm([sv.x, sv.y, sv.z]);
  const P = (v) => [cx + R * dot(v, cam.right), cy - R * dot(v, cam.up), dot(v, cam.d)];

  const mvq = A().GeoMoon(date), moonKm = [mvq.x * AU, mvq.y * AU, mvq.z * AU];
  const moonER = moonKm.map(c => c / RE), mn = norm(moonKm);
  const ob = 23.4392911 * RAD, pole = [0, -Math.sin(ob), Math.cos(ob)];
  // Sun and Moon are drawn closer than they really are (the Moon is 60 Earths away) so they fit on screen.
  const place = (u, distR) => {
    let ox = distR * R * dot(u, cam.right), oy = -distR * R * dot(u, cam.up);
    const lim = Math.min((W / 2 - 34) / Math.max(1e-6, Math.abs(ox)), (H / 2 - 90) / Math.max(1e-6, Math.abs(oy)), 1);   // keep it on screen, same direction
    const within = Math.hypot(ox, oy) < R * 1.02;
    if (!within) { ox *= lim; oy *= lim; }
    return { x: cx + ox, y: cy + oy, depth: dot(u, cam.d), within };
  };
  const sunP = place(sun, 4.2), moonP = place(mn, 3.0), MR = Math.max(7, R * 0.15);
  const onScreen = (p, m) => p.x > -m && p.x < W + m && p.y > -m && p.y < H + m;
  const drawSun = () => {
    const behind = sunP.depth < 0 && sunP.within;                 // eclipsed by Earth: just a glow round the edge
    const gr = g.createRadialGradient(sunP.x, sunP.y, 2, sunP.x, sunP.y, behind ? R * 0.9 : 30);
    gr.addColorStop(0, col('#fff3c0')); gr.addColorStop(0.25, 'rgba(255,214,110,0.55)'); gr.addColorStop(1, 'rgba(255,200,80,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(sunP.x, sunP.y, behind ? R * 0.9 : 30, 0, 2 * Math.PI); g.fill();
    if (!behind) { g.fillStyle = col('#ffe9a8'); g.beginPath(); g.arc(sunP.x, sunP.y, 8, 0, 2 * Math.PI); g.fill(); label('Sun', sunP.x + 12, sunP.y - 10, '#ffd84a'); }
    hits.push({ x: sunP.x, y: sunP.y, pri: 6, id: 'sun', info: () => ({ title: 'Sun', lines: ['Shown much closer than it really is', 'Night side of Earth faces away from it'] }) });
  };
  const drawMoon = () => {
    if (moonP.depth < 0 && moonP.within) return;                   // hidden behind Earth
    drawMoonBall(moonP.x, moonP.y, MR, cam, sun, norm(moonKm.map(c => -c)), pole, moonKm);
    label('Moon', moonP.x + MR + 5, moonP.y + 4, '#efe9d6');
    const dist = Math.hypot(...moonKm), ph = A().MoonPhase(date);
    hits.push({ x: moonP.x, y: moonP.y, pri: 8, id: 'moon', info: () => ({ title: 'Moon', lines: [`${phaseName(ph)} · ${Math.round(dist).toLocaleString()} km away`, 'Shown much closer than it really is (it’s 30 Earths away)'] }) });
  };
  const sunVisible = onScreen(sunP, 30) && !(sunP.depth > 0 && sunP.within);
  const moonVisible = onScreen(moonP, 20) && !(moonP.depth > 0 && moonP.within);
  if (sunVisible && sunP.depth < 0) drawSun();
  if (moonVisible && moonP.depth < 0) drawMoon();
  drawGlobe(cx, cy, R, cam, sun, gm, true, moonER);
  if (sunVisible && sunP.depth >= 0) drawSun();
  if (moonVisible && moonP.depth >= 0) drawMoon();

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
  const selId = S.sel && S.sel.id;
  // Sped up, satellites would just be a blur of dots: show each one's orbit as a line instead.
  const fast = Math.abs(speed()) >= ctx.config.space.orbitLinesSpeed;
  if (fast) {
    for (const s of sats) {
      if (s.kind !== 'other') continue;
      if (!s.orbit || Math.abs(s.orbit.at - date.getTime()) > 3 * 3600e3) {       // orbits drift slowly: redo every 3 hours of app time
        const per = 2 * Math.PI / s.satrec.no * 60000, pts = [];
        for (let q = 0; q <= 40; q++) { const pv = SAT().propagate(s.satrec, new Date(date.getTime() + per * q / 40)); if (pv && pv.position) pts.push([pv.position.x / RE, pv.position.y / RE, pv.position.z / RE]); }
        s.orbit = { at: date.getTime(), pts };
      }
      g.beginPath(); let pen = false;
      for (const v of s.orbit.pts) { const p = P(v); if (hidden(v, p)) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; }
      g.strokeStyle = col(s.color); g.globalAlpha = 0.16; g.lineWidth = 0.8; g.stroke(); g.globalAlpha = 1;
    }
  }
  for (const s of sats) {
    const isSel = selId === 'sat:' + s.norad;
    if (s.kind === 'other' && !isSel) continue;
    const per = 2 * Math.PI / s.satrec.no * 60000;   // orbit period in ms
    const at = (ms) => {                              // screen spot of this satellite `ms` from now (null = behind Earth)
      const pv = SAT().propagate(s.satrec, new Date(date.getTime() + ms));
      if (!pv || !pv.position) return null;
      const v = [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE], p = P(v);
      return hidden(v, p) ? null : p;
    };
    // One lap of the orbit, half behind and half ahead. Working it out is the costly part, so it is kept
    // for a few seconds (an orbit barely shifts in that time) and only re-aimed at the screen each frame.
    if (!s.lap || Math.abs(s.lap.at - date.getTime()) > 4000) {
      const pts = [];
      for (let k = 0; k <= 90; k++) { const pv = SAT().propagate(s.satrec, new Date(date.getTime() - per * 0.5 + per * k / 90)); pts.push(pv && pv.position ? [pv.position.x / RE, pv.position.y / RE, pv.position.z / RE] : null); }
      s.lap = { at: date.getTime(), pts };
    }
    const lap = s.lap.pts.map(v => { if (!v) return null; const p = P(v); return hidden(v, p) ? null : p; });
    const c = isSel ? '#ffffff' : s.color;
    if (fast) {                                        // sped up: the whole orbit as one steady line
      g.beginPath(); let pen = false;
      for (const p of lap) { if (!p) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; }
      g.strokeStyle = col(c); g.globalAlpha = isSel ? 0.9 : 0.75; g.lineWidth = isSel ? 2 : 1.6; g.stroke(); g.globalAlpha = 1;
    } else {                                           // half a lap behind (faded trail), half a lap ahead (dotted) — see paths.js
      strokeTrail(g, lap.slice(0, 46), c, isSel ? 0.9 : 0.5, isSel ? 2 : 1.2);
      strokeAhead(g, lap.slice(45), c, isSel ? 0.95 : 0.6, isSel ? 2 : 1.4);
      if (isSel) {
        const marks = [];
        for (let m = 1; m <= ctx.config.paths.spaceMarksMin; m++) { const p = at(m * 60000); if (p) marks.push({ x: p[0], y: p[1], min: m }); }
        drawMarks(g, marks, '#ffffff', { labels: true, gap: ctx.config.paths.labelGapPx });
      }
    }
    if (fast && s.kind !== 'other') {                 // name the line at its northernmost point (steady, unlike the racing dot)
      const pv = SAT().propagate(s.satrec, date);
      if (pv && pv.position) {
        const r = Math.hypot(pv.position.x, pv.position.y, pv.position.z) / RE, nrm = norm(cross([pv.position.x, pv.position.y, pv.position.z], [pv.velocity.x, pv.velocity.y, pv.velocity.z]));
        const top = norm([-nrm[0] * nrm[2], -nrm[1] * nrm[2], 1 - nrm[2] * nrm[2]]).map(c => c * r), p = P(top);
        if (!hidden(top, p)) label(s.name, p[0] + 6, p[1] - 5, s.color);
      }
    }
  }
  for (const s of fast ? [] : sats) {
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
    const id = 'sat:' + s.norad;
    if (id === selId) {
      const pulse = 13 + 3 * Math.sin(performance.now() / 260);
      g.strokeStyle = col('#ffffff'); g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], pulse, 0, 2 * Math.PI); g.stroke();
      g.globalAlpha = 0.35; g.beginPath(); g.arc(p[0], p[1], pulse + 6, 0, 2 * Math.PI); g.stroke(); g.globalAlpha = 1;
      if (s.kind === 'other') label(s.name, p[0] + 16, p[1] + 4, '#ffffff');
    }
    hits.push({ x: p[0], y: p[1], pri: s.kind === 'other' ? 0 : 10, id, info: () => satInfo(s, pv, v, L) });
  }
  // follow the chosen satellite: swing the camera toward it
  if (S.follow && selId) {
    const s = sats.find(x => 'sat:' + x.norad === selId);
    const pv = s && SAT().propagate(s.satrec, date);
    if (pv && pv.position) {
      // look from above the satellite, tilted toward its orbit's pole, so the orbit shows as a loop (not edge-on)
      const pos = [pv.position.x, pv.position.y, pv.position.z], nrm = norm(cross(pos, [pv.velocity.x, pv.velocity.y, pv.velocity.z]));
      const u = norm(norm(pos).map((c, i) => c + 0.75 * nrm[i]));
      const ty = Math.atan2(u[1], u[0]), tp = Math.max(-1.4, Math.min(1.4, Math.asin(u[2])));
      let dy = ((ty - S.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      S.yaw += dy * 0.08; S.pitch += (tp - S.pitch) * 0.08;
    }
  }

  // off screen (or behind you)? point the way
  if (!sunVisible) edgeMarker([dot(sun, cam.right), dot(sun, cam.up)], 'Sun', '#ffd84a');
  if (!moonVisible) edgeMarker([dot(mn, cam.right), dot(mn, cam.up)], 'Moon', '#efe9d6');
}

function satInfo(s, pv, v, L) {
  const alt = Math.hypot(...v) * RE - RE;
  const sp = Math.hypot(pv.velocity.x, pv.velocity.y, pv.velocity.z);
  const geo = SAT().eciToGeodetic(pv.position, SAT().gstime(simDate()));
  const lat = geo.latitude * DEG, lon = geo.longitude * DEG;
  return { title: s.name, follow: true, lines: [
    `${Math.round(alt).toLocaleString()} km up · ${sp.toFixed(1)} km/s (${Math.round(sp * 2237).toLocaleString()} mph)`,
    `Over ${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(0)}°${lon >= 0 ? 'E' : 'W'} · ${L ? 'in sunlight' : 'in Earth’s shadow'}`,
    `One lap of Earth every ${Math.round(2 * Math.PI / s.satrec.no)} minutes`] };
}

// ---------- a shaded Moon with its dark "seas" (maria) ----------
const MARIA = [[33, -16, 14], [28, 17, 9], [8, 31, 10], [17, 59, 6], [-8, 51, 7], [-21, -17, 9], [18, -57, 20], [-15, 35, 5], [56, 0, 10], [-24, -39, 5], [-10, -20, 8]];
let moonBuf = null, moonBufG = null;
/**
 * Draw the Moon at (x,y) radius R.
 * cam {right,up,d}, sun (unit, from Earth), toEarth (unit, from Moon), pole (Moon's spin axis ≈ ecliptic north)
 * and moonKm (Moon's position from Earth, km) are all in the same coordinate frame.
 * Inside Earth's shadow the Moon dims and turns red — a lunar eclipse.
 */
function drawMoonBall(x, y, R, cam, sun, toEarth, pole, moonKm) {
  const n = Math.max(16, Math.round(R * 2 * Math.min(2, dpr)));
  if (!moonBuf || moonBuf.width !== n) { moonBuf = document.createElement('canvas'); moonBuf.width = moonBuf.height = n; moonBufG = moonBuf.getContext('2d'); }
  const zm = pole, tp = dot(toEarth, zm), xm = norm(toEarth.map((c, i) => c - tp * zm[i])), ym = cross(zm, xm);
  const anti = [-sun[0], -sun[1], -sun[2]];
  const img = moonBufG.createImageData(n, n), d = img.data, red = isNight();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, w = 1 - (j + 0.5) / n * 2, rr = u * u + w * w, k = (j * n + i) * 4;
    if (rr > 1) { d[k + 3] = 0; continue; }
    const z = Math.sqrt(1 - rr);
    const nv = [0, 1, 2].map(q => u * cam.right[q] + w * cam.up[q] + z * cam.d[q]);
    const lat = Math.asin(Math.max(-1, Math.min(1, dot(nv, zm)))) * DEG, lon = Math.atan2(dot(nv, ym), dot(nv, xm)) * DEG;
    let dark = 0;
    for (const [la, lo, r] of MARIA) { const dd = Math.hypot(lat - la, (lon - lo) * Math.cos(la * RAD)); dark += Math.exp(-(dd * dd) / (r * r)); }
    const crater = 0.06 * Math.sin(lat * 0.9) * Math.sin(lon * 1.3) + 0.04 * Math.sin(lat * 2.7 + lon * 1.9);
    const alb = Math.max(0.35, 0.92 - 0.42 * Math.min(1, dark) + crater);
    const l = dot(nv, sun), lit = Math.max(0, Math.min(1, (l + 0.04) / 0.12)) * (0.35 + 0.65 * Math.max(0, l));
    let v = (0.05 + 0.95 * lit) * alb * 245;
    let rC = v, gC = v * 0.98, bC = v * 0.94;
    // Earth's shadow
    const pk = [moonKm[0] + nv[0] * 1737, moonKm[1] + nv[1] * 1737, moonKm[2] + nv[2] * 1737];
    const along = dot(pk, anti);
    if (along > 0) {
      const perp = Math.hypot(pk[0] - along * anti[0], pk[1] - along * anti[1], pk[2] - along * anti[2]);
      const rU = 6371 * 1.02 - along * 0.004610, rP = 6371 * 1.02 + along * 0.004695;
      if (perp < rU) { const L = v * 0.5; rC = L * 0.85; gC = L * 0.28; bC = L * 0.16; }
      else if (perp < rP) { const f = 0.45 + 0.55 * (perp - rU) / (rP - rU); rC *= f; gC *= f * 0.97; bC *= f * 0.95; }
    }
    if (red) { const L = 0.3 * rC + 0.55 * gC + 0.15 * bC; rC = L * 1.1; gC = L * 0.12; bC = L * 0.08; }
    d[k] = rC; d[k + 1] = gC; d[k + 2] = bC; d[k + 3] = 255;
  }
  moonBufG.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true; g.drawImage(moonBuf, x - R, y - R, 2 * R, 2 * R);
}

// ---------- Moon scene ----------
function drawMoonScene(date) {
  const cx = W / 2 + S.pan.moon[0], cy = H / 2 + S.pan.moon[1], k = Math.min(W, H) * 0.42 * S.zoom.moon / 406000;
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
  const er = 18;
  g.save(); g.translate(cx, cy); g.rotate(-sa + Math.PI);
  const sg = g.createLinearGradient(0, 0, 420000 * k, 0); sg.addColorStop(0, 'rgba(0,0,0,0.55)'); sg.addColorStop(1, 'rgba(0,0,0,0.1)');
  g.fillStyle = sg; g.fillRect(0, -er * 0.9, 420000 * k, er * 1.8); g.restore();

  // orbit
  g.strokeStyle = col('#6f86a8'); g.lineWidth = 1.2; g.setLineDash([4, 5]); g.beginPath();
  moonPath.pts.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }); g.stroke(); g.setLineDash([]);

  // Earth as a real little globe, seen from above the North Pole side of the solar system
  const ob = 23.4392911 * RAD;
  const ecam = { right: [1, 0, 0], up: [0, Math.cos(ob), Math.sin(ob)], d: [0, -Math.sin(ob), Math.cos(ob)] };
  const sq = A().GeoVector('Sun', date, true), sunEq = norm([sq.x, sq.y, sq.z]);
  const ER = Math.max(16, 22 * Math.sqrt(S.zoom.moon));
  drawGlobe(cx, cy, ER, ecam, sunEq, SAT().gstime(date), false);
  label('Earth', cx + ER + 6, cy + ER + 4, '#9cc8ff');
  hits.push({ x: cx, y: cy, pri: 6, id: 'earth', info: () => ({ title: 'Earth', lines: ['Seen from above the North Pole', 'Sizes are enlarged so you can see them'] }) });

  const mv = A().GeoMoon(date), me = toEcl(mv), dist = Math.hypot(...me) * AU;
  const mp = P(me[0] * AU, me[1] * AU);
  const MR = Math.max(8, 10 * Math.sqrt(S.zoom.moon));
  const toE = norm([-me[0], -me[1], -me[2]]);
  drawMoonBall(mp[0], mp[1], MR, { right: [1, 0, 0], up: [0, 1, 0], d: [0, 0, 1] }, norm(sv), toE, [0, 0, 1], me.map(c => c * AU));
  const ph = A().MoonPhase(date), ill = A().Illumination('Moon', date).phase_fraction;
  label(`Moon · ${phaseName(ph)}`, mp[0] + MR + 6, mp[1] - 6, '#efe9d6');
  label(`${Math.round(dist).toLocaleString()} km`, mp[0] + MR + 6, mp[1] + 9, '#9fb0c8', '11px system-ui');
  hits.push({ x: mp[0], y: mp[1], pri: 10, id: 'moon', info: () => ({ title: 'Moon', lines: [`${phaseName(ph)} · ${Math.round(ill * 100)}% lit`, `${Math.round(dist).toLocaleString()} km from Earth (${dist < 362000 ? 'very close — supermoon range' : dist > 405000 ? 'near its farthest' : 'average distance'})`, 'Light takes 1.3 seconds to get here from the Moon'] }) });

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
  const cx = W / 2 + S.pan.solar[0], cy = H / 2 + S.pan.solar[1], sc = solarScale();
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
  hits.push({ x: cx, y: cy, pri: 4, id: 'sun', info: () => ({ title: 'Sun', lines: ['Our star — 109 Earths wide', 'Distances here are squeezed so the outer planets fit'] }) });

  // asteroid belt (moves at its own pace)
  g.fillStyle = col('#8a7f6e'); g.globalAlpha = 0.55;
  const days = (date.getTime() - Date.UTC(2026, 0, 1)) / 86400e3;
  for (const [a, ph, per] of belt) { const ang = ph + 2 * Math.PI * days / per; const q = P(a * Math.cos(ang), a * Math.sin(ang)); g.fillRect(q[0], q[1], 1.2, 1.2); }
  g.globalAlpha = 1;

  // comets (bright ones only), tails pointing away from the Sun
  for (const it of interestingComets(ctx)) {
    const c = it.c, h = helioEcl(c, jd(date));
    const st = cometAt(c, date);
    if (st.mag > ctx.config.comets.mapMag + 1) continue;
    g.strokeStyle = col('#7fe3d0'); g.globalAlpha = 0.25; g.lineWidth = 1; g.beginPath();
    for (let k = 0; k <= 80; k++) { const hh = helioEcl(c, c.T - 400 + k * 10); if (hh[3] > 35) continue; const q = P(hh[0], hh[1]); k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); }
    g.stroke(); g.globalAlpha = 1;
    const q = P(h[0], h[1]); const ang = Math.atan2(-(q[1] - cy), q[0] - cx);
    const len = Math.max(10, 34 - st.mag * 2.2);
    const tg = g.createLinearGradient(q[0], q[1], q[0] + Math.cos(ang) * len, q[1] - Math.sin(ang) * len);
    tg.addColorStop(0, 'rgba(160,240,225,0.85)'); tg.addColorStop(1, 'rgba(160,240,225,0)');
    g.strokeStyle = tg; g.lineWidth = 3; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(q[0] + Math.cos(ang) * len, q[1] - Math.sin(ang) * len); g.stroke();
    g.fillStyle = col('#c9fff4'); g.beginPath(); g.arc(q[0], q[1], 2.6, 0, 2 * Math.PI); g.fill();
    label(c.id, q[0] + 6, q[1] + 12, '#9fe8d8', '10px system-ui');
    hits.push({ x: q[0], y: q[1], pri: 8, id: 'comet:' + c.id, info: () => ({ title: c.name, lines: [`Comet · about magnitude ${st.mag.toFixed(1)} (brightness is a rough guess)`, `${st.r.toFixed(2)} AU from the Sun · ${st.delta.toFixed(2)} AU from Earth`, `Closest to the Sun: ${new Date((c.T - 2440587.5) * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`] }) });
  }

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
    hits.push({ x: q[0], y: q[1], pri: 10, id: 'planet:' + n, info: () => {
      const rS = Math.hypot(...e);
      const lines = [`${rS.toFixed(2)} AU from the Sun (${Math.round(rS * AU / 1e6).toLocaleString()} million km)`];
      if (n !== 'Earth') { const rE = Math.hypot(e[0] - earthE[0], e[1] - earthE[1], e[2] - earthE[2]); lines.push(`${rE.toFixed(2)} AU from Earth · light takes ${Math.round(rE * 499 / 60)} min to reach us`); }
      lines.push(`One trip around the Sun: ${PLANETS[i][1] < 800 ? Math.round(PLANETS[i][1]) + ' days' : (PLANETS[i][1] / 365.25).toFixed(1) + ' years'}`);
      return { title: n, lines };
    } });
  });
}

// ---------- frame / time ----------
const SPEEDS = () => ctx.config.space.speeds;
const speed = () => (S.hold ? 0 : SPEEDS()[S.speedIdx][0] * (S.speedIdx === 0 ? 1 : S.dir));    // app-seconds per real second
const liveMode = () => S.speedIdx === 0 && !S.hold;
const isLive = () => liveMode() && Math.abs(S.simMs - Date.now()) < 3000;
function goLive() { S.speedIdx = 0; S.dir = 1; S.hold = false; S.simMs = Date.now(); }
/** Freeze the clock at a moment (used by "tonight" views). Tapping any speed starts it again. */
function holdAt(date) { S.simMs = date.getTime(); S.hold = true; }
const simDate = () => new Date(S.simMs);

function frame(ts) {
  if (!mounted) return;
  raf = requestAnimationFrame(frame);
  const dt = last ? Math.min(250, ts - last) : 16; last = ts;
  if (!S.paused) S.simMs += dt * speed();
  if (isLive()) S.simMs = Date.now();
  const date = simDate();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  background(); hits = [];
  const key = viewKey(), k = { g, W, H, col, label, edgeMarker, hits, night: isNight(), ctx };
  if (key === 'earth') drawEarth(date); else if (key === 'moon') drawMoonScene(date); else if (key === 'face') drawMoonFace(k, S.face, date);
  else if (key === 'planet') drawPlanet(k, S.planet, date); else drawSolar(date);
  if (key === 'face' || key === 'planet') setHint();
  if (S.sel && !S.sel.id.startsWith('sat:')) {
    const h = hits.find(x => x.id === S.sel.id);
    if (h) { g.strokeStyle = col('#ffffff'); g.lineWidth = 1.6; g.beginPath(); g.arc(h.x, h.y, 14 + 2 * Math.sin(performance.now() / 260), 0, 2 * Math.PI); g.stroke(); }
  }
  const t = root.querySelector('#sp-time');
  const txt = isLive() ? 'Live · ' + fmtTime(date) : `${S.hold ? 'Paused · ' : ''}${fmtDay(date)}${date.getFullYear() !== new Date().getFullYear() ? ', ' + date.getFullYear() : ''} · ${fmtTime(date)}`;
  if (t.dataset.t !== txt) { t.textContent = txt; t.dataset.t = txt; }
  if (S.sel) {
    const box = root.querySelector('#sp-info');
    if (!box.dataset.live || performance.now() - +box.dataset.live > 500) { showInfo(); box.dataset.live = performance.now(); }
  }
}

/** Earth view: swing back so your own location faces you, at normal zoom. */
function faceHome() {
  const loc = ctx.location();
  S.yaw = loc.lon * RAD + SAT().gstime(simDate()); S.pitch = Math.max(-1.2, Math.min(1.2, loc.lat * RAD * 0.8));
  S.zoom.earth = 1; S.follow = false; S.earthTurned = false;
}

function setHint() {
  const key = viewKey();
  const txt = key === 'earth' ? `${sats.length ? sats.length + ' satellites · ' : ''}${Math.abs(speed()) >= ctx.config.space.orbitLinesSpeed ? 'sped up: satellites shown as orbit lines' : 'drag to spin · pinch to zoom · tap to identify'}`
    : key === 'face' ? `${S.face.caption}\n${S.face.tip}`
    : key === 'planet' ? S.planet.caption
    : 'View from above · drag to move · pinch to zoom';
  const el = root.querySelector('#sp-hint');
  if (el.dataset.t !== txt) { el.textContent = txt; el.dataset.t = txt; }
}

function controls() {
  const key = viewKey(), chip = (a, text, on = false, extra = '') => `<button class="chip ${on ? 'on' : ''}" data-a="${a}" ${extra}>${text}</button>`;
  root.querySelector('#sp-scenes').innerHTML = Object.entries(SCENES).map(([k, v]) => `<button data-scene="${k}" class="${k === S.scene ? 'on' : ''}">${v.label}</button>`).join('');
  // the shared speed bar
  root.querySelector('#sp-speed').innerHTML = `<button data-a="rewind" class="${S.dir < 0 && !liveMode() ? 'on' : ''}" aria-label="Rewind">◀◀</button>` +
    SPEEDS().map(([, l], i) => `<button data-speed="${i}" class="${i === S.speedIdx && !S.hold ? 'on' : ''}">${l}</button>`).join('');
  // picker row: which planet / which Moon view
  root.querySelector('#sp-pick').innerHTML = S.scene === 'solar'
    ? chip('planet', 'All', !S.planet.name, 'data-p=""') + PLANET_NAMES.map(n => chip('planet', n, S.planet.name === n, `data-p="${n}"`)).join('')
    : S.scene === 'moon' ? chip('face', 'Orbit', !S.face.on, 'data-v="0"') + chip('face', 'Close-up', S.face.on, 'data-v="1"') : '';
  // action row
  const acts = [], pn = key === 'planet' ? S.planet.pan : S.pan[key];
  if (key === 'earth' || key === 'moon') acts.push(chip('eclipse', 'Next eclipse ›'));
  if (key === 'earth' && S.earthTurned) acts.push(chip('ecenter', '◎ Recentre'));
  if (key === 'planet' && S.planet.turned && !S.planet.bino) acts.push(chip('precenter', '◎ Recentre'));
  if (key === 'solar') acts.push(chip('inner', S.zoom.solar > 2 ? 'All planets' : 'Inner planets'));
  if (key === 'planet') {
    if (PLANET_DATA[S.planet.name].moons.length && !S.planet.bino) acts.push(chip('pfit', S.planet.zoom < 0.7 ? 'Close-up' : 'Show moons'));
    acts.push(chip('bino', 'Through binoculars tonight', S.planet.bino));
  }
  if (key === 'face') {
    acts.push(chip('mtonight', 'Tonight’s view'), chip('names', S.face.names ? 'Names on' : 'Names off', S.face.names),
      chip('shadow', S.face.flat ? 'Shadow off' : 'Shadow on', !S.face.flat), chip('slide', S.face.slide ? 'Drag: slide' : 'Drag: spin', S.face.slide));
    if (S.face.turned) acts.push(chip('mreset', '◎ Recentre'));
  }
  if (pn && Math.hypot(pn[0], pn[1]) >= 20) acts.push(chip('recenter', '◎ Centre'));
  acts.push(chip('clean', '⛶ Clean view'));
  root.querySelector('#sp-acts').innerHTML = acts.join('');
  setHint();
}

/**
 * Clean view: hide every button, caption and bar (and the app's own top bar and tabs) so only the picture is left.
 * Drag, pinch and tap still work. The faint ✕ in the corner — or Android Back — brings everything back.
 */
function setClean(on) {
  S.clean = on;
  if (on) { S.sel = null; showInfo(); }
  root.classList.toggle('sp-clean', on);
  document.body.classList.toggle('sky-full', on); document.body.classList.toggle('sp-clean-on', on);
  setTimeout(() => { if (root) resize(); }, 60);                // the picture just got bigger (or smaller)
}

function showInfo() {
  const box = root.querySelector('#sp-info');
  if (!S.sel) { box.classList.add('hidden'); S.follow = false; return; }
  const h = hits.find(x => x.id === S.sel.id);
  // highlight ring for non-satellite picks (satellites draw their own)
  const inf = h ? h.info() : S.sel.last;
  if (!inf) { box.classList.add('hidden'); return; }
  S.sel.last = inf;
  const hiddenNote = h ? '' : '<div class="sub" style="margin-top:3px;color:var(--warn)">Out of view right now — it’ll come back around</div>';
  box.innerHTML = `<div class="si-head"><div class="big">${esc(inf.title)}</div><button class="x" data-back data-a="close">✕</button></div>${inf.lines.map(l => `<div class="sub" style="margin-top:3px">${esc(l)}</div>`).join('')}${hiddenNote}
    ${inf.follow ? `<div class="actions"><button class="btn small ${S.follow ? '' : 'ghost'}" data-a="follow">${S.follow ? 'Following ✓' : 'Follow it'}</button></div>` : ''}`;
  box.classList.remove('hidden');
}

function jumpToEclipse() {
  const d = eventData(ctx);
  const list = d.eclipses;
  if (!list.length) { toast('No eclipses found'); return; }
  const e = list.find(x => x.peak.getTime() > S.simMs + 55 * 60e3) || list[0];
  const date = e.peak;
  S.simMs = date.getTime() - 50 * 60e3;              // arrive a little early and watch it happen
  S.speedIdx = 1; S.dir = 1; S.hold = false;
  if (S.scene === 'earth') {
    const sv = A().GeoVector('Sun', date, true), sun = norm([sv.x, sv.y, sv.z]);
    const side = norm(cross(sun, [0, 0, 1]));
    const look = e.type === 'solar' ? norm(sun.map((c, i) => c + 0.25 * side[i])) : side;   // solar: face the day side · lunar: Moon off to one side
    S.yaw = Math.atan2(look[1], look[0]); S.pitch = Math.asin(look[2]); S.follow = false;
  }
  toast(`${e.title} · ${fmtDay(date)}, ${date.getFullYear()}`);
}

function pickAt(x, y) {
  if (S.clean) return;                                // nothing pops up in clean view
  let best = null, bd = 30;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y) - h.pri; if (d < bd) { bd = d; best = h; } }
  S.follow = false;
  S.sel = best ? { id: best.id } : null;
  showInfo();
}

/** "Through binoculars tonight" / "Tonight's view": jump to a good moment tonight and freeze there. */
function jumpTonight(body) {
  const bt = bestTonight(body, ctx.location(), new Date());
  if (!bt) { goLive(); return `${body === 'Moon' ? 'The Moon' : body} isn’t up after dark tonight — showing it as it is right now`; }
  if (bt.now) { goLive(); return 'It’s up right now — this is live'; }
  holdAt(bt.date);
  return `Best tonight around ${fmtTime(bt.date)}, when it’s highest in the dark`;
}

function onClick(e) {
  const b = e.target.closest('[data-scene],[data-speed],[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (b.dataset.scene) { S.scene = b.dataset.scene; S.sel = null; showInfo(); if (liveMode()) S.simMs = Date.now(); }
  else if (b.dataset.speed) { S.speedIdx = +b.dataset.speed; S.hold = false; if (S.speedIdx === 0) goLive(); }
  else if (a === 'rewind') { if (liveMode()) { S.speedIdx = 1; S.dir = -1; } else { S.dir = -S.dir; S.hold = false; } }
  else if (a === 'eclipse') { jumpToEclipse(); }
  else if (a === 'inner') { S.zoom.solar = S.zoom.solar > 2 ? 1 : 3.4; S.pan.solar = [0, 0]; }
  else if (a === 'recenter') { if (viewKey() === 'planet') S.planet.pan = [0, 0]; else if (S.pan[S.scene]) S.pan[S.scene] = [0, 0]; }
  else if (a === 'close') { S.sel = null; showInfo(); }
  else if (a === 'follow') { S.follow = !S.follow; showInfo(); }
  else if (a === 'planet') {
    const was = S.planet.bino;
    Object.assign(S.planet, { name: b.dataset.p || null, zoom: 1, pan: [0, 0], yaw: 0, pitch: 0, turned: false, bino: false, binoNote: '' });
    S.sel = null; showInfo(); if (was) goLive();
  }
  else if (a === 'precenter') { Object.assign(S.planet, { yaw: 0, pitch: 0, turned: false, pan: [0, 0] }); }
  else if (a === 'ecenter') { faceHome(); }
  else if (a === 'pfit') { S.planet.zoom = S.planet.zoom < 0.7 ? 1 : fitZoom(S.planet.name, W, H); S.planet.pan = [0, 0]; }
  else if (a === 'bino') {
    S.planet.bino = !S.planet.bino; S.sel = null; showInfo();
    if (S.planet.bino) S.planet.binoNote = jumpTonight(S.planet.name); else goLive();
  }
  else if (a === 'face') { S.face.on = b.dataset.v === '1'; S.sel = null; showInfo(); }
  else if (a === 'mtonight') { Object.assign(S.face, { yaw: 0, pitch: 0, pan: [0, 0], turned: false, flat: false }); toast(jumpTonight('Moon')); }
  else if (a === 'mreset') { Object.assign(S.face, { yaw: 0, pitch: 0, pan: [0, 0], turned: false }); }
  else if (a === 'shadow') { S.face.flat = !S.face.flat; }
  else if (a === 'slide') { S.face.slide = !S.face.slide; toast(S.face.slide ? 'Drag slides the Moon across the screen' : 'Drag spins the Moon'); }
  else if (a === 'names') { S.face.names = !S.face.names; }
  else if (a === 'clean') { setClean(!S.clean); }
  controls();
}

const zoomOf = () => { const k = viewKey(); return k === 'planet' ? S.planet.zoom : k === 'face' ? S.face.zoom : S.zoom[k]; };
function setZoom(z) {
  const key = viewKey();
  const [min, max] = key === 'planet' ? [0.02, 14] : key === 'face' ? [0.6, 6] : key === 'solar' ? [0.5, 12] : [0.5, 6];
  const nz = Math.max(min, Math.min(max, z)), kf = nz / zoomOf();
  if (key === 'planet') { S.planet.pan = S.planet.pan.map(v => v * kf); S.planet.zoom = nz; controls(); return; }   // zoom around the middle of the screen
  if (key === 'face') { S.face.pan = S.face.pan.map(v => v * kf); S.face.zoom = nz; return; }
  if (S.pan[key]) S.pan[key] = S.pan[key].map(v => v * kf);
  S.zoom[key] = nz;
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
      if (lastDist) setZoom(zoomOf() * d / lastDist);
      lastDist = d; if (start) start.moved = true;
      if (viewKey() === 'face') {                      // two fingers also slide the Moon across the screen
        S.face.pan[0] += dx / 2; S.face.pan[1] += dy / 2; S.face.dragging = true;
        if (!S.face.turned) { S.face.turned = true; controls(); }
      }
    } else if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 6) {
      start.moved = true;
      const key = viewKey();
      if (key === 'earth') { S.follow = false; S.yaw -= dx * 0.006; S.pitch = Math.max(-1.45, Math.min(1.45, S.pitch + dy * 0.006)); if (!S.earthTurned) { S.earthTurned = true; controls(); } }
      else if (key === 'planet') {                     // fly around the planet: the surface follows your finger
        if (S.planet.bino) return;
        const kf = 0.9 / Math.max(40, Math.min(W, H) * 0.2 * S.planet.zoom);
        S.planet.yaw -= dx * kf; S.planet.pitch = Math.max(-1.5, Math.min(1.5, S.planet.pitch + dy * kf)); S.planet.dragging = true;
        if (!S.planet.turned) { S.planet.turned = true; controls(); }
      }
      else if (key === 'face') {                       // spin the Moon (the surface follows your finger) — or slide it, if that's switched on
        const kf = 0.9 / (Math.min(W, H) * 0.4 * S.face.zoom);
        if (S.face.slide) { S.face.pan[0] += dx; S.face.pan[1] += dy; }
        else { S.face.yaw -= dx * kf; S.face.pitch = Math.max(-1.5, Math.min(1.5, S.face.pitch + dy * kf)); }
        if (!S.face.dragging) { S.face.dragging = true; } if (!S.face.turned) { S.face.turned = true; controls(); }
      }
      else { const p = key === 'planet' ? S.planet.pan : S.pan[key]; p[0] += dx; p[1] += dy; controls(); }
    }
  });
  cv.addEventListener('pointerup', (e) => {
    if (pointers.size === 1 && start && !start.moved) {
      const r = cv.getBoundingClientRect(); pickAt(e.clientX - r.left, e.clientY - r.top);
    }
    pointers.delete(e.pointerId); if (pointers.size < 2) lastDist = 0; start = null; S.face.dragging = false; S.planet.dragging = false;
  });
  cv.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); start = null; S.face.dragging = false; S.planet.dragging = false; });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(zoomOf() * (e.deltaY > 0 ? 0.9 : 1.1)); }, { passive: false });
}

export const spaceView = {
  id: 'space', title: 'Space', icon: icons.space,
  mount(el, c) {
    ctx = c; mounted = true; last = 0;
    el.classList.add('edge');
    el.innerHTML = `<div class="sky-wrap sp-wrap">
      <canvas id="sp-cv"></canvas>
      <div class="sky-top"><div class="seg" id="sp-scenes"></div><div id="sp-time" class="sp-time"></div></div>
      <div class="sp-bar"><div class="chips" id="sp-pick"></div><div class="sp-acts" id="sp-acts"></div><div id="sp-hint" class="sp-hint"></div></div>
      <div id="sp-info" class="sky-info hidden"></div>
      <div class="sky-time" id="sp-speed"></div>
      <button class="chip sp-exit" data-back data-a="clean" aria-label="Show the buttons again">✕</button>
    </div>`;
    root = el.querySelector('.sp-wrap'); cv = root.querySelector('#sp-cv'); g = cv.getContext('2d');
    if (S.yaw === null) faceHome();   // start with your side of the planet facing you
    if (liveMode()) S.simMs = Date.now();
    root.addEventListener('click', onClick);
    bindPointer(); resize(); window.addEventListener('resize', resize);
    S.clean = false; ensureData(); controls();
    this._off = ctx.bus.on('sats', () => { buildSats(); controls(); });
    this._off2 = ctx.bus.on('iss', () => { buildSats(); controls(); });
    raf = requestAnimationFrame(frame);
  },
  tick() { /* animates itself */ },
  unmount() {
    mounted = false; cancelAnimationFrame(raf); window.removeEventListener('resize', resize);
    if (this._off) this._off(); if (this._off2) this._off2();
    if (root && root.parentElement) root.parentElement.classList.remove('edge');
    document.body.classList.remove('sky-full', 'sp-clean-on');
    root = null; cv = null; g = null; pointers.clear();
  },
};
