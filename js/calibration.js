// calibration.js — one-tap compass calibration (no screen code here; the sheet is views/calibrate.js).
//
// The phone's compass reads MAGNETIC north. The app turns that into TRUE north in two steps:
//   1. magnetic declination for your location (magnetic.js) — automatic, about -8.7° in Virginia;
//   2. your saved calibration offset (this file) — whatever error is still left on YOUR phone.
// So:  true heading = compass heading + declination + offset.   East is positive, west negative.
// Every screen gets its correction from compassCorrection(), so nothing is ever applied twice.
//
// TO ADD A CALIBRATION TARGET: add one entry to CAL_TARGETS below.

import { store } from './store.js';
import { currentDeclination } from './magnetic.js';
import { angleDiff } from './compass.js';
import * as sky from './sky.js';
import { issLive } from './iss.js';

const signed = (deg) => ((((+deg || 0) + 180) % 360) + 360) % 360 - 180;     // any angle -> -180..180

/** The saved offset in degrees (0 = not calibrated). */
export const getOffset = () => signed(store.get('azOffset'));
export const isCalibrated = () => Math.abs(getOffset()) >= 0.5;

/** Everything a screen must add to the raw compass heading to get true north. */
export const compassCorrection = (loc) => currentDeclination(loc) + getOffset();

/** 8 -> "8° east", -3.2 -> "3° west" */
export function describeOffset(deg = getOffset()) {
  const n = Math.round(Math.abs(deg));
  return n === 0 ? '0°' : `${n}° ${deg > 0 ? 'east' : 'west'}`;
}

// ---------- targets ----------
// position(ctx, date, obs) -> { az, alt } in true degrees, or null when unknown.
// alt: null means "no height to check" (a landmark on the ground).
export const CAL_TARGETS = [
  { id: 'sun', label: 'Sun', name: 'the Sun',
    how: 'Face the Sun and hold the phone up between it and your eyes, screen toward you, so the phone’s shadow falls on your face.',
    warn: 'Never look straight at the Sun. Line up using the phone’s shadow or the screen only.',
    position: (ctx, date, obs) => sky.bodyPosition('Sun', date, obs) },
  { id: 'moon', label: 'Moon', name: 'the Moon',
    how: 'Hold the phone up at arm’s length, screen toward you, so it just hides the Moon.',
    position: (ctx, date, obs) => sky.bodyPosition('Moon', date, obs) },
  { id: 'polaris', label: 'Polaris', name: 'Polaris',
    how: 'Find the North Star (the end of the Little Dipper’s handle; the Big Dipper’s two front stars point to it). Hold the phone up at arm’s length, screen toward you, so it just hides the star.',
    position: (ctx, date, obs) => sky.fixedPosition(37.9546, 89.2641, date, obs) },
  { id: 'iss', label: 'ISS', name: 'the ISS', away: 'The ISS isn’t passing over right now — pick another target.',
    how: 'During a pass: hold the phone up at arm’s length, screen toward you, so it hides the ISS, and tap Calibrate while it’s covered.',
    position: (ctx, date) => {
      const p = ctx.iss.satrec && issLive(ctx.iss.satrec, ctx.location(), date);
      return p ? { az: p.az, alt: p.el } : null;
    } },
  { id: 'north', label: 'Landmark', name: 'true north',
    how: 'Stand so a landmark you know is exactly true north of you (a north–south street, a map line). Hold the phone upright, screen toward you, its back facing the landmark.',
    position: () => ({ az: 0, alt: null }) },
];

/** Where a target is right now, and whether it can be used: { id, label, name, az, alt, ok, why }. */
export function targetNow(ctx, id, date = new Date()) {
  const t = CAL_TARGETS.find(x => x.id === id) || CAL_TARGETS[0];
  const cfg = ctx.config.compass;
  const p = t.position(ctx, date, sky.makeObserver(ctx.location()));
  const out = { id: t.id, label: t.label, name: t.name, az: p ? p.az : 0, alt: p ? p.alt : null, ok: true, why: '' };
  const cap = t.name.replace(/^./, c => c.toUpperCase());
  if (!p) { out.ok = false; out.why = 'Orbit data isn’t loaded yet.'; }
  else if (p.alt !== null && p.alt < cfg.minTargetAltDeg) { out.ok = false; out.why = t.away || `${cap} is below or too close to the horizon right now — pick another target.`; }
  else if (p.alt !== null && p.alt > cfg.maxTargetAltDeg) { out.ok = false; out.why = `${cap} is almost straight overhead, where a compass can’t tell direction — pick a lower target.`; }
  return out;
}

// ---------- calibrate ----------
const fail = (message, extra = {}) => ({ ok: false, message, ...extra });

/** Save an offset (refused when it is implausibly large). -> { ok, offset, message } */
export function saveOffset(ctx, offset) {
  offset = signed(offset);
  if (Math.abs(offset) > ctx.config.compass.maxOffsetDeg) return fail('Move away from metal or a magnetic case and try again.', { offset });
  store.set('azOffset', Math.round(offset * 10) / 10);
  return { ok: true, offset, message: isCalibrated() ? `Compass corrected ${describeOffset(offset)}` : 'Compass is already accurate — no correction needed' };
}

/**
 * The one-tap calibration: the phone is aimed at the target, so
 *   offset = target's true azimuth − (compass heading + declination).
 * `aim` is a reading from compass.js: { magAz, alt }.
 */
export function calibrate(ctx, targetId, aim, date = new Date()) {
  const cfg = ctx.config.compass;
  if (!aim) return fail('No compass reading yet — move the phone in a figure-8 and try again.');
  const t = targetNow(ctx, targetId, date);
  if (!t.ok) return fail(t.why);
  if (t.alt === null) {
    if (Math.abs(aim.alt) > cfg.maxAltGapDeg) return fail('Hold the phone upright, with its back facing your landmark.');
  } else if (Math.abs(aim.alt - t.alt) > cfg.maxAltGapDeg) {
    return fail(`Aim the back of the phone at ${t.name} first — it is ${Math.round(t.alt)}° up, and the phone is pointing ${Math.round(aim.alt)}° up.`);
  }
  return saveOffset(ctx, angleDiff(aim.magAz + currentDeclination(ctx.location()), t.az));
}

/** Add a small correction on top of the saved one (used by "line the compass up with it" on the Sky map). */
export const nudgeOffset = (ctx, delta) => saveOffset(ctx, getOffset() + delta);

export function resetCalibration() { store.set('azOffset', 0); }
