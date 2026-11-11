// routes.js — where a plane is flying from and to, looked up from its callsign (e.g. AAL100 → New York → London).
//
// Sources are tried in the order listed in config.planes.routeSources. Each answer is remembered per callsign
// (config.planes.routeCacheHours) so a plane is only ever asked about once, and lookups happen one at a time,
// only for planes you actually look at — never for the whole sky.
// Planes without an airline-style flight number (private planes, most military) are "Private / no route"
// without asking anyone.
//
// TO ADD A SOURCE: add an entry to PROVIDERS below and its name to config.planes.routeSources.

import { store } from './store.js';
import { isNativeApp } from './platform.js';

const RAD = Math.PI / 180;
const mem = new Map();          // callsign -> entry { status: 'loading' | 'ok' | 'none' | 'private', airline, from, to, source, t }
const queue = [];
let busy = false;

// A few airline codes, for sources that only give the 3-letter code.
const AIRLINES = { AAL: 'American Airlines', DAL: 'Delta Air Lines', UAL: 'United Airlines', SWA: 'Southwest Airlines', JBU: 'JetBlue', NKS: 'Spirit Airlines', FFT: 'Frontier Airlines', ASA: 'Alaska Airlines', AAY: 'Allegiant Air', HAL: 'Hawaiian Airlines', SCX: 'Sun Country', MXY: 'Breeze Airways', VXP: 'Avelo Airlines',
  RPA: 'Republic Airways', SKW: 'SkyWest', ENY: 'Envoy Air', JIA: 'PSA Airlines', PDT: 'Piedmont Airlines', EDV: 'Endeavor Air', ASH: 'Mesa Airlines', GJS: 'GoJet', UCA: 'CommuteAir', AWI: 'Air Wisconsin', QXE: 'Horizon Air',
  FDX: 'FedEx', UPS: 'UPS', GTI: 'Atlas Air', ABX: 'ABX Air', ATN: 'Air Transport International', CKS: 'Kalitta Air', PAC: 'Polar Air Cargo', SOO: 'Southern Air', AJT: 'Amerijet',
  ACA: 'Air Canada', WJA: 'WestJet', JZA: 'Jazz', BAW: 'British Airways', VIR: 'Virgin Atlantic', DLH: 'Lufthansa', AFR: 'Air France', KLM: 'KLM', IBE: 'Iberia', EIN: 'Aer Lingus', SAS: 'SAS', TAP: 'TAP Air Portugal', ICE: 'Icelandair', SWR: 'Swiss', AUA: 'Austrian', TSC: 'Air Transat',
  UAE: 'Emirates', QTR: 'Qatar Airways', ETD: 'Etihad', THY: 'Turkish Airlines', ELY: 'El Al', AMX: 'Aeroméxico', VOI: 'Volaris', CMP: 'Copa Airlines', AVA: 'Avianca', LAN: 'LATAM', TAM: 'LATAM Brasil',
  EJA: 'NetJets', LXJ: 'Flexjet', EJM: 'Executive Jet Management', XOJ: 'XOJET', VJA: 'Vista America' };

const airport = (code, city, name, lat, lon) => ({ code: code || '', city: city || name || code || '', name: name || '', lat, lon });

const PROVIDERS = {
  // adsb.lol — route data from Virtual Radar Server's public-domain list. Answers [{ airline_code, _airports: [...] }].
  adsblol: async (call, p, signal) => {
    const res = await fetch('https://api.adsb.lol/api/0/routeset', { method: 'POST', signal, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ planes: [{ callsign: call, lat: p.lat, lng: p.lon }] }) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const txt = await res.text(); if (!txt.trim()) throw new Error('empty answer');
    const r = [].concat(JSON.parse(txt))[0], ap = r && r._airports;
    if (!ap || ap.length < 2 || r.plausible === false) return null;
    const A = (a) => airport(a.iata || a.icao, a.location, a.name, a.lat, a.lon);
    return { airline: AIRLINES[r.airline_code] || AIRLINES[call.slice(0, 3)] || '', from: A(ap[0]), to: A(ap[ap.length - 1]) };
  },
  // adsbdb.com — free public API. Answers { response: { flightroute: { airline, origin, destination } } } or 404.
  adsbdb: async (call, p, signal) => {
    const res = await fetch('https://api.adsbdb.com/v0/callsign/' + encodeURIComponent(call), { signal });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const f = ((await res.json()).response || {}).flightroute;
    if (!f || !f.origin || !f.destination) return null;
    const A = (a) => airport(a.iata_code || a.icao_code, a.municipality, a.name, a.latitude, a.longitude);
    return { airline: (f.airline && f.airline.name) || AIRLINES[call.slice(0, 3)] || '', from: A(f.origin), to: A(f.destination) };
  },
};

