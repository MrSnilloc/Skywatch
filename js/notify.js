// notify.js — phone notifications (Android app only), using Capacitor's Local Notifications plugin.
//
// How it works: everything we alert on is predictable (passes, eclipses, launches…), so the app works out the
// moments ahead of time and hands them to Android, which fires them even when UpSight is closed.
// The list is rebuilt whenever the app opens, data refreshes, or a notification setting changes.
// Only "planes overhead" is live, so it only works while the app is open.
//
// TO ADD A TYPE: add it to CONFIG.notify.types, then add a builder to BUILDERS below that returns
// [{ key, at:Date, title, body, go?, params? }].

import { store } from './store.js';
import { isNativeApp } from './platform.js';
import { visiblePasses } from './issService.js';
import { eventData } from './events.js';
import * as showers from './showers.js';
import { makeObserver, bodyPosition, dirName } from './sky.js';
import * as skyMod from './sky.js';
import { assess } from './launches.js';
import { interestingComets, bestTonight } from './comets.js';
import { buildPlan } from './outlook.js';
import { fetchClouds, avgCloud, cloudVerdict } from './weather.js';
import { fmtTime, fmtDayInline } from './time.js';
import { issAt } from './iss.js';
import { overheadSoon, kmToMi } from './planes.js';
import { routeSoon, routeLine } from './routes.js';
import { loadSat, loadStarlink, starlinkState } from './satellites.js';
import { loadLaunches } from './launches.js';
import { loadComets } from './comets.js';

const A = () => globalThis.Astronomy;
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const LN = () => globalThis.Capacitor && globalThis.Capacitor.Plugins && globalThis.Capacitor.Plugins.LocalNotifications;

export const notifySupported = () => isNativeApp() && !!LN();
const on = (id) => !!store.get('n_' + id);
const typeOf = (ctx, id) => ctx.config.notify.types.find(t => t.id === id);
const at = (d, h, m = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, m);

/** Stable 31-bit number from a text key, so the same pass/event always gets the same notification id. */
function idFor(key) { let h = 2166136261; for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 1) || 1; }

function inQuiet(d) {
  if (!store.get('quietOn')) return false;
  const f = +store.get('quietFrom'), t = +store.get('quietTo'), h = d.getHours() + d.getMinutes() / 60;
  return f > t ? (h >= f || h < t) : (h >= f && h < t);
}

// ---------------------------------------------------------------- builders: one per notification type

function passBuilder(ctx, id) {
  const e = id === 'iss' ? ctx.iss : ctx.sats.items[id];
  return passesFor(ctx, id, e ? [e] : []);
}
function passesFor(ctx, typeId, entries) {
  const out = [], loc = ctx.location(), lead = +store.get('n_' + typeId + '_lead') * MIN, end = Date.now() + ctx.config.notify.passDays * DAY;
  for (const e of entries) {
    if (!e || e.status !== 'ready' || !e.satrec) continue;
    const name = e.train ? `Starlink train (${e.train.count} satellites)` : (e.name || 'ISS');
    for (const p of visiblePasses(ctx, e)) {
      if (!p.visible || p.visStart.getTime() > end) continue;
      const start = issAt(e.satrec, loc, p.visStart);
      const dir = dirName(start ? start.az : p.rise.az);
      out.push({ key: `${typeId}:${e.norad}:${Math.round(p.visStart.getTime() / 60000)}`, at: new Date(p.visStart.getTime() - lead),
        title: `${name} in ${Math.round(lead / MIN)} min`,
        body: `Look ${dir} at ${fmtTime(p.visStart)} · up to ${Math.round(p.peak.el)}° · ${p.brightness.toLowerCase()} · ${Math.max(1, Math.round((p.visEnd - p.visStart) / MIN))} min`,
        go: 'passes', params: { sat: e.id || 'iss' } });
    }
  }
  return out;
}

