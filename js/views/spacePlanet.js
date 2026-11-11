// views/spacePlanet.js — one planet up close, with its moons (part of the Space tab's "Solar system" view).
//   Close-up        : the planet's disc with its real phase and tilt, moons in their real places, Saturn's rings
//                     at their true angle, and the moons' shadows on Jupiter. North is up, east is left.
//   Binoculars mode : what you'd actually see from the backyard tonight — "up" is up in your sky, the planet is a
//                     bright dot, and only moons bright enough (and far enough from the glare) are drawn.
// All positions come from ../moons.js. The Space screen (space.js) owns the canvas, time and gestures and hands
// this file a small drawing kit `k`: { g, W, H, col, label, edgeMarker, hits, night, ctx }.

import { planetSystem, PLANETS } from '../moons.js';
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

let disc = null, discG = null, discKey = '';
/** Render the lit disc into a small off-screen picture (north up, west right). Re-used while nothing changes. */
function renderDisc(sys, n, night) {
  const west = sys.east.map(c => -c), v3 = (v) => [dot(v, west), dot(v, sys.north), dot(v, sys.toEarth)];
  const sun = v3(sys.sunDir), pole = v3(sys.pole);
  const key = [sys.name, n, night, ...sun.map(c => c.toFixed(3)), ...pole.map(c => c.toFixed(3))].join(',');
  if (key === discKey) return disc;
  if (!disc || disc.width !== n) { disc = document.createElement('canvas'); disc.width = disc.height = n; discG = disc.getContext('2d'); }
  const img = discG.createImageData(n, n), d = img.data;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n * 2 - 1, w = 1 - (j + 0.5) / n * 2, rr = u * u + w * w, q = (j * n + i) * 4;
    if (rr > 1) { d[q + 3] = 0; continue; }
    const z = Math.sqrt(1 - rr);
    const l = u * sun[0] + w * sun[1] + z * sun[2];
    const lat = Math.asin(Math.max(-1, Math.min(1, u * pole[0] + w * pole[1] + z * pole[2]))) / RAD;
    const lit = Math.max(0, Math.min(1, (l + 0.02) / 0.1)) * (0.35 + 0.65 * Math.max(0, l)) * (0.6 + 0.4 * z);
    const c = surface(sys.name, lat), f = 0.03 + 0.97 * lit;
    let r = c[0] * f, gg = c[1] * f, b = c[2] * f;
    if (night) { const L = 0.3 * r + 0.55 * gg + 0.15 * b; r = L * 1.1; gg = L * 0.12; b = L * 0.08; }
    d[q] = r; d[q + 1] = gg; d[q + 2] = b; d[q + 3] = rr > 0.97 ? 255 * (1 - rr) / 0.03 : 255;
  }
  discG.putImageData(img, 0, 0); discKey = key;
  return disc;
}
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
  const R = Math.min(W, H) * 0.2 * st.zoom, cx = W / 2 + st.pan[0], cy = H / 2 + st.pan[1];
  const S2 = (x, y) => [cx - x * R, cy - y * R];                     // sky offsets (planet radii) -> screen; east is left
  const pa = sys.poleAngle * RAD, B = sys.ringTilt * RAD, flat = 1 - sys.info.flat * Math.cos(B) ** 2;

  const ringHalf = (front) => {
    if (!sys.info.rings) return;
    g.save(); g.translate(cx, cy); g.rotate(-pa);
    const nearDown = B >= 0;                                        // north face showing: the near half hangs below centre
    g.beginPath(); g.rect(-W * 4, (front === nearDown) ? 0 : -H * 4, W * 8, H * 4); g.clip();
    for (const [r0, r1, op] of sys.info.rings) {
      g.beginPath();
      g.ellipse(0, 0, r1 * R, Math.max(0.5, r1 * R * Math.abs(Math.sin(B))), 0, 0, 2 * Math.PI);
      g.ellipse(0, 0, r0 * R, Math.max(0.3, r0 * R * Math.abs(Math.sin(B))), 0, 0, 2 * Math.PI);
      g.globalAlpha = op * (front ? 1 : 0.85); g.fillStyle = col('#e2d0a0'); g.fill('evenodd');
    }
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
    const [x, y] = S2(m.x, m.y), r = Math.max(2, m.radiusKm / sys.radiusKm * R), c = MOON_COLOR[m.name] || '#e4e0d6';
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
      if (m.state === 'transit') { g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke(); }
      tag(m.name, x + r + 5, y + 4, c);
    }
    k.hits.push({ x, y, pri: 12, id: 'pm:' + m.name, info: () => ({ title: m.name, lines: moonLines(sys, withPeriod(m), cfg) }) });
  };

  ringHalf(false);
  for (const m of sys.moons) if (m.z <= 0 && m.state !== 'behind') drawMoon(m);
  // the planet
  const n = Math.max(48, Math.min(280, Math.round(R * 1.2)));
  g.save(); g.translate(cx, cy); g.rotate(-pa); g.scale(1, flat); g.rotate(pa);
  g.imageSmoothingEnabled = true; g.drawImage(renderDisc(sys, n, k.night), -R, -R, 2 * R, 2 * R); g.restore();
  // moon shadows on the cloud tops
  for (const m of sys.moons) if (m.shadow) {
    const [x, y] = S2(m.shadow.x, m.shadow.y), r = Math.max(2, m.radiusKm / sys.radiusKm * R * 1.1);
    g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r, 0, 2 * Math.PI); g.fill();
    if (R > 60) k.label(m.name + '’s shadow', x + r + 4, y - r - 3, '#c9d3e6', '10px system-ui');
    k.hits.push({ x, y, pri: 8, id: 'ps:' + m.name, info: () => ({ title: `${m.name}’s shadow`, lines: [`${m.name} is between ${sys.name} and the Sun, so its shadow falls on the planet.`, 'Standing in that spot you would see a total solar eclipse.'] }) });
  }
  ringHalf(true);
  for (const m of sys.moons) if (m.z > 0) drawMoon(m);
  k.hits.push({ x: cx, y: cy, pri: Math.min(22, R * 0.5), id: 'planet:' + sys.name, info: () => ({ title: sys.name, lines: planetLines(sys) }) });

  // caption
  const hidden = sys.moons.filter(m => m.state === 'behind').map(m => m.name);
  const shadows = sys.moons.filter(m => m.shadow).map(m => m.name);
  st.caption = `${Math.round(sys.phaseFraction * 100)}% lit · ${(sys.arcsecRadius * 2).toFixed(0)}″ across` +
    (shadows.length ? ` · shadow on the planet: ${shadows.join(', ')}` : '') + (hidden.length ? ` · behind the planet: ${hidden.join(', ')}` : '') + ' · north up, east left';
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
