// time.js — turning dates into short, friendly text.

import { store } from './store.js';

export function fmtTime(d) {
  if (!d) return '—';
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: store.get('hour12') });
}

export function fmtTimeSec(d) {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: store.get('hour12') });
}

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

/** "Today", "Tomorrow", or "Thu Nov 12". */
export function fmtDay(d, now = new Date()) {
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtDate(d) {
  return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';
}

/** "in 3h 12m", "in 4m 10s", "now". */
export function fmtCountdown(ms) {
  if (ms <= 0) return 'now';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d > 0) return `in ${d}d ${h}h`;
  if (h > 0) return `in ${h}h ${m}m`;
  if (m > 0) return `in ${m}m ${String(sec).padStart(2, '0')}s`;
  return `in ${sec}s`;
}

export function fmtAge(ms) {
  const h = ms / 3600000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60000))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

/** Same as fmtDay but lower-case for mid-sentence use: "rises today 3:34 PM", "rises Fri, Nov 13 3:34 PM". */
export function fmtDayInline(d, now = new Date()) {
  const t = fmtDay(d, now);
  return t === 'Today' ? 'today' : t === 'Tomorrow' ? 'tomorrow' : t;
}
