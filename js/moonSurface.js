// moonSurface.js — the map the Moon close-up is painted from.
// Best case: NASA's real Moon (a colour picture of the whole surface + a height picture, both unrolled flat with
// the middle of the near side in the centre; files in config.space.moon). The heights give the crater shadows
// along the day/night line. Until those load — or if the files are missing — it falls back to the simple
// generated map in moonmap.js, so the close-up always works.
//
// moonSurface() -> { id, w, h, rgb | alb, tone, sw, sh, gx, gy, relief }
//   rgb  : RGBA bytes of the colour picture (w × h)          — real map only
//   alb  : brightness 0..1 per cell (w × h)                    — generated map only
//   tone : byte value -> brightness 0..1 (real map)
//   gx, gy : slope toward east / north (sw × sh);  relief : how strongly slopes are shaded

import { CONFIG } from './config.js';
import { moonMap } from './moonmap.js';

const RAD = Math.PI / 180, KM_PER_DEG = 30.3;   // one degree of Moon latitude on the ground
let real = null, state = 'idle', fallback = null;

function readImage(file, maxW) {
  return new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.min(maxW, img.naturalWidth), h = Math.round(img.naturalHeight * w / img.naturalWidth);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
        ok({ w, h, data: g.getImageData(0, 0, w, h).data });
      } catch (e) { fail(e); }
    };
    img.onerror = () => fail(new Error('missing ' + file));
    img.src = file;
  });
}

async function load() {
  const cfg = CONFIG.space.moon;
  state = 'loading';
  try {
    const [pic, hp] = await Promise.all([readImage(cfg.picture, cfg.maxWidth), readImage(cfg.heights, 1024)]);
    const sw = hp.w, sh = hp.h, n = sw * sh;
    // heights (grey levels), lightly smoothed so the picture's 256 steps don't show as terraces
    let hgt = new Float32Array(n);
    for (let q = 0; q < n; q++) hgt[q] = hp.data[q * 4];
    for (let pass = 0; pass < cfg.smooth; pass++) {
      const out = new Float32Array(n);
      for (let j = 0; j < sh; j++) for (let i = 0; i < sw; i++) {
        let s = 0;
        for (let dj = -1; dj <= 1; dj++) { const jj = Math.max(0, Math.min(sh - 1, j + dj)); for (let di = -1; di <= 1; di++) s += hgt[jj * sw + (i + di + sw) % sw]; }
        out[j * sw + i] = s / 9;
      }
      hgt = out;
    }
    // slopes: rise over run, toward east and toward north
    const gx = new Float32Array(n), gy = new Float32Array(n), dDeg = 360 / sw, k = cfg.kmPerLevel / KM_PER_DEG;
    for (let j = 1; j < sh - 1; j++) {
      const cl = Math.max(0.08, Math.cos((90 - (j + 0.5) * 180 / sh) * RAD));
      for (let i = 0; i < sw; i++) {
        const q = j * sw + i;
        gx[q] = (hgt[j * sw + (i + 1) % sw] - hgt[j * sw + (i + sw - 1) % sw]) / (2 * dDeg * cl) * k;
        gy[q] = (hgt[q - sw] - hgt[q + sw]) / (2 * dDeg) * k;
      }
    }
    const tone = new Float32Array(256);
    for (let v = 0; v < 256; v++) tone[v] = Math.pow(v / 255, cfg.contrast);
    real = { id: 'real', w: pic.w, h: pic.h, rgb: pic.data, tone, sw, sh, gx, gy, relief: cfg.relief };
    state = 'ready';
  } catch (e) { state = 'none'; }
}

/** The best Moon map available right now (starts loading the real one the first time it's asked for). */
export function moonSurface() {
  if (state === 'idle' && CONFIG.space.moon && CONFIG.space.moon.picture) load();
  if (real) return real;
  if (!fallback) { const m = moonMap(); fallback = { id: 'drawn', w: m.w, h: m.h, alb: m.alb, sw: m.w, sh: m.h, gx: m.gx, gy: m.gy, relief: 1.1 }; }
  return fallback;
}
