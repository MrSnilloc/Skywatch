// views/spacePlanet.js — one planet up close, with its moons (part of the Space tab's "Solar system" view).
//   Close-up        : the planet's disc (a real surface map when one is installed, see planetTextures.js) with its
//                     real phase, tilt and spin, moons in their real places, Saturn's rings at their true angle, and
//                     the moons' shadows on Jupiter. It starts as the view from Earth (north up, east left); drag
//                     to fly around the planet, and Recentre to come back.
//   Binoculars mode : what you'd actually see from the backyard tonight — "up" is up in your sky, the planet is a
//                     bright dot, and only moons bright enough (and far enough from the glare) are drawn.
// All positions come from ../moons.js. The Space screen (space.js) owns the canvas, time and gestures and hands
// this file a small drawing kit `k`: { g, W, H, col, label, edgeMarker, hits, night, ctx }.

import { planetSystem, PLANETS } from '../moons.js';
import { planetTexture, ringTexture } from '../planetTextures.js';
import { dirName } from '../sky.js';
import { fmtTime } from '../time.js';

const RAD = Math.PI / 180;
const MOON_COLOR = { Io: '#f2e08a', Europa: '#e8e2d0', Ganymede: '#cfc4b0', Callisto: '#a89c8c', Titan: '#f0b060', Triton: '#f3d9d0' };
const STATE_TEXT = { visible: 'In view', transit: 'Crossing in front of the planet right now', behind: 'Hidden behind the planet right now', eclipsed: 'In the planet’s shadow right now — it has faded out' };

// ---------- the planet's disc (shaded sphere with cloud bands) ----------
/** Surface colour at a latitude (degrees). */
function surface(name, lat) {
  const a = Math.abs(lat), blend = (c1, c2, t) => c1.map((v, i) => v + (c2[i] - v) * Math.max(0, Math.min(1, t)));
  switch (name) {
    case 'Jupiter': {
      let c = [236, 218, 186];
      const belt = (lo, hi, colr, s = 2.5) => { const t = Math.min((a - lo) / s, (hi - a) / s); if (t > 0) c = blend(c, colr, t); };
      belt(7, 19, lat > 0 ? [170, 112, 78] : [182, 128, 92]); belt(26, 34, [205, 170, 132]); belt(42, 49, [200, 176, 146]);
      return a > 56 ? blend(c, [150, 144, 140], (a - 56) / 18) : c;
    }
    case 'Saturn': {
      let c = [232, 210, 158];
      if (a > 12 && a < 26) c = blend(c, [206, 182, 130], Math.min((a - 12) / 4, (26 - a) / 4));
      if (a > 38 && a < 48) c = blend(c, [214, 192, 142], Math.min((a - 38) / 3, (48 - a) / 3));
      return a > 62 ? blend(c, [178, 168, 132], (a - 62) / 16) : c;
    }
    case 'Mars': return a > 76 ? blend([204, 108, 72], [244, 240, 236], (a - 76) / 6) : blend([204, 108, 72], [170, 86, 58], 0.5 + 0.5 * Math.sin(lat * 0.21));
    case 'Venus': return [246, 234, 202];
    case 'Mercury': return [164, 156, 148];
    case 'Uranus': return blend([166, 228, 234], [190, 238, 240], a / 90);
    case 'Neptune': return blend([70, 112, 232], [96, 140, 240], 0.5 + 0.5 * Math.sin(lat * 0.16));
    default: return [200, 200, 200];
  }
}

/** The viewer: starts looking from Earth (north up), then turned by the user's drag (st.yaw, st.pitch). */
function camera(sys, st) {
  const up0 = sys.north, d0 = sys.toEarth, r0 = cross(up0, d0);
  const d1 = mixv(d0, r0, Math.cos(st.yaw), Math.sin(st.yaw)), right = cross(up0, d1);
  return { d: mixv(d1, up0, Math.cos(st.pitch), Math.sin(st.pitch)), up: mixv(up0, d1, Math.cos(st.pitch), -Math.sin(st.pitch)), right };
}

