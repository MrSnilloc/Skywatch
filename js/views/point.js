// views/point.js — the finder: aim the back of your phone at the sky and follow the dot.
// Uses the compass + tilt sensors (compass.js) and any target from targets.js.

import { createOrientation, angleDiff } from '../compass.js';
import { listTargets, resolveTarget } from '../targets.js';
import * as sky from '../sky.js';
import { store } from '../store.js';
import { compassCorrection, isCalibrated, describeOffset } from '../calibration.js';
import { openCalibrate } from './calibrate.js';
import { icons, esc } from '../ui.js';

const RAD = Math.PI / 180;

let ctx, el, cv, g, raf, orient, wakeLock, targetId, target, targetAt = 0;
let sim = null;                       // simulated aim when there's no sensor (desktop testing)
let sensorState = 'starting';         // starting | ok | none | denied

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

function currentAim() {
  const a = orient && orient.read();
  if (a) { sensorState = 'ok'; return a; }
  return sim;                         // may be null
}

function refreshTarget() {
  target = resolveTarget(targetId, ctx, new Date());
  targetAt = Date.now();
}

function renderChips() {
  const chips = listTargets(ctx);
  if (target && !chips.some(c => c.id === targetId)) chips.unshift({ id: targetId, label: target.label }); // e.g. "best view" spots
  el.querySelector('#chips').innerHTML = chips.map(c =>
    `<button class="chip ${c.id === targetId ? 'on' : ''}" data-t="${c.id}">${esc(c.label)}</button>`).join('');
}

function setTarget(id) {
  targetId = id; refreshTarget(); renderChips();
  const on = el.querySelector(`#chips [data-t="${CSS.escape(id)}"]`);
  if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
}

function resize() {
  const w = cv.clientWidth, dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame() {
  raf = requestAnimationFrame(frame);
  if (Date.now() - targetAt > 400) refreshTarget();
  const aim = currentAim();
  draw(aim);
  updateText(aim);
}

function draw(aim) {
  const w = cv.clientWidth, c = w / 2, R = w * 0.43;
  const fov = ctx.config.point.fovDeg, k = R / fov;
  const accent = css('--accent'), dim = css('--dim'), line = css('--line'), good = css('--good'), text = css('--text');
  g.clearRect(0, 0, w, w);

  const info = aim && target && !target.unavailable ? geometry(aim, k, fov) : null;
  const locked = info && info.locked;
  const ring = locked ? good : accent;

  // rings + crosshair
  g.lineWidth = 1.5; g.strokeStyle = line;
  g.beginPath(); g.arc(c, c, R, 0, 7); g.stroke();
  g.setLineDash([3, 5]); g.beginPath(); g.arc(c, c, R / 2, 0, 7); g.stroke(); g.setLineDash([]);
  g.strokeStyle = locked ? good : dim; g.globalAlpha = .55;
  g.beginPath(); g.moveTo(c - R, c); g.lineTo(c - 14, c); g.moveTo(c + 14, c); g.lineTo(c + R, c);
  g.moveTo(c, c - R); g.lineTo(c, c - 14); g.moveTo(c, c + 14); g.lineTo(c, c + R); g.stroke(); g.globalAlpha = 1;
  g.strokeStyle = ring; g.lineWidth = locked ? 3 : 2;
  g.beginPath(); g.arc(c, c, ctx.config.point.lockDeg * k + 6, 0, 7); g.stroke();

  if (!info) return;
  const { dx, dy, dist } = info;

  if (dist <= R - 10) {
    // target dot, with a glow
    const grad = g.createRadialGradient(c + dx, c + dy, 2, c + dx, c + dy, 26);
    grad.addColorStop(0, locked ? good : accent); grad.addColorStop(1, 'transparent');
    g.globalAlpha = .55; g.fillStyle = grad; g.beginPath(); g.arc(c + dx, c + dy, 26, 0, 7); g.fill(); g.globalAlpha = 1;
    g.fillStyle = locked ? good : text; g.beginPath(); g.arc(c + dx, c + dy, 7, 0, 7); g.fill();
    g.fillStyle = text; g.font = '600 13px system-ui, sans-serif'; g.textAlign = 'center';
    g.fillText(target.label, c + dx, c + dy - 16);
  } else {
    // off the ring: arrow on the edge pointing toward the target
    const ang = Math.atan2(dy, dx), ex = c + Math.cos(ang) * (R - 2), ey = c + Math.sin(ang) * (R - 2);
    g.save(); g.translate(ex, ey); g.rotate(ang);
    g.fillStyle = accent; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -11); g.lineTo(-3, 0); g.lineTo(-8, 11); g.closePath(); g.fill();
    g.restore();
  }
}

/** Offset of the target from where the phone points, in degrees and in pixels. */
function geometry(aim, k, fov) {
  const dAz = angleDiff(aim.az, target.az);
  const dAlt = target.alt - aim.alt;
  const midAlt = (aim.alt + target.alt) / 2;
  const sepAz = dAz * Math.cos(midAlt * RAD);            // true on-sky horizontal separation
  const dx = sepAz * k, dy = -dAlt * k;
  const sep = Math.hypot(sepAz, dAlt);
  return { dAz, dAlt, dx, dy, dist: Math.hypot(dx, dy), sep, locked: sep <= ctx.config.point.lockDeg };
}