const BUILDERS = {
  iss: (ctx) => passBuilder(ctx, 'iss'),
  css: (ctx) => passBuilder(ctx, 'css'),
  hst: (ctx) => passBuilder(ctx, 'hst'),
  starlink: (ctx) => passesFor(ctx, 'starlink', Object.values(ctx.sats.items).filter(e => e.train && !e.train.fading)),

  eclipse(ctx) {
    const out = [], d = eventData(ctx), cfg = ctx.config.notify, end = Date.now() + cfg.eventDays * DAY;
    for (const e of d.lunar) {
      if (e.visibility === 'none' || e.kind === 'penumbral' || e.peak > end) continue;
      const first = e.stages.filter(s => s.up && !s.subtle)[0] || e.stages.find(s => s.up);
      if (!first) continue;
      const what = e.kind === 'total' ? 'Total lunar eclipse (Blood Moon)' : 'Partial lunar eclipse';
      out.push({ key: `ecl:l:${+e.peak}:eve`, at: at(new Date(first.t.getTime() - DAY), cfg.dayBeforeHour), title: `Tomorrow: ${what}`,
        body: `Starts ${fmtDayInline(first.t)} ${fmtTime(first.t)}, greatest at ${fmtTime(e.peak)}. Moon in the ${dirName(e.peakAz)}.`, go: 'events', params: { section: 'eclipses' } });
      out.push({ key: `ecl:l:${+e.peak}:go`, at: first.t, title: `${what} — starting now`,
        body: `Look ${dirName(first.az)} at the Moon. Greatest at ${fmtTime(e.peak)}.`, go: 'events', params: { section: 'eclipses' } });
    }
    for (const e of d.solar) {
      const h = e.here; if (!h || !h.sunUpAtPeak || e.peak > end) continue;
      const begin = h.partialBegin ? h.partialBegin.t : h.peak.t;
      const what = { partial: 'Partial solar eclipse', annular: 'Annular solar eclipse', total: 'Total solar eclipse' }[h.kind] || e.title;
      const amount = h.kind === 'partial' ? `${Math.round(h.obscuration * 100)}% of the Sun covered` : h.kind === 'total' ? 'TOTAL from here' : 'Ring of fire from here';
      out.push({ key: `ecl:s:${+e.peak}:eve`, at: at(new Date(begin.getTime() - DAY), cfg.dayBeforeHour), title: `Tomorrow: ${what}`,
        body: `${amount} at ${fmtTime(h.peak.t)}. You need certified eclipse glasses.`, go: 'events', params: { section: 'eclipses' } });
      out.push({ key: `ecl:s:${+e.peak}:go`, at: begin, title: `${what} — starting now`,
        body: `${amount} at ${fmtTime(h.peak.t)}. Never look at the Sun without eclipse glasses.`, go: 'events', params: { section: 'eclipses' } });
    }
    return out;
  },

  moon(ctx) {
    const out = [], d = eventData(ctx), obs = makeObserver(ctx.location()), end = Date.now() + ctx.config.notify.eventDays * DAY;
    const names = { super: 'Supermoon', blue: 'Blue Moon', harvest: 'Harvest Moon', hunter: 'Hunter’s Moon' };
    for (const m of d.moons) {
      const f = m.flags.filter(x => names[x]);
      if (!f.length || m.flags.includes('blood') || m.date > end) continue;          // blood moons come with the eclipse alert
      const r = A().SearchRiseSet('Moon', obs, +1, new Date(m.date.getTime() - 14 * HOUR), 1);
      const t = r ? r.date : at(m.date, 19);
      out.push({ key: `moon:${+m.date}`, at: t, title: `${f.map(x => names[x]).join(' + ')} rising now`,
        body: `${m.name} is coming up in the ${dirName(bodyPosition('Moon', new Date(t.getTime() + 20 * MIN), obs).az)}. Best low on the horizon, just after it rises.`,
        go: 'events', params: { section: 'moon' } });
    }
    return out;
  },

  shower(ctx) {
    const out = [], obs = makeObserver(ctx.location()), end = Date.now() + ctx.config.notify.eventDays * DAY;
    for (const c of showers.calendar(new Date(), obs)) {
      if (c.sh.zhr < 15) continue;
      const pk = c.st.next.peakAt; if (pk > end) continue;
      const evening = at(new Date(pk.getTime() - 12 * HOUR), ctx.config.notify.showerHour);
      out.push({ key: `shower:${c.sh.code}:${pk.getFullYear()}`, at: evening, title: `${c.sh.name} meteor shower peaks tonight`,
        body: `Up to ${c.sh.zhr} meteors an hour under dark skies · ${c.moonAtPeak.label}. Best after midnight, away from lights.`, go: 'events', params: { section: 'showers' } });
    }
    return out;
  },

  launch(ctx) {
    const out = [], loc = ctx.location(), L = ctx.launches;
    if (!L || L.status !== 'ready') return out;
    for (const l of L.list) {
      if (l.net < Date.now() || l.net > Date.now() + 14 * DAY) continue;
      const v = assess(l, loc, ctx.config.launches);
      if (v.level !== 'likely' && v.level !== 'maybe') continue;
      out.push({ key: `launch:${l.id}:${+l.net}:30`, at: new Date(l.net.getTime() - 30 * MIN), title: `Launch in 30 min: ${l.name}`,
        body: `${v.label} · look ${v.dir} · from ${l.pad.where}. Times can slip — open UpSight to check.`, go: 'events', params: { section: 'launches' } });
      out.push({ key: `launch:${l.id}:${+l.net}:0`, at: l.net, title: `Liftoff time: ${l.name}`,
        body: `Look ${v.dir}, low on the horizon. ${v.level === 'maybe' ? 'Might be visible as a slow, bright dot.' : 'Watch for a bright climbing light.'}`, go: 'events', params: { section: 'launches' } });
    }
    return out;
  },

  comet(ctx) {
    const out = [], obs = makeObserver(ctx.location()), cfg = ctx.config.comets, now = new Date();
    const told = store.getCache('notifyComets') || {};
    for (const it of interestingComets(ctx, now)) {
      if (told[it.c.id]) continue;
      if (it.now.mag <= cfg.binocularMag) {            // bright enough already: tell once, at tonight's best moment
        const bt = bestTonight(it.c, obs, now, skyMod);
        if (!bt || bt.alt < 8) continue;
        const eye = it.now.mag <= cfg.nakedEyeMag;
        out.push({ key: `comet:${it.c.id}`, at: bt.t, comet: it.c.id, title: `Comet ${it.c.id} is ${eye ? 'visible to the naked eye' : 'in binocular range'}`,
          body: `Look ${dirName(bt.az)}, ${Math.round(bt.alt)}° up around ${fmtTime(bt.t)}. Comets are unpredictable — it could be brighter or dimmer.`, target: 'comet:' + it.c.id });
      }
    }
    return out;
  },

  async daily(ctx) {
    const out = [], cfg = ctx.config.notify, loc = ctx.location(), obs = makeObserver(loc);
    let hours = null; try { hours = await fetchClouds(loc); } catch (e) { hours = null; }
    const choice = store.get('n_daily_time');
    for (let i = 0; i < cfg.dailyDays; i++) {
      const day = new Date(Date.now() + i * DAY);
      let t;
      if (choice === 'sunset') { const s = A().SearchRiseSet('Sun', obs, -1, at(day, 0), 1); t = s ? s.date : at(day, 18); }
      else t = at(day, +choice);
      if (t < Date.now() + 2 * MIN) continue;
      const plan = buildPlan(ctx, t);
      const cloud = hours ? avgCloud(hours, plan.night.start.getTime(), plan.night.start.getTime() + 5 * HOUR) : null;
      if (cloud != null && cloud >= cfg.cloudyPct) continue;                 // cloudy evening: stay quiet
      const best = plan.items.filter(x => x.when >= new Date(t.getTime() - 30 * MIN) && x.score >= 30).slice(0, 3).sort((a, b) => a.when - b.when);
      if (!best.length) continue;
      const sky = cloud == null ? 'Tonight' : cloudVerdict(cloud).label + ' tonight';
      out.push({ key: `daily:${t.toDateString()}`, at: t, title: `${sky} — ${best.length === 1 ? 'one thing' : best.length + ' things'} to see`,
        body: best.map(x => `${x.title.replace(/ flyover$/, '')}${x.noTime ? '' : ' ' + fmtTime(x.when)}`).join(' · ') + (cloud == null ? ' (check the clouds)' : ''), go: 'tonight' });
    }
    return out;
  },
};

