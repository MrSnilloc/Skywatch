// views/calibrate.js — the "Calibrate compass" sheet: pick a target, aim the phone at it, tap Calibrate.
// All the maths and the target list live in ../calibration.js; this file is only the screen.

import { createOrientation } from '../compass.js';
import { currentDeclination } from '../magnetic.js';
import { CAL_TARGETS, targetNow, calibrate, resetCalibration, isCalibrated, describeOffset } from '../calibration.js';
import * as sky from '../sky.js';
import { store } from '../store.js';
import { esc } from '../ui.js';

/** Open the sheet. `onBack` (optional) runs after it closes, e.g. to return to Settings. */
export function openCalibrate(ctx, onBack) {
  const sheet = document.getElementById('sheet');
  const loc = ctx.location();
  // Raw compass + automatic magnetic correction only: the saved offset is what we are about to measure.
  const orient = createOrientation({ smoothing: 0.25, getCorrection: () => currentDeclination(loc) });
  let targetId = store.getCache('calTarget') || 'moon';
  if (!targetNow(ctx, targetId).ok) targetId = (CAL_TARGETS.find(t => targetNow(ctx, t.id).ok) || CAL_TARGETS[0]).id;
  let result = null;

  sheet.innerHTML = `<div class="sheet-card" id="cal">
    <div class="sheet-head"><button class="btn ghost small" data-back data-act="close">${onBack ? '‹ Back' : 'Close'}</button><h2>Calibrate compass</h2><span style="width:64px"></span></div>
    <div class="card" style="margin-top:12px" id="cal-status"></div>
    <h3 class="sect">1 · Pick something you can see</h3>
    <div class="chips" id="cal-targets"></div>
    <div class="card" id="cal-how"></div>
    <h3 class="sect">2 · Aim the phone at it, then tap</h3>
    <div class="card"><div class="val" id="cal-live">Reading compass…</div><div class="sub" id="cal-tilt"></div>
      <div class="actions"><button class="btn" data-act="go">Calibrate</button></div>
      <div id="cal-result"></div></div>
    <p class="foot">Hold the phone up toward the sky, the same way you use it for aiming — not lying flat. Stay away from cars, metal railings and magnetic phone cases.</p></div>`;
  sheet.classList.remove('hidden');
  const $ = (id) => sheet.querySelector('#' + id);

  function drawStatus() {
    const decl = currentDeclination(loc);
    $('cal-status').innerHTML = `<div class="val">${isCalibrated() ? `Compass corrected ${esc(describeOffset())}` : 'Not calibrated yet'}</div>
      ${isCalibrated() ? '<span class="badge good">calibrated</span>' : ''}
      <div class="sub" style="margin-top:6px">Magnetic north vs true north (${Math.abs(decl).toFixed(1)}° ${decl < 0 ? 'west' : 'east'} here) is already corrected automatically. Calibrating fixes whatever error is left on this phone.</div>
      ${isCalibrated() ? '<div class="actions"><button class="btn ghost small" data-act="reset">Reset</button></div>' : ''}`;
  }

  function drawTargets() {
    $('cal-targets').innerHTML = CAL_TARGETS.map(t =>
      `<button class="chip ${t.id === targetId ? 'on' : ''}" data-target="${t.id}" style="${targetNow(ctx, t.id).ok ? '' : 'opacity:.5'}">${esc(t.label)}</button>`).join('');
    const def = CAL_TARGETS.find(t => t.id === targetId), now = targetNow(ctx, targetId);
    const where = !now.ok ? `<div class="sub" style="color:var(--warn)">${esc(now.why)}</div>`
      : now.alt === null ? '' : `<div class="val">${esc(def.label)} is ${sky.dirName(now.az)}, ${Math.round(now.alt)}° up</div>`;
    $('cal-how').innerHTML = `${where}<div class="sub" style="margin-top:4px">${esc(def.how)}</div>${def.warn ? `<p class="tip" style="color:var(--warn)">⚠ ${esc(def.warn)}</p>` : ''}`;
  }

  function drawLive() {
    const aim = orient.read(), now = targetNow(ctx, targetId);
    if (!aim) { $('cal-live').textContent = orient.msSinceEvent > 2500 ? 'Waiting for the compass… move the phone in a figure-8' : 'Reading compass…'; $('cal-tilt').textContent = ''; return; }
    $('cal-live').textContent = `Phone is pointing ${sky.dirName(aim.az)} ${Math.round(aim.az)}° · ${Math.round(aim.alt)}° up`;
    const want = now.alt === null ? 0 : now.alt, gap = Math.round(want - aim.alt);
    $('cal-tilt').textContent = !now.ok ? '' : Math.abs(gap) <= 4 ? 'Tilt matches the target ✓' : `Tilt ${gap > 0 ? 'up' : 'down'} ${Math.abs(gap)}° to match the target`;
  }

  function drawResult() {
    $('cal-result').innerHTML = !result ? '' : `<p class="tip" style="color:var(--${result.ok ? 'good' : 'warn'});font-weight:600">${esc(result.message)}</p>`;
  }

  drawStatus(); drawTargets(); drawLive();
  orient.start().catch(() => {});
  const timer = setInterval(() => { if (!sheet.querySelector('#cal')) return close(false); drawLive(); }, 250);
  const slow = setInterval(drawTargets, 5000);      // the Sun, Moon and ISS move

  sheet.onchange = null; sheet.onkeydown = null;
  sheet.onclick = (e) => {
    if (e.target === sheet) return close(true);
    const chip = e.target.closest('[data-target]');
    if (chip) { targetId = chip.dataset.target; store.setCache('calTarget', targetId); result = null; drawTargets(); drawLive(); drawResult(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'close') return close(true);
    if (b.dataset.act === 'go') { result = calibrate(ctx, targetId, orient.read()); drawStatus(); drawResult(); }
    if (b.dataset.act === 'reset') { resetCalibration(); result = { ok: true, message: 'Calibration reset' }; drawStatus(); drawResult(); }
  };

  /** Stop the sensors; `shut` = also close the sheet (false when something else already replaced it). */
  function close(shut) {
    clearInterval(timer); clearInterval(slow); orient.stop();
    if (!shut) return;
    sheet.classList.add('hidden'); sheet.innerHTML = '';
    if (onBack) onBack();
  }
}
