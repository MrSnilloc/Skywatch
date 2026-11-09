// compass.js — turns the phone's motion sensors into "where is the back of the phone pointing?"
// Hold the phone up like you're photographing the sky; the back camera side is the pointer.

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Pure maths (easy to test): browser orientation angles -> pointing direction of the phone's back.
 * alpha/beta/gamma are the W3C deviceorientation angles in degrees.
 * Returns {az, alt, v:[x,y,z]} where az is measured from MAGNETIC north (0=N, 90=E).
 */
export function pointingFromEuler(alphaDeg, betaDeg, gammaDeg) {
  const a = alphaDeg * RAD, b = betaDeg * RAD, g = gammaDeg * RAD;
  // Back-of-phone vector (0,0,-1) rotated by Rz(alpha)·Rx(beta)·Ry(gamma); world axes: x=East, y=North, z=Up.
  const wx = -Math.sin(g) * Math.cos(a) - Math.cos(g) * Math.sin(b) * Math.sin(a);
  const wy = -Math.sin(g) * Math.sin(a) + Math.cos(g) * Math.sin(b) * Math.cos(a);
  const wz = -Math.cos(g) * Math.cos(b);
  return vecToAzAlt([wx, wy, wz]);
}

export function vecToAzAlt(v) {
  const az = ((Math.atan2(v[0], v[1]) * DEG) % 360 + 360) % 360;
  const alt = Math.asin(Math.max(-1, Math.min(1, v[2]))) * DEG;
  return { az, alt, v };
}

/** Smallest signed angle from a to b, -180..180. */
export function angleDiff(a, b) {
  return ((b - a + 540) % 360) - 180;
}

/**
 * Live sensor wrapper.
 *   const o = createOrientation({ smoothing, getCorrection })
 *   await o.start(); o.read() -> {az, alt} (true north, corrected) or null
 */
export function createOrientation({ smoothing = 0.22, getCorrection = () => 0 } = {}) {
  let vec = null;
  let running = false;
  let gotAbsolute = false;   // true once a real compass-referenced event has arrived
  let lastEvent = 0;
  let rawAz = 0;

  function ingest(alpha, beta, gamma) {
    if (alpha == null || beta == null || gamma == null) return;
    const p = pointingFromEuler(alpha, beta, gamma);
    rawAz = p.az;
    lastEvent = Date.now();
    if (!vec) { vec = p.v.slice(); return; }
    for (let i = 0; i < 3; i++) vec[i] += (p.v[i] - vec[i]) * smoothing;
    const n = Math.hypot(vec[0], vec[1], vec[2]) || 1;
    vec = [vec[0] / n, vec[1] / n, vec[2] / n];
  }

  function onAbsolute(e) { gotAbsolute = true; ingest(e.alpha, e.beta, e.gamma); }

  function onRelative(e) {
    if (gotAbsolute) return; // prefer the compass-referenced stream
    if (typeof e.webkitCompassHeading === 'number') {      // iPhone Safari
      ingest(360 - e.webkitCompassHeading, e.beta, e.gamma);
    } else if (e.absolute) {
      ingest(e.alpha, e.beta, e.gamma);
    }
  }

  return {
    get running() { return running; },
    get hasAbsolute() { return gotAbsolute; },
    get msSinceEvent() { return lastEvent ? Date.now() - lastEvent : Infinity; },
    get rawAz() { return rawAz; },

    async start() {
      // Listen first: Android Chrome needs no permission, and some browsers refuse the permission
      // call outside a tap even though events would flow anyway.
      if (!running) {
        window.addEventListener('deviceorientationabsolute', onAbsolute, true);
        window.addEventListener('deviceorientation', onRelative, true);
        running = true;
      }
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();   // iPhone Safari: needs a tap
        if (r !== 'granted') throw new Error('Motion access was denied');
      }
      return true;
    },

    stop() {
      window.removeEventListener('deviceorientationabsolute', onAbsolute, true);
      window.removeEventListener('deviceorientation', onRelative, true);
      running = false; vec = null; lastEvent = 0;
    },

    /** Current aim in TRUE north (declination + user trim applied), or null if no data yet. */
    read() {
      if (!vec || this.msSinceEvent > 2500) return null;
      const p = vecToAzAlt(vec);
      return { az: ((p.az + getCorrection()) % 360 + 360) % 360, alt: p.alt, magAz: p.az };
    },
  };
}