function updateText(aim) {
  const instr = el.querySelector('#instr'), tinfo = el.querySelector('#tinfo'), aimEl = el.querySelector('#aim');
  const msg = el.querySelector('#sensor-msg');

  if (!target) { instr.textContent = ''; return; }
  if (target.unavailable) {
    instr.textContent = target.label; tinfo.textContent = target.note || ''; aimEl.textContent = ''; return;
  }
  const below = target.alt < 0;
  tinfo.textContent = `${target.label}: ${sky.dirName(target.az)} ${Math.round(target.az)}° · ${Math.round(target.alt)}° ${below ? 'below horizon' : 'up'}` + (target.note ? ` · ${target.note}` : '');

  if (!aim) {
    instr.textContent = sensorState === 'starting' ? 'Reading compass…' : 'Waiting for compass';
    aimEl.textContent = '';
  } else {
    const gm = geometry(aim, 1, 1);
    const parts = [];
    if (Math.abs(gm.dAz) >= 1.5) parts.push(`Turn ${gm.dAz > 0 ? 'right' : 'left'} ${Math.round(Math.abs(gm.dAz))}°`);
    if (Math.abs(gm.dAlt) >= 1.5) parts.push(`tilt ${gm.dAlt > 0 ? 'up' : 'down'} ${Math.round(Math.abs(gm.dAlt))}°`);
    instr.textContent = gm.locked ? 'On target ✓' : (parts.join(' · ').replace(/^./, c => c.toUpperCase()) || 'Almost there');
    instr.classList.toggle('lock', gm.locked);
    aimEl.textContent = `You’re aiming ${sky.dirName(aim.az)} ${Math.round(aim.az)}° · ${Math.round(aim.alt)}° up` + (orient && orient.read() ? '' : ' (simulated)');
  }

  if (sensorState === 'none' && !sim) {
    msg.classList.remove('hidden');
    msg.innerHTML = 'No motion sensor found. On your phone this works automatically; on a computer, drag inside the circle to simulate aiming.';
    sim = { az: target.az + 25, alt: Math.max(5, target.alt - 10) };
  } else if (sensorState === 'denied') {
    msg.classList.remove('hidden');
    msg.innerHTML = 'Motion access was blocked. <button class="btn small" data-act="enable">Enable compass</button>';
  } else if (aim && orient && orient.read() && !orient.hasAbsolute) {
    msg.classList.remove('hidden'); msg.textContent = 'This phone isn’t reporting a true compass heading, so left/right may be off. Use Calibrate below.';
  } else if (sensorState === 'ok') msg.classList.add('hidden');
}

async function startSensors() {
  sensorState = 'starting';
  try {
    await orient.start();
    setTimeout(() => { if (orient && !orient.read() && sensorState === 'starting') sensorState = 'none'; }, 1800);
  } catch (e) { sensorState = 'denied'; }
}

async function holdScreenAwake() {
  try { if (navigator.wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* not allowed */ }
}

function onClick(e) {
  const chip = e.target.closest('[data-t]');
  if (chip) return setTarget(chip.dataset.t);
  const b = e.target.closest('[data-act]');
  if (!b) return;
  if (b.dataset.act === 'enable') return startSensors();
  if (b.dataset.act === 'calibrate') openCalibrate(ctx, drawCompassStatus);
}

/** The "Compass tools" fold: what correction is applied right now. */
function drawCompassStatus() {
  if (!el || !el.querySelector('#cal-line')) return;
  el.querySelector('#cal-badge').innerHTML = isCalibrated() ? '<span class="badge good" style="margin:0 0 0 6px">calibrated</span>' : '';
  el.querySelector('#cal-line').textContent = isCalibrated()
    ? `Compass corrected ${describeOffset()}. If the dot still seems off left/right, calibrate again.`
    : 'If the dot seems consistently off left/right, calibrate against the Sun, Moon, Polaris or a landmark.';
}

function bindDrag() {
  let last = null;
  cv.addEventListener('pointerdown', (e) => { last = e; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointerup', () => { last = null; });
  cv.addEventListener('pointermove', (e) => {
    if (!last || !sim || (orient && orient.read())) return;
    sim.az = ((sim.az - (e.clientX - last.clientX) * 0.3) % 360 + 360) % 360;
    sim.alt = Math.max(-90, Math.min(90, sim.alt + (e.clientY - last.clientY) * 0.3));
    last = e;
  });
}

export const pointView = {
  id: 'point', title: 'Point', icon: icons.point,
  mount(root, c, params = {}) {
    ctx = c; el = root;
    targetId = params.target || store.get('lastTarget') || 'iss';
    el.innerHTML = `<div class="stack point">
      <div class="chips" id="chips"></div>
      <div class="finder"><canvas id="cv"></canvas></div>
      <div class="readout"><div id="instr" class="instr"></div><div id="tinfo" class="muted"></div><div id="aim" class="sub"></div></div>
      <div id="sensor-msg" class="card warn hidden"></div>
      <details class="fold"><summary>Compass tools <span id="cal-badge"></span></summary>
        <p class="sub" id="cal-line"></p>
        <div class="actions"><button class="btn" data-act="calibrate">Calibrate compass</button></div>
      </details></div>`;
    cv = el.querySelector('#cv'); g = cv.getContext('2d');
    el.addEventListener('click', onClick);
    drawCompassStatus();
    sim = null;
    orient = createOrientation({
      smoothing: ctx.config.point.smoothing,
      getCorrection: () => compassCorrection(ctx.location()),
    });
    setTarget(targetId); store.set('lastTarget', targetId);
    resize(); window.addEventListener('resize', resize); bindDrag();
    startSensors(); holdScreenAwake();
    raf = requestAnimationFrame(frame);
  },
  tick() { /* the finder animates itself every frame */ },
  unmount() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    if (orient) orient.stop();
    orient = null;
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ignore */ }
    wakeLock = null;
  },
};
