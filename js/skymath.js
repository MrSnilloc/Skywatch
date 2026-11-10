// skymath.js — pure maths for the Sky map (no DOM, easy to test).
// World coordinates are East, North, Up. A "view" is {right, up, fwd} unit vectors in that frame.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };

/** az (0=N, 90=E) / alt in degrees -> unit vector (E,N,U). */
export function azAltToVec(az, alt) {
  const a = az * RAD, h = alt * RAD, c = Math.cos(h);
  return [c * Math.sin(a), c * Math.cos(a), Math.sin(h)];
}

export function vecToAzAlt(v) {
  return { az: ((Math.atan2(v[0], v[1]) * DEG) % 360 + 360) % 360, alt: Math.asin(Math.max(-1, Math.min(1, v[2]))) * DEG };
}

/** View from "looking at az/alt, no roll" (free-look mode). */
export function viewFromAzAlt(az, alt) {
  const fwd = azAltToVec(az, alt);
  let right = cross(fwd, [0, 0, 1]);
  if (Math.hypot(...right) < 1e-6) right = [1, 0, 0];
  right = norm(right);
  const up = cross(right, fwd);
  return { right, up, fwd };
}

/**
 * View from the phone's axes (from compass.readAxes()) and the screen rotation (0/90/180/270).
 * The phone is a window onto the sky: the camera looks out of the back (-z).
 */
export function viewFromDevice(axes, screenAngleDeg) {
  const a = screenAngleDeg * RAD, s = Math.sin(a), c = Math.cos(a);
  const up = [0, 1, 2].map(i => s * axes.x[i] + c * axes.y[i]);
  const right = [0, 1, 2].map(i => c * axes.x[i] - s * axes.y[i]);
  const fwd = [-axes.z[0], -axes.z[1], -axes.z[2]];
  return { right, up, fwd };
}

/** Stereographic projection: pixels from centre for a world vector. Returns null if on the far side. */
export function project(v, view, scale) {
  const sz = dot(v, view.fwd);
  if (sz < -0.6) return null;
  const k = 2 / (1 + sz);
  return [dot(v, view.right) * k * scale, -dot(v, view.up) * k * scale, sz];
}

/** Pixels per projection unit so that `fovDeg` spans `spanPx`. */
export function scaleFor(fovDeg, spanPx) {
  return (spanPx / 2) / (2 * Math.tan(fovDeg * RAD / 4));
}

/** Degrees on the sky covered by one screen pixel near the centre. */
export function degPerPx(fovDeg, spanPx) { return fovDeg / spanPx; }

/** Angle between two unit vectors, degrees. */
export const angleBetween = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * DEG;

/**
 * Rotation from J2000 equatorial to local ENU for a date/observer; returns a function that maps
 * packed Float32 unit vectors (x,y,z in EQJ) into a packed output (E,N,U).
 */
export function makeEqjToEnu(Astronomy, date, observer) {
  const t = Astronomy.MakeTime(date);
  const rot = Astronomy.Rotation_EQJ_HOR(t, observer);
  const col = (x, y, z) => { const v = Astronomy.RotateVector(rot, new Astronomy.Vector(x, y, z, t)); return [-v.y, v.x, v.z]; }; // HOR(N,W,Up) -> ENU
  const cx = col(1, 0, 0), cy = col(0, 1, 0), cz = col(0, 0, 1);
  return (src, out) => {
    for (let i = 0; i < src.length; i += 3) {
      const x = src[i], y = src[i + 1], z = src[i + 2];
      out[i] = x * cx[0] + y * cy[0] + z * cz[0];
      out[i + 1] = x * cx[1] + y * cy[1] + z * cz[1];
      out[i + 2] = x * cx[2] + y * cy[2] + z * cz[2];
    }
  };
}

/** RA/Dec (degrees) -> J2000 unit vector. */
export function eqjVec(raDeg, decDeg) {
  const r = raDeg * RAD, d = decDeg * RAD, c = Math.cos(d);
  return [c * Math.cos(r), c * Math.sin(r), Math.sin(d)];
}

/** Star colour from B-V colour index. */
export function bvColor(bv) {
  const t = Math.max(-0.3, Math.min(1.8, bv));
  if (t < 0) return '#b4c8ff';
  if (t < 0.3) return '#d5e0ff';
  if (t < 0.6) return '#f4f4ff';
  if (t < 0.9) return '#fff1c8';
  if (t < 1.3) return '#ffd29a';
  return '#ffb27a';
}
