// paths.js — where a plane or satellite is GOING: points along its path ahead (with +1 min, +2 min… marks)
// and behind, plus the shared way of drawing them (dotted line ahead, faded trail behind).
//
// Each screen (plane map, radar, Sky map, Space view) turns the points into its own screen positions and then
// calls strokeAhead / strokeTrail / drawMarks, so every screen looks the same. Lengths are in config.paths.
//
// TO ADD PATHS TO ANOTHER SCREEN: get points from planeAhead() or satTrack(), project them to [x, y] (null = off
// screen / hidden), then call the three draw helpers below.

import { planeLook } from './planes.js';
import { issAt } from './iss.js';
import { col } from './colors.js';

const RAD = Math.PI / 180, DEG = 180 / Math.PI, RE = 6371000;

/**
 * A plane's straight-line path ahead, from where it is right now.
 * -> [{ lat, lon, altFt, min, mark }]  (first point = now; mark = whole minutes ahead on the minute points, else 0)
 */
export function planeAhead(p, loc, now, minutes, stepSec) {
  const here = planeLook(p, loc, now), out = [];
  const la1 = here.lat * RAD, lo1 = here.lon * RAD, br = p.track * RAD;
  for (let s = 0; s <= minutes * 60; s += stepSec) {
    const d = p.gsKt * 0.514444 * s / RE;                       // angle travelled over the ground
    const la = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
    const lo = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la));
    out.push({ lat: la * DEG, lon: lo * DEG, altFt: Math.max(0, Math.min(45000, here.altFt + p.vrate * s / 60)), min: s / 60, mark: s && s % 60 === 0 ? s / 60 : 0 });
  }
  return out;
}

/** Where a spot (lat, lon, height in feet) is in your sky -> { az, el, ... } (same answer shape as planeLook). */
export const spotLook = (lat, lon, altFt, loc) => planeLook({ lat, lon, altFt, gsKt: 0, track: 0, vrate: 0, seen: 0 }, loc, 0);

/**
 * A satellite's path in your sky from `fromMin` minutes (negative = behind it) to `toMin` minutes ahead.
 * -> [{ az, el, eci, min, mark }]
 */
export function satTrack(satrec, loc, date, fromMin, toMin, stepSec) {
  const out = [], t0 = date.getTime();
  for (let s = Math.round(fromMin * 60 / stepSec) * stepSec; s <= toMin * 60; s += stepSec) {
    const p = issAt(satrec, loc, new Date(t0 + s * 1000));
    if (p) out.push({ az: p.az, el: p.el, eci: p.eci, min: s / 60, mark: s > 0 && s % 60 === 0 ? s / 60 : 0 });
  }
  return out;
}

// ---------- drawing (pts = [[x, y] | null, …] in screen pixels; null lifts the pen) ----------
function line(g, pts) {
  g.beginPath(); let pen = false;
  for (const p of pts) { if (!p) { pen = false; continue; } pen ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); pen = true; }
  g.stroke();
}

/** Dotted line ahead (pts run from the object outward). */
export function strokeAhead(g, pts, color, alpha = 0.75, width = 1.6) {
  g.save(); g.strokeStyle = col(color); g.globalAlpha = alpha; g.lineWidth = width; g.lineCap = 'round'; g.setLineDash([1, 5]);
  line(g, pts); g.restore();
}

/** Faded trail behind (pts run oldest -> newest, ending at the object). */
export function strokeTrail(g, pts, color, alpha = 0.7, width = 2) {
  g.save(); g.strokeStyle = col(color); g.lineWidth = width; g.lineCap = 'round';
  for (let i = 1; i < pts.length; i++) {
    if (!pts[i - 1] || !pts[i]) continue;
    g.globalAlpha = alpha * (0.12 + 0.88 * i / pts.length);
    g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1]); g.lineTo(pts[i][0], pts[i][1]); g.stroke();
  }
  g.restore();
}

/**
 * Minute marks: a small ring at each mark; with `labels`, "+1 min", "+2"… next to those that have room
 * (at least `gap` pixels from the last label). marks = [{ x, y, min }]
 */
export function drawMarks(g, marks, color, { labels = false, gap = 26, alpha = 0.9 } = {}) {
  g.save(); g.globalAlpha = alpha; g.font = '600 10px system-ui'; g.lineWidth = 3;
  let last = null, first = true;
  for (const m of marks) {
    g.fillStyle = col(color); g.beginPath(); g.arc(m.x, m.y, 2.6, 0, 2 * Math.PI); g.fill();
    if (!labels || (last && Math.hypot(m.x - last.x, m.y - last.y) < gap)) continue;
    const t = first ? `+${m.min} min` : `+${m.min}`;
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(t, m.x + 6, m.y - 5); g.fillStyle = col('#ffffff'); g.fillText(t, m.x + 6, m.y - 5);
    last = m; first = false;
  }
  g.restore();
}
