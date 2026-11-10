// weather.js — hourly cloud cover for the viewing spot (Open-Meteo, free, no key). Used for the "is it clear?" verdict.

import { store } from './store.js';

const URL_BASE = 'https://api.open-meteo.com/v1/forecast';

/** -> [{ t: Date, cloud: 0..100 }] for the next ~3 days, or throws. Cached for 45 minutes. */
export async function fetchClouds(loc, timeoutMs = 8000) {
  const key = `${loc.lat.toFixed(2)},${loc.lon.toFixed(2)}`;
  const c = store.getCache('clouds');
  if (c && c.key === key && Date.now() - c.at < 45 * 60e3) return c.hours.map(h => ({ t: new Date(h[0]), cloud: h[1] }));
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${URL_BASE}?latitude=${loc.lat}&longitude=${loc.lon}&hourly=cloud_cover&forecast_days=4&timezone=UTC`, { signal: ctl.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const j = await res.json();
    const times = j.hourly.time, vals = j.hourly.cloud_cover;
    const hours = times.map((t, i) => [Date.parse(t + 'Z'), vals[i]]).filter(h => h[1] != null);
    if (!hours.length) throw new Error('no data');
    store.setCache('clouds', { key, at: Date.now(), hours });
    return hours.map(h => ({ t: new Date(h[0]), cloud: h[1] }));
  } finally { clearTimeout(timer); }
}

/** Average cloud % between two moments (hourly samples; hour covers t..t+1h). null if no data there. */
export function avgCloud(hours, from, to) {
  const v = hours.filter(h => h.t.getTime() + 3600e3 > from && h.t.getTime() < to).map(h => h.cloud);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function cloudVerdict(pct) {
  if (pct == null) return { level: 'dim', label: 'Forecast unavailable' };
  if (pct < 20) return { level: 'good', label: 'Clear' };
  if (pct < 45) return { level: 'good', label: 'Mostly clear' };
  if (pct < 70) return { level: 'ok', label: 'Partly cloudy' };
  return { level: 'bad', label: 'Cloudy' };
}
