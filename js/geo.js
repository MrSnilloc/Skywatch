// geo.js — turn a US ZIP code into a latitude/longitude (needs internet; uses a free lookup service).

/** Returns { lat, lon, name } or throws an Error with a friendly message. */
export async function lookupZip(zip, cfg) {
  zip = String(zip).trim();
  if (!/^\d{5}$/.test(zip)) throw new Error('Enter a 5-digit ZIP code');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  let res;
  try {
    res = await fetch(cfg.zipApi + zip, { signal: ctl.signal });
  } catch (e) {
    throw new Error('Couldn’t reach the ZIP lookup — check your connection');
  } finally { clearTimeout(timer); }
  if (res.status === 404) throw new Error('ZIP code not found');
  if (!res.ok) throw new Error('ZIP lookup failed (' + res.status + ')');
  const data = await res.json();
  const p = data.places && data.places[0];
  if (!p) throw new Error('ZIP code not found');
  const lat = parseFloat(p.latitude), lon = parseFloat(p.longitude);
  if (!isFinite(lat) || !isFinite(lon)) throw new Error('ZIP lookup gave no coordinates');
  return { lat, lon, name: `${p['place name']}, ${p['state abbreviation']} (${zip})` };
}
