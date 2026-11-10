// colors.js — canvas colour helpers shared by the Sky and Space views.
// col(hex) returns the colour as-is, or a red-only version when night (red) mode is on, so screens stay dark-adapted.

const cache = new Map();

export function col(hex) {
  if (!document.documentElement.classList.contains('night')) return hex;
  let c = cache.get(hex);
  if (c) return c;
  const n = parseInt(hex.slice(1, 7), 16);
  const L = Math.min(255, Math.round((0.3 * (n >> 16) + 0.55 * ((n >> 8) & 255) + 0.15 * (n & 255)) * 1.25 + 10));
  c = `rgb(${L},${Math.round(L * 0.12)},${Math.round(L * 0.08)})`;
  cache.set(hex, c); return c;
}

/** Blend two #rrggbb colours (t = 0..1). */
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const f = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${[16, 8, 0].map(s => f(s).toString(16).padStart(2, '0')).join('')}`;
}

export const isNight = () => document.documentElement.classList.contains('night');
