// Sky Watch relay — a tiny Cloudflare Worker (free tier) that fetches data the browser won't let a web app read
// directly (live plane feeds, NASA's comet list) and passes it on to Sky Watch.
//
//   GET /planes?lat=36.65&lon=-80.10&nm=60   -> live aircraft around a point (ADS-B, first feed that answers)
//   GET /comets                               -> NASA/JPL comet orbits (backup for the Minor Planet Center list)
//   GET /                                     -> "ok" health check
//
// Only Sky Watch can use it: requests from other websites are refused (see ALLOWED_ORIGINS).
// Nothing is stored and no key is needed. To change anything, edit here and press Deploy again.

const ALLOWED_ORIGINS = [
  'https://mrsnilloc.github.io',   // the web app on GitHub Pages
  'capacitor://localhost',          // the future Android/iPhone app
  'https://localhost',
  'http://localhost',
];

const PLANE_FEEDS = [
  (lat, lon, nm) => `https://api.adsb.lol/v2/point/${lat}/${lon}/${nm}`,
  (lat, lon, nm) => `https://api.airplanes.live/v2/point/${lat}/${lon}/${nm}`,
  (lat, lon, nm) => `https://opendata.adsb.fi/api/v2/lat/${lat}/lon/${lon}/dist/${nm}`,
];

const COMETS_URL = 'https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=full_name,q,e,i,om,w,tp,M1,K1&sb-kind=c&sb-cdata='
  + encodeURIComponent('{"AND":["M1|DF"]}');

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

async function cachedFetch(url, seconds, ctx) {
  const cache = caches.default, key = new Request(url);
  let res = await cache.match(key);
  if (res) return res;
  const r = await fetch(url, { headers: { 'User-Agent': 'SkyWatch-relay/1 (personal stargazing app)' }, cf: { cacheTtl: seconds } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  res = new Response(r.body, r);
  res.headers.set('Cache-Control', `public, max-age=${seconds}`);
  ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: allowed ? cors(origin) : {} });
    const url = new URL(request.url);
    if (url.pathname === '/') return new Response('Sky Watch relay ok', { headers: allowed ? cors(origin) : {} });
    if (!allowed) return new Response('Not allowed', { status: 403 });
    const headers = { ...cors(origin), 'Content-Type': 'application/json' };

    try {
      if (url.pathname === '/planes') {
        // round the location a little so nearby requests share the cache
        const num = (k, lo, hi) => { const v = parseFloat(url.searchParams.get(k)); if (!(v >= lo && v <= hi)) throw new Error('bad ' + k); return v; };
        const lat = num('lat', -90, 90).toFixed(2), lon = num('lon', -180, 180).toFixed(2), nm = Math.round(num('nm', 1, 250));
        const errors = [];
        for (const feed of PLANE_FEEDS) {
          const src = feed(lat, lon, nm);
          try {
            const r = await cachedFetch(src, 8, ctx);
            const body = await r.text();
            return new Response(body, { headers: { ...headers, 'X-Source': new URL(src).host } });
          } catch (e) { errors.push(new URL(src).host + ': ' + e.message); }
        }
        return new Response(JSON.stringify({ error: errors.join('; ') }), { status: 502, headers });
      }
      if (url.pathname === '/comets') {
        const r = await cachedFetch(COMETS_URL, 12 * 3600, ctx);
        return new Response(r.body, { headers });
      }
      return new Response(JSON.stringify({ error: 'unknown path' }), { status: 404, headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400, headers });
    }
  },
};
