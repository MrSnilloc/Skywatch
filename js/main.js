// main.js — starts the app: builds the bottom bar, switches screens, keeps things ticking.

import { CONFIG } from './config.js';
import { store } from './store.js';
import { createBus } from './bus.js';
import { views } from './views/index.js';
import { openSettings } from './views/settings.js';
import { refreshIss, needsRecompute } from './issService.js';
import { icons } from './ui.js';
import { initSats, recomputeLoaded } from './satellites.js';

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
  next.mount(viewEl, ctx, params);
  navEl.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.view === next.id));
  try { history.replaceState(null, '', '#' + next.id); } catch (e) { /* ignore */ }
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
applyTheme(); buildNav(); updateSubtitle();
const startId = (location.hash || '').replace('#', '');
go(views.some(v => v.id === startId) ? startId : views[0].id);
refreshIss(ctx);

setInterval(() => {
  if (current && current.tick) current.tick(ctx);
  if (needsRecompute(ctx)) refreshIss(ctx);
}, 1000);

// Come back to a fresh picture when the app returns to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { if (needsRecompute(ctx)) refreshIss(ctx); if (current && !['point', 'sky', 'space'].includes(current.id)) go(current.id); }
});

// Offline support + installability (needs https).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => { /* fine without it */ });
}