/** Does this plane have an airline-style flight number (AAL100, WN1882)? Tail numbers like N123AB do not. */
export function hasFlightNumber(p) {
  const c = (p.call || '').toUpperCase();
  return c !== (p.reg || '').toUpperCase() && c !== (p.id || '').toUpperCase() && /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(c);
}

function saved() { return store.getCache('routes') || {}; }
function remember(call, e) {
  const all = saved(); all[call] = e;
  const keys = Object.keys(all);
  if (keys.length > 150) keys.sort((a, b) => all[a].t - all[b].t).slice(0, keys.length - 150).forEach(k => delete all[k]);
  store.setCache('routes', all);
}

async function work(ctx) {
  if (busy) return; busy = true;
  while (queue.length) {
    const { call, p, done } = queue.shift(), cfg = ctx.config.planes;
    let entry = { status: 'none', t: Date.now() }, failed = 0;
    for (const name of cfg.routeSources) {
      try {
        const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), cfg.routeTimeoutMs);
        const r = await PROVIDERS[name](call, p, ctl.signal); clearTimeout(tm);
        if (r) { entry = { status: 'ok', ...r, source: name, t: Date.now() }; break; }
      } catch (e) { failed++; }
    }
    // "nobody knows this flight" is remembered; "couldn't reach anyone" is retried in a few minutes
    if (entry.status === 'ok' || failed < cfg.routeSources.length) remember(call, entry); else entry.t = Date.now() - cfg.routeCacheHours * 3600e3 + 3 * 60e3;
    mem.set(call, entry); done(entry); ctx.bus.emit('routes', call);
    await new Promise(r => setTimeout(r, 350));               // be gentle with the free services
  }
  busy = false;
}

/**
 * The route for a plane, right now, without waiting: an entry whose status is
 *   'private' (no flight number) | 'loading' (asked, answer coming — listen for the 'routes' bus event) |
 *   'ok' ({ airline, from, to }) | 'none' (nobody knows it).
 * Pass { fetch: false } to only peek at what is already known.
 */
export function routeOf(ctx, p, { fetch: go = true } = {}) {
  if (!hasFlightNumber(p)) return { status: 'private' };
  const call = p.call.toUpperCase(), ttl = ctx.config.planes.routeCacheHours * 3600e3;
  let e = mem.get(call);
  if (!e) { const s = saved()[call]; if (s) { e = s; mem.set(call, s); } }
  if (e && (e.status === 'loading' || Date.now() - e.t < ttl)) return e;
  if (!go || !isNativeApp()) return e || { status: 'none' };
  e = { status: 'loading', t: Date.now() }; mem.set(call, e);
  e.promise = new Promise(done => queue.push({ call, p, done }));
  work(ctx);
  return e;
}

/** Same, but waits (up to `ms`) for the answer — used by alerts, which fire once. */
export async function routeSoon(ctx, p, ms = 2500) {
  const e = routeOf(ctx, p);
  if (e.status !== 'loading') return e;
  return Promise.race([e.promise, new Promise(r => setTimeout(() => r(e), ms))]);
}

const gcKm = (a, b) => {                        // great-circle distance
  const h = Math.sin((b.lat - a.lat) * RAD / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin((b.lon - a.lon) * RAD / 2) ** 2;
  return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
};

/**
 * How far along its trip is the plane? -> { frac 0..1, kmLeft, minLeft, offRoute } or null if the airports' positions
 * aren't known. offRoute = the plane is far from the straight line between the two airports, so the route on file
 * is probably out of date (airlines re-use flight numbers).
 */
export function routeProgress(e, p) {
  if (!e || e.status !== 'ok' || e.from.lat == null || e.to.lat == null) return null;
  const done = gcKm(e.from, p), left = gcKm(p, e.to), total = gcKm(e.from, e.to);
  return { frac: Math.max(0, Math.min(1, done / Math.max(1, done + left))), kmLeft: left, minLeft: p.gsKt > 60 ? left / (p.gsKt * 1.852) * 60 : null, offRoute: done + left > total * 1.3 + 250 };
}

const place = (a) => (a.city && a.code ? `${a.city} (${a.code})` : a.city || a.code);
/** One line for lists, alerts and "What's this?": "American Airlines · New York (JFK) → London (LHR)". '' while unknown. */
export function routeLine(e) {
  if (!e) return '';
  if (e.status === 'private' || e.status === 'none') return 'Private / no route';
  if (e.status !== 'ok') return '';
  return `${e.airline ? e.airline + ' · ' : ''}${place(e.from)} → ${place(e.to)}`;
}

export const fmtLeft = (min) => (min == null ? '' : min < 1 ? 'landing now' : min < 60 ? `about ${Math.round(min)} min left` : `about ${Math.floor(min / 60)} h ${Math.round(min % 60)} min left`);
