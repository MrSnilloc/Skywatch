// planetTextures.js — real surface maps for the planet close-ups.
// Each map is an ordinary picture of the whole planet unrolled flat (longitude across, latitude down), listed
// in config.space.textures. They load in the background; until one is ready (or if its file is missing) the
// close-up falls back to the simple painted look, so the app always works.
//
// TO CHANGE OR ADD A MAP: put the picture in data/planets/ and point config.space.textures at it.

import { CONFIG } from './config.js';

const MAX_W = 1024;                 // maps are shrunk to this width in memory: plenty for a phone screen
const cache = {};                   // name -> { status: 'loading' | 'ready' | 'none', w, h, data }

function load(key, file) {
  const entry = cache[key] = { status: 'loading' };
  const img = new Image();
  img.onload = () => {
    try {
      const w = Math.min(MAX_W, img.naturalWidth), h = Math.max(1, Math.round(img.naturalHeight * w / img.naturalWidth));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
      Object.assign(entry, { status: 'ready', w, h, data: g.getImageData(0, 0, w, h).data });
    } catch (e) { entry.status = 'none'; }
  };
  img.onerror = () => { entry.status = 'none'; };
  img.src = file;
  return entry;
}

/** The surface map for a planet, or null if it isn't available (yet). -> { w, h, data (RGBA bytes) } */
export function planetTexture(name) {
  const file = CONFIG.space.textures[name];
  if (!file) return null;
  const e = cache[name] || load(name, file);
  return e.status === 'ready' ? e : null;
}

/** Saturn's rings as a strip from the inner edge (left) to the outer edge (right), or null. */
export function ringTexture() {
  const file = CONFIG.space.ringTexture;
  if (!file) return null;
  const e = cache.__rings || load('__rings', file);
  return e.status === 'ready' ? e : null;
}