// ---------------------------------------------------------------- scheduling

let channelsMade = false, busy = false, again = false, timer = null, timerAt = 0;

async function ensureChannels(ctx) {
  if (channelsMade) return;
  const P = LN();
  for (const t of ctx.config.notify.types) {
    try { await P.createChannel({ id: 'up_' + t.id, name: `${t.group}: ${t.label}`, description: t.hint, importance: t.id === 'daily' ? 3 : 4, visibility: 1, vibration: true }); } catch (e) { /* older Android: no channels */ }
  }
  channelsMade = true;
}

/** Make sure the data each switched-on type needs is loading (the screens normally load it on demand). */
function preload(ctx) {
  const later = (fn, ms) => setTimeout(fn, ms);
  if (on('css') && ctx.sats.items.css && ctx.sats.items.css.status === 'idle') later(() => loadSat(ctx, 'css'), 2500);
  if (on('hst') && ctx.sats.items.hst && ctx.sats.items.hst.status === 'idle') later(() => loadSat(ctx, 'hst'), 4000);
  if (on('starlink') && starlinkState(ctx).status === 'idle') later(() => loadStarlink(ctx), 6000);
  if (on('launch') && (!ctx.launches || ctx.launches.status === 'idle')) later(() => loadLaunches(ctx), 3000);
  if (on('comet') && (!ctx.comets || ctx.comets.status === 'idle')) later(() => loadComets(ctx), 5000);
}