let disc = null, discG = null, discKey = '';
/** Render the lit globe into a small off-screen picture as the camera sees it. Re-used while nothing changes. */
function renderDisc(sys, cam, n, night) {
  const tex = planetTexture(sys.name), lon0 = mapShift(sys.name, sys.date) / 360;
  const body = (v) => [dot(v, sys.xb), dot(v, sys.yb), dot(v, sys.pole)];       // into the planet's own axes
  const R = body(cam.right), U = body(cam.up), D = body(cam.d), S = body(sys.sunDir);
  const key = [sys.name, n, night, !!tex, ...R, ...U, ...S].map(v => (typeof v === 'number' ? v.toFixed(3) : v)).join(',');
  if (key === discKey) return disc;
  if (!disc || disc.width !== n) { disc = document.createElement('canvas'); disc.width = disc.height = n; discG = disc.getContext('2d'); }
  const img = discG.createImageData(n, n), d = img.data;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, w = 1 - (j + 0.5) / n * 2, rr = u * u + w * w, q = (j * n + i) * 4;
    if (rr > 1) { d[q + 3] = 0; continue; }
    const z = Math.sqrt(1 - rr);
    const x = u * R[0] + w * U[0] + z * D[0], y = u * R[1] + w * U[1] + z * D[1], zz = u * R[2] + w * U[2] + z * D[2];
    const l = x * S[0] + y * S[1] + zz * S[2], sinLat = Math.max(-1, Math.min(1, zz));
    const lit = Math.max(0, Math.min(1, (l + 0.02) / 0.1)) * (0.4 + 0.6 * Math.max(0, l)) * (0.62 + 0.38 * z);
    let c;
    if (tex) {                                           // look the spot up on the real map (4 nearest dots blended)
      let fu = (Math.atan2(y, x) / (2 * Math.PI) + 0.5 + lon0) % 1; if (fu < 0) fu += 1;
      const fx = fu * tex.w - 0.5, fy = Math.max(0, Math.min(tex.h - 1.001, (0.5 - Math.asin(sinLat) / Math.PI) * tex.h - 0.5));
      const i0 = Math.floor(fx), j0 = Math.floor(fy), tx = fx - i0, ty = fy - j0;
      const a = (j0 * tex.w + ((i0 % tex.w) + tex.w) % tex.w) * 4, b = (j0 * tex.w + (i0 + 1) % tex.w) * 4, a2 = a + tex.w * 4, b2 = b + tex.w * 4, t = tex.data;
      const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
      c = [t[a] * w00 + t[b] * w10 + t[a2] * w01 + t[b2] * w11, t[a + 1] * w00 + t[b + 1] * w10 + t[a2 + 1] * w01 + t[b2 + 1] * w11, t[a + 2] * w00 + t[b + 2] * w10 + t[a2 + 2] * w01 + t[b2 + 2] * w11];
    } else c = surface(sys.name, Math.asin(sinLat) / RAD);
    const f = 0.025 + 0.975 * lit * (tex ? 1.12 : 1);
    let r = Math.min(255, c[0] * f), gg = Math.min(255, c[1] * f), b3 = Math.min(255, c[2] * f);
    if (night) { const L = 0.3 * r + 0.55 * gg + 0.15 * b3; r = L * 1.1; gg = L * 0.12; b3 = L * 0.08; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = b3; d[q + 3] = rr > 0.97 ? 255 * (1 - rr) / 0.03 : 255;
  }
  discG.putImageData(img, 0, 0); discKey = key;
  return disc;
}
let spaceCfg = null;
/** Where the Great Red Spot is now (System II west longitude, degrees): it drifts steadily, so start from a known date. */
export function redSpotLon(cfg, date) {
  const s = cfg.jupiterSpot;
  return s.lonSys2 + s.driftPerYear * (date.getTime() - Date.parse(s.at)) / (365.25 * 86400000);
}
/** How far to slide a planet's map sideways (degrees) so its features sit at their true longitudes. */
function mapShift(name, date) {
  if (!spaceCfg) return 0;
  const extra = spaceCfg.textureLonShift[name] || 0;
  return name === 'Jupiter' ? redSpotLon(spaceCfg, date) - spaceCfg.jupiterSpot.mapLonWest + extra : extra;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mixv = (a, b, ca, cb) => [a[0] * ca + b[0] * cb, a[1] * ca + b[1] * cb, a[2] * ca + b[2] * cb];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------- shared: info text ----------
function planetLines(sys) {
  const lines = [`${sys.distAu.toFixed(2)} AU away · ${(sys.arcsecRadius * 2).toFixed(1)}″ across · magnitude ${sys.mag.toFixed(1)}`,
    `${Math.round(sys.phaseFraction * 100)}% of the side facing us is lit`];
  if (sys.info.rings) lines.push(`Rings tilted ${Math.abs(sys.ringTilt).toFixed(1)}° — we see their ${sys.ringTilt >= 0 ? 'north' : 'south'} face`);
  lines.push(sys.info.blurb);
  return lines;
}
function moonLines(sys, m, cfg) {
  const period = m.period || 360 / m.rate;
  return [STATE_TEXT[m.state], `${Math.round(m.distKm).toLocaleString()} km from ${sys.name} (${(m.distKm / sys.radiusKm).toFixed(1)} planet-widths out) · one lap every ${period < 2 ? (period * 24).toFixed(1) + ' hours' : period.toFixed(1) + ' days'}`,
    `${m.blurb} · magnitude ${m.mag.toFixed(1)} — ${m.mag <= cfg.binoMagLimit ? 'bright enough for binoculars' : 'needs a telescope'}`,
    m.exact ? 'Position: exact' : 'Position: close estimate (within a few degrees along its orbit)'];
}
const PERIODS = { Io: 1.769, Europa: 3.551, Ganymede: 7.155, Callisto: 16.689 };
const withPeriod = (m) => (PERIODS[m.name] ? { ...m, period: PERIODS[m.name] } : m);

// ---------- close-up ----------
/** Zoom factor that fits the outermost moon on screen. */
export function fitZoom(name, W, H) {
  const far = Math.max(1.6, ...PLANETS[name].moons.map(m => (m.a || { Io: 421800, Europa: 671100, Ganymede: 1070400, Callisto: 1882700 }[m.name]) / PLANETS[name].radiusKm));
  return (Math.min(W, H) / 2 - 44) / far / (Math.min(W, H) * 0.2);
}

export function drawPlanet(k, st, date) {
  const { g, W, H, col } = k, cfg = k.ctx.config.space;
  const sys = planetSystem(st.name, date, k.ctx.location());
  if (st.bino) return drawBinoculars(k, st, sys, date);
  spaceCfg = cfg; sys.date = date;
  const cam = camera(sys, st), turned = Math.abs(st.yaw) > 0.02 || Math.abs(st.pitch) > 0.02;
  const R = Math.min(W, H) * 0.2 * st.zoom, cx = W / 2, cy = H / 2;
  /** A point in space (km from the planet's centre) -> where it is on screen, and how far toward the viewer. */
  const proj = (km) => ({ x: cx + dot(km, cam.right) / sys.radiusKm * R, y: cy - dot(km, cam.up) / sys.radiusKm * R, z: dot(km, cam.d) / sys.radiusKm });
  // how the planet's north pole and equator sit as this camera sees them (for the squashed shape and the rings)
  const pa = Math.atan2(-dot(sys.pole, cam.right), dot(sys.pole, cam.up)), B = Math.asin(Math.max(-1, Math.min(1, dot(sys.pole, cam.d))));
  const flat = 1 - sys.info.flat * Math.cos(B) ** 2;

  const ringHalf = (front) => {
    if (!sys.info.rings) return;
    g.save(); g.translate(cx, cy); g.rotate(-pa);
    const nearDown = B >= 0;                                        // north face showing: the near half hangs below centre
    g.beginPath(); g.rect(-W * 4, (front === nearDown) ? 0 : -H * 4, W * 8, H * 4); g.clip();
    const sb = Math.abs(Math.sin(B)), annulus = (r0, r1) => { g.beginPath(); g.ellipse(0, 0, r1 * R, Math.max(0.4, r1 * R * sb), 0, 0, 2 * Math.PI); g.ellipse(0, 0, r0 * R, Math.max(0.3, r0 * R * sb), 0, 0, 2 * Math.PI); g.fill('evenodd'); };
    const rt = ringTexture();
    if (rt) {                                                       // real ring picture: a strip from inner edge to outer edge
      const [rin, rout] = cfg.ringSpan, steps = Math.max(24, Math.min(110, Math.round((rout - rin) * R / 1.5))), row = Math.floor(rt.h / 2) * rt.w;
      for (let q = 0; q < steps; q++) {
        const p = (row + Math.min(rt.w - 1, Math.floor((q + 0.5) / steps * rt.w))) * 4, al = rt.data[p + 3] / 255;
        if (al < 0.03) continue;
        const hex = '#' + [0, 1, 2].map(c => rt.data[p + c].toString(16).padStart(2, '0')).join('');
        g.globalAlpha = al * (front ? 1 : 0.9); g.fillStyle = col(hex);
        annulus(rin + (rout - rin) * q / steps, rin + (rout - rin) * (q + 1) / steps + 0.004);
      }
    } else for (const [r0, r1, op] of sys.info.rings) { g.globalAlpha = op * (front ? 1 : 0.85); g.fillStyle = col('#e2d0a0'); annulus(r0, r1); }
    g.globalAlpha = 1; g.restore();
  };
  // name tags never sit on top of each other: a tag that would overlap is nudged down a line
  const tags = [], edgeN = [0, 0];
  const tag = (text, x, y, color, font = '600 11px system-ui') => {
    g.font = font; const w = g.measureText(text).width; x = Math.max(4, Math.min(W - w - 4, x));
    while (tags.some(t => x < t[0] + t[2] + 4 && x + w + 4 > t[0] && Math.abs(y - t[1]) < 13)) y += 13;
    tags.push([x, y, w]); k.label(text, x, y, color, font);
  };
  const drawMoon = (m) => {
    const { x, y } = m.scr, r = Math.max(2, m.radiusKm / sys.radiusKm * R), c = MOON_COLOR[m.name] || '#e4e0d6';
    const on = x > 6 && x < W - 6 && y > 150 && y < H - 70;
    if (!on) {                                                      // off-screen: an arrow at the edge pointing its way
      const dx = x - W / 2, dy = y - H / 2, f = Math.min((W / 2 - 16) / Math.max(1e-6, Math.abs(dx)), (H / 2 - 110) / Math.max(1e-6, Math.abs(dy)));
      const ex = W / 2 + dx * f, side = dx > 0 ? 1 : 0, ey = H / 2 + dy * f + 15 * edgeN[side]++;      // several moons the same way: stack the arrows
      g.save(); g.translate(ex, ey); g.rotate(Math.atan2(dy, dx)); g.fillStyle = col(c); g.beginPath(); g.moveTo(9, 0); g.lineTo(-5, -6); g.lineTo(-5, 6); g.closePath(); g.fill(); g.restore();
      tag(m.name, ex + (dx > 0 ? -14 - g.measureText(m.name).width : 14), ey + 4, c);
      return;
    }
    if (m.state === 'eclipsed') { g.strokeStyle = col('#7d8798'); g.lineWidth = 1; g.beginPath(); g.arc(x, y, r + 1, 0, 2 * Math.PI); g.stroke(); tag(m.name + ' (in shadow)', x + r + 5, y + 4, '#7d8798', '10px system-ui'); }
    else {
      g.fillStyle = col(c); g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
      if (m.scr.z > 0 && m.onDisc) { g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }
      tag(m.name, x + r + 5, y + 4, c);
    }
    k.hits.push({ x, y, pri: 12, id: 'pm:' + m.name, info: () => ({ title: m.name, lines: moonLines(sys, withPeriod(m), cfg) }) });
  };

  // where each moon is for THIS camera (which may have been turned away from the Earth view)
  const moons = sys.moons.map(m => { const scr = proj(m.km); return { ...m, scr, onDisc: Math.hypot(scr.x - cx, scr.y - cy) < R }; });
  ringHalf(false);
  for (const m of moons) if (m.scr.z <= 0 && !m.onDisc) drawMoon(m);
  // the planet
  const n = Math.max(48, Math.min(st.dragging ? 170 : 300, Math.round(R * 1.25)));
  g.save(); g.translate(cx, cy); g.rotate(-pa); g.scale(1, flat); g.rotate(pa);
  g.imageSmoothingEnabled = true; g.drawImage(renderDisc(sys, cam, n, k.night), -R, -R, 2 * R, 2 * R); g.restore();
  // moon shadows on the cloud tops
  for (const m of moons) if (m.shadowKm) {
    const p = proj(m.shadowKm); if (p.z <= 0.05) continue;
    const r = Math.max(2, m.radiusKm / sys.radiusKm * R * 1.1);
    g.fillStyle = '#000'; g.beginPath(); g.arc(p.x, p.y, r, 0, 2 * Math.PI); g.fill();
    if (R > 60) k.label(m.name + '’s shadow', p.x + r + 4, p.y - r - 3, '#c9d3e6', '10px system-ui');
    k.hits.push({ x: p.x, y: p.y, pri: 8, id: 'ps:' + m.name, info: () => ({ title: `${m.name}’s shadow`, lines: [`${m.name} is between ${sys.name} and the Sun, so its shadow falls on the planet.`, 'Standing in that spot you would see a total solar eclipse.'] }) });
  }
  ringHalf(true);
  for (const m of moons) if (m.scr.z > 0) drawMoon(m);
  k.hits.push({ x: cx, y: cy, pri: Math.min(22, R * 0.5), id: 'planet:' + sys.name, info: () => ({ title: sys.name, lines: planetLines(sys) }) });

  // caption
  const hidden = sys.moons.filter(m => m.state === 'behind').map(m => m.name);
  const shadows = sys.moons.filter(m => m.shadow).map(m => m.name);
  let spot = '';
  if (sys.name === 'Jupiter') { const off = ((sys.centralMeridian - redSpotLon(cfg, date) + 540) % 360) - 180; spot = Math.abs(off) < 55 ? ' · Great Red Spot facing Earth' : ' · Great Red Spot on the far side'; }
  st.turned = turned;
  st.caption = `${Math.round(sys.phaseFraction * 100)}% lit · ${(sys.arcsecRadius * 2).toFixed(0)}″ across` +
    spot + (shadows.length ? ` · shadow on the planet: ${shadows.join(', ')}` : '') + (hidden.length ? ` · behind the planet (from Earth): ${hidden.join(', ')}` : '') +
    (turned ? '\nYou’ve flown around it — tap Recentre for the view from Earth' : ' · north up, east left · drag to fly around');
}

// ---------- "Through binoculars tonight" ----------
function drawBinoculars(k, st, sys, date) {
  const { g, W, H, col } = k, cfg = k.ctx.config.space;
  const Rf = Math.min(W / 2 - 14, (H - 250) / 2), cx = W / 2, cy = Math.max(Rf + 120, H / 2 - 10);
  const pxPerRadius = Rf / (cfg.binoFieldArcmin * 30) * sys.arcsecRadius;      // screen pixels per planet radius
  const q = (sys.zenithAngle || 0) * RAD;
  const S2 = (x, y) => { const up = x * Math.sin(q) + y * Math.cos(q), left = x * Math.cos(q) - y * Math.sin(q); return [cx - left * pxPerRadius, cy - up * pxPerRadius]; };

  // the round field of view
  g.save(); g.beginPath(); g.arc(cx, cy, Rf, 0, 2 * Math.PI); g.clip();
  g.fillStyle = col('#060c18'); g.fillRect(cx - Rf, cy - Rf, 2 * Rf, 2 * Rf);
  const up = sys.alt > 0;
  const pr = Math.max(2.6, pxPerRadius), pc = k.ctx.config.sky.planetColors[sys.name] || '#ffffff';
  const glow = g.createRadialGradient(cx, cy, pr * 0.5, cx, cy, pr * 4 + 10);
  glow.addColorStop(0, col(pc)); glow.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = up ? 0.55 : 0.2; g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, pr * 4 + 10, 0, 2 * Math.PI); g.fill(); g.globalAlpha = up ? 1 : 0.4;
  g.fillStyle = col(pc); g.beginPath(); g.arc(cx, cy, pr, 0, 2 * Math.PI); g.fill();
  if (sys.info.rings && pr > 2) { g.strokeStyle = col('#e2d0a0'); g.lineWidth = 1.2; g.save(); g.translate(cx, cy); g.rotate(q - sys.poleAngle * RAD); g.beginPath(); g.ellipse(0, 0, pr * 2.2, Math.max(0.6, pr * 2.2 * Math.abs(Math.sin(sys.ringTilt * RAD))), 0, 0, 2 * Math.PI); g.stroke(); g.restore(); }

  const seen = [], glare = [], faint = [], hid = [];
  for (const m of sys.moons) {
    if (m.mag > cfg.binoMagLimit) { faint.push(m.name); continue; }
    if (m.state !== 'visible') { hid.push(m.name); continue; }
    if (m.sep < cfg.binoGlareRadii) { glare.push(m.name); continue; }
    seen.push(m.name);
    const [x, y] = S2(m.x, m.y), r = Math.max(1.4, 3.4 - (m.mag - 4.5) * 0.45);
    g.fillStyle = col('#f4f1e6'); g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    k.label(m.name, x + r + 4, y - r - 2, '#cfd8ea', '600 11px system-ui');
    k.hits.push({ x, y, pri: 12, id: 'pm:' + m.name, info: () => ({ title: m.name, lines: moonLines(sys, withPeriod(m), cfg) }) });
  }
  g.restore(); g.globalAlpha = 1;
  g.strokeStyle = col('#3a4d6e'); g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, Rf, 0, 2 * Math.PI); g.stroke();
  k.label('up', cx - 7, cy - Rf + 14, '#6f86a8', '10px system-ui');
  k.hits.push({ x: cx, y: cy, pri: 14, id: 'planet:' + sys.name, info: () => ({ title: sys.name, lines: planetLines(sys) }) });

  // what you'd see, in words
  const lines = [];
  lines.push(up ? `${sys.name} is ${dirName(sys.az)}, ${Math.round(sys.alt)}° up at ${fmtTime(date)}` : `${sys.name} is below the horizon at ${fmtTime(date)}`);
  if (st.binoNote) lines.push(st.binoNote);
  if (!sys.moons.length) lines.push(sys.name === 'Venus' && sys.arcsecRadius * 2 > 35 ? 'No moons — but steady binoculars can just show Venus as a tiny crescent right now.' : 'No moons. In binoculars it is a bright, steady dot.');
  if (seen.length) lines.push(`You can see: ${seen.join(', ')}`);
  if (glare.length) lines.push(`Lost in ${sys.name}’s glare: ${glare.join(', ')}`);
  if (hid.length) lines.push(`Hidden (behind, in front of, or in the shadow of ${sys.name}): ${hid.join(', ')}`);
  if (faint.length) lines.push(`Too faint for binoculars: ${faint.join(', ')}`);
  let y = cy + Rf + 22;
  g.textAlign = 'center';
  lines.forEach((t, i) => { for (const part of wrap(g, t, W - 28, i === 0 ? '600 13px system-ui' : '12px system-ui')) { k.label(part, W / 2, y, i === 0 ? '#e8eef9' : '#9fb0c8', i === 0 ? '600 13px system-ui' : '12px system-ui'); y += 17; } });
  g.textAlign = 'start';
  st.caption = `The middle ${cfg.binoFieldArcmin}′ of a binocular view, magnified · hold binoculars steady (lean on something)`;
}

function wrap(g, text, maxW, font) {
  g.font = font;
  const out = []; let line = '';
  for (const w of text.split(' ')) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; }
  if (line) out.push(line);
  return out;
}
