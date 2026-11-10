// main.js — starts the app: builds the bottom bar, switches screens, keeps things ticking.

import { CONFIG } from './config.js';
import { store } from './store.js';
import { createBus } from './bus.js';
import { views } from './views/index.js';
import { openSettings } from './views/settings.js';
import { refreshIss, needsRecompute } from './issService.js';
import { icons } from './ui.js';
import { initSats, recomputeLoaded } from './satellites.js';
import { isNativeApp } from './platform.js';
import { initNotify } from './notify.js';

const ctx = {
  config: CONFIG,
  store,
  bus: createBus(),
  iss: { status: 'idle', error: null, tle: null, satrec: null, passes: [], computedAt: 0, stale: false },
  location: () => ({ lat: store.get('lat'), lon: store.get('lon'), elev: store.get('elev'), name: store.get('locName') }),
  go,
};

initSats(ctx);
const viewEl = document.getElementById('view');
const navEl = document.getElementById('nav');
let current = null;

function go(id, params) {
  const next = views.find(v => v.id === id) || views[0];
  if (current) current.unmount();
  viewEl.scrollTop = 0;
  viewEl.innerHTML = '';
  current = next;
  document.body.dataset.view = next.id;
  next.mount(viewEl, ctx, params);
  navEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === next.id));
  try { history.replaceState(null, '', '#' + next.id); } catch (e) { /* ignore */ }
}

function applyFab() { document.body.classList.toggle('no-fab', !store.get('showFab')); }

function buildFab() {
  applyFab();
  const fab = document.getElementById('fab');
  // Drag it anywhere (position is remembered); a plain tap opens the camera and asks "What's this?"
  const place = (fx, fy) => {
    const w = fab.offsetWidth, h = fab.offsetHeight, m = 6;
    const x = Math.max(m, Math.min(innerWidth - w - m, fx * innerWidth - w / 2));
    const y = Math.max(m, Math.min(innerHeight - h - m, fy * innerHeight - h / 2));
    fab.style.left = x + 'px'; fab.style.top = y + 'px'; fab.style.right = 'auto'; fab.style.bottom = 'auto';
    fab.classList.add('placed');
  };
  const saved = store.getCache('fabPos');
  if (saved) requestAnimationFrame(() => place(saved.x, saved.y));
  addEventListener('resize', () => { const p = store.getCache('fabPos'); if (p) place(p.x, p.y); });
  let drag = null;
  fab.addEventListener('pointerdown', (e) => {
    const r = fab.getBoundingClientRect();
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: e.clientX - r.left - r.width / 2, oy: e.clientY - r.top - r.height / 2, moved: false };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 8) return;
    drag.moved = true; fab.classList.add('dragging');
    place((e.clientX - drag.ox) / innerWidth, (e.clientY - drag.oy) / innerHeight);
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved; drag = null; fab.classList.remove('dragging');
    if (moved) {
      const r = fab.getBoundingClientRect();
      store.setCache('fabPos', { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight });
    } else if (e.type === 'pointerup') go('sky', { cam: true });
  };
  fab.addEventListener('pointerup', end);
  fab.addEventListener('pointercancel', end);
}

function buildNav() {
  navEl.innerHTML = views.map(v => `<button data-view="${v.id}">${v.icon}<span>${v.title}</span></button>`).join('');
  navEl.onclick = (e) => { const b = e.target.closest('[data-view]'); if (b) go(b.dataset.view); };
  document.getElementById('btn-settings').innerHTML = icons.gear;
  document.getElementById('btn-settings').onclick = () => openSettings(ctx);
}

function applyTheme() {
  const night = !!store.get('nightMode');
  document.documentElement.classList.toggle('night', night);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = night ? '#080000' : '#06080d';
}

function updateSubtitle() {
  document.getElementById('subtitle').textContent = ctx.location().name;
}

// React to settings changes.
store.onChange((keys) => {
  if (keys.includes('nightMode')) applyTheme();
  if (keys.includes('showFab')) applyFab();
  if (keys.some(k => ['lat', 'lon', 'elev', 'locName'].includes(k))) {
    updateSubtitle();
    refreshIss(ctx);                       // same orbit data, new viewing spot
    setTimeout(() => { recomputeLoaded(ctx); ctx.bus.emit('iss'); }, 400);
  }
  if (keys.some(k => ['hour12', 'minPeakEl', 'showAllPasses'].includes(k)) && current) {
    const id = current.id; if (!['point', 'sky', 'space'].includes(id)) go(id);
  }
});

// Boot
applyTheme(); buildNav(); buildFab(); updateSubtitle();
const startId = (location.hash || '').replace('#', '');
go(views.some(v => v.id === startId) ? startId : views[0].id);
refreshIss(ctx);
initNotify(ctx);

setInterval(() => {
  if (current && current.tick) current.tick(ctx);
  if (needsRecompute(ctx)) refreshIss(ctx);
}, 1000);

// Come back to a fresh picture when the app returns to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (needsRecompute(ctx)) refreshIss(ctx); if (current && !['point', 'sky', 'space'].includes(current.id)) go(current.id); }
});

// Offline support + installability (needs https).
// (Not in the Android app: its files are already on the phone.)
if (!isNativeApp() && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* fine without it */ });
}