/** Work out every upcoming moment for the switched-on types (no plugin needed — also used by tests). */
export async function buildList(ctx) {
  const cfg = ctx.config.notify, now = Date.now(), list = [];
  for (const t of cfg.types) {
    if (!on(t.id) || !BUILDERS[t.id]) continue;
    let items = [];
    try { items = await BUILDERS[t.id](ctx); } catch (e) { console.warn('notify', t.id, e); }
    for (const it of items) {
      if (!(it.at instanceof Date) || isNaN(it.at) || it.at.getTime() < now + 30000) continue;
      if (inQuiet(it.at) && !t.quietOk) continue;
      list.push({ ...it, type: t.id });
    }
  }
  list.sort((a, b) => a.at - b.at);
  return list.slice(0, cfg.maxScheduled);
}

async function reschedule(ctx) {
  const P = LN();
  if (busy) { again = true; return; }
  busy = true;
  try {
    const perm = await P.checkPermissions();
    if (perm.display !== 'granted') return;
    await ensureChannels(ctx);
    const list = await buildList(ctx);
    const pending = await P.getPending();
    if (pending.notifications.length) await P.cancel({ notifications: pending.notifications.map(n => ({ id: n.id })) });
    if (list.length) await P.schedule({ notifications: list.map(it => ({
      id: idFor(it.key), title: it.title, body: it.body, largeBody: it.body, channelId: 'up_' + it.type,
      schedule: { at: it.at, allowWhileIdle: true }, smallIcon: 'ic_stat_upsight', iconColor: '#6fd0ff',
      extra: { go: it.go || 'tonight', params: it.params || null, target: it.target || null, comet: it.comet || null },
    })) });
    const comets = list.filter(x => x.comet);
    if (comets.length) { const told = store.getCache('notifyComets') || {}; comets.forEach(x => { told[x.comet] = Date.now(); }); store.setCache('notifyComets', told); }
    store.setCache('notifyStatus', { at: Date.now(), count: list.length, next: list[0] ? { title: list[0].title, at: +list[0].at } : null });
    ctx.bus.emit('notify');
  } catch (e) { console.warn('notify reschedule failed', e); }
  finally { busy = false; if (again) { again = false; soon(ctx, 1500); } }
}

