// store.js — settings + small caches, saved in the browser (localStorage).
// Everything is wrapped in try/catch so the app still runs if storage is blocked.

import { CONFIG } from './config.js';

const SETTINGS_KEY = 'skywatch.settings.v1';
const CACHE_PREFIX = 'skywatch.cache.';

let data = {};
try { data = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {}; } catch (e) { data = {}; }

const listeners = new Set();

function persist() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); } catch (e) { /* storage blocked */ }
}

export const store = {
  /** Current value of a setting, falling back to CONFIG.defaults. */
  get(key) { return key in data ? data[key] : CONFIG.defaults[key]; },

  /** Change one or more settings: set('hour12', false) or set({lat:1, lon:2}). */
  set(keyOrObj, value) {
    const changes = typeof keyOrObj === 'object' ? keyOrObj : { [keyOrObj]: value };
    Object.assign(data, changes);
    persist();
    listeners.forEach(fn => fn(Object.keys(changes)));
  },

  /** Be told when settings change. Returns an unsubscribe function. */
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  /** Bigger cached blobs (like downloaded orbit data). */
  getCache(name) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + name)); } catch (e) { return null; }
  },
  setCache(name, value) {
    try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(value)); } catch (e) { /* ignore */ }
  },
};