// Coalesce bursts of changes into one rebuild (don't keep pushing it back, or a busy app would never get there).
function soon(ctx, ms = 3000) {
  if (timer && timerAt <= Date.now() + ms) return;
  clearTimeout(timer); timerAt = Date.now() + ms;
  timer = setTimeout(() => { timer = null; reschedule(ctx); }, ms);
}

/** Ask Android for permission (Android 13+ shows a prompt). Resolves true if allowed. */
export async function askPermission() {
  if (!notifySupported()) return false;
  try { const r = await LN().requestPermissions(); return r.display === 'granted'; } catch (e) { return false; }
}
export async function permissionState() {
  if (!notifySupported()) return 'unsupported';
  try { return (await LN().checkPermissions()).display; } catch (e) { return 'unknown'; }
}
/** Android 12+: alarms are only to-the-minute when the user allows "Alarms & reminders" for the app. */
export async function exactState() {
  try { const r = await LN().checkExactNotificationSetting(); return r.exact_alarm; } catch (e) { return 'granted'; }
}
export async function openExactSetting() { try { await LN().changeExactNotificationSetting(); } catch (e) { /* not needed on this Android */ } }

/** Fire one right away (planes, and the "send a test" button). */
export async function notifyNow(ctx, type, title, body, extra = {}) {
  if (!notifySupported()) return false;
  await ensureChannels(ctx);
  await LN().schedule({ notifications: [{ id: idFor(type + ':' + Date.now()), title, body, channelId: 'up_' + type, smallIcon: 'ic_stat_upsight', iconColor: '#6fd0ff', extra }] });
  return true;
}

/** Called once at start-up. */
export function initNotify(ctx) {
  if (!notifySupported()) return;
  const P = LN();
  P.addListener('localNotificationActionPerformed', (a) => {
    const x = (a.notification && a.notification.extra) || {};
    if (x.target) ctx.go('point', { target: x.target }); else ctx.go(x.go || 'tonight', x.params || undefined);
  });
  // First run: ask once, a moment after the app has drawn.
  setTimeout(async () => {
    if (!store.getCache('notifyAsked')) { store.setCache('notifyAsked', 1); await askPermission(); }
    preload(ctx); soon(ctx, 4000);
  }, 2500);
  for (const ev of ['iss', 'sats', 'launches', 'comets']) ctx.bus.on(ev, () => soon(ctx, 5000));
  store.onChange((keys) => {
    if (keys.some(k => k.startsWith('n_') || k.startsWith('quiet') || ['lat', 'lon', 'minPeakEl'].includes(k))) { preload(ctx); soon(ctx, 1500); }
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(ctx, 6000); });

  // Planes overhead: live, so only while the app is running (and something is fetching planes).
  const toldPlanes = new Map();
  ctx.bus.on('planes', () => {
    if (!on('planes')) return;
    const cfg = ctx.config.planes;
    for (const { p, c } of overheadSoon(ctx, cfg.overheadKm, cfg.overheadSec)) {
      if (toldPlanes.has(p.id) && Date.now() - toldPlanes.get(p.id) < 20 * MIN) continue;
      if (inQuiet(new Date())) continue;
      toldPlanes.set(p.id, Date.now());
      const sec = Math.round(c.inSec);
      // wait a moment for its route (airline, From → To) so the alert can say where it's going
      routeSoon(ctx, p).then(r => { const rl = routeLine(r); notifyNow(ctx, 'planes', `✈ ${p.call || 'A plane'} overhead ${sec < 30 ? 'now' : 'in ' + (sec < 90 ? sec + ' s' : Math.round(sec / 60) + ' min')}`,
        `${rl ? rl + ' · ' : ''}${Math.round(p.altFt).toLocaleString()} ft${p.type ? ' · ' + p.type : ''} · closest ${kmToMi(c.distKm).toFixed(1)} mi`, { go: 'passes', params: { sat: 'planes' } }); });
    }
  });
}

export { soon as rescheduleSoon };
