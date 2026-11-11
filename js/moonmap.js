// moonmap.js — the Moon's surface: named seas, craters and Apollo landing sites, plus a generated
// brightness-and-height map used to draw a realistic globe. Pure data + maths, no screen code.
//
// Coordinates are the standard Moon latitude / longitude in degrees (north and east positive; lon 0 is the
// middle of the side facing Earth, east is the Mare Crisium side).
// rank: 1 = always labelled, 2 = when zoomed in a little, 3 = when zoomed in a lot.
//
// TO ADD A FEATURE: add one row to SEAS, CRATERS, or APOLLO.

const RAD = Math.PI / 180;

// [name, lat, lon, half-height°, half-width°, rank, plain-English note]
export const SEAS = [
  ['Mare Imbrium', 34, -16, 14, 19, 1, 'Sea of Showers — a giant lava-filled impact basin, 1,100 km wide'],
  ['Oceanus Procellarum', 18, -57, 24, 17, 1, 'Ocean of Storms — the largest dark plain on the Moon'],
  ['Mare Serenitatis', 28, 18, 10, 11, 1, 'Sea of Serenity'],
  ['Mare Tranquillitatis', 8.5, 31, 9, 13, 1, 'Sea of Tranquility — where Apollo 11 landed'],
  ['Mare Crisium', 17, 59, 7, 9, 1, 'Sea of Crises — the dark oval near the east edge, easy in binoculars'],
  ['Mare Fecunditatis', -7.8, 51, 11, 9, 1, 'Sea of Fertility'],
  ['Mare Nectaris', -15.2, 35.5, 5.5, 5.5, 2, 'Sea of Nectar'],
  ['Mare Nubium', -21.3, -16.6, 9, 11, 1, 'Sea of Clouds'],
  ['Mare Humorum', -24.4, -38.6, 6.5, 6.5, 2, 'Sea of Moisture'],
  ['Mare Frigoris', 56, 1, 4, 26, 2, 'Sea of Cold — a long dark strip across the north'],
  ['Mare Vaporum', 13.3, 3.6, 4, 4, 3, 'Sea of Vapours'],
  ['Mare Cognitum', -10, -23, 5, 6, 3, 'The Known Sea'],
  ['Mare Insularum', 7.5, -31, 7, 8, 3, 'Sea of Islands'],
  ['Sinus Iridum', 44.1, -31.5, 4, 4.5, 2, 'Bay of Rainbows — a half-drowned crater on the edge of Mare Imbrium'],
  ['Sinus Medii', 2.4, 1.7, 3, 3, 3, 'Central Bay — the middle of the Moon’s face'],
  ['Mare Smythii', 1.3, 87.5, 5, 5, 3, 'Smyth’s Sea, right on the east limb'],
  ['Mare Marginis', 13.3, 86.1, 5, 5, 3, 'Border Sea, right on the east limb'],
  ['Mare Humboldtianum', 56.8, 81.5, 4, 5, 3, 'Humboldt’s Sea, on the north-east limb'],
  ['Mare Orientale', -19.4, -92.8, 5, 5, 2, 'Eastern Sea — a bullseye basin just round the west limb'],
  ['Mare Moscoviense', 27.3, 147.9, 4.5, 5, 2, 'Sea of Moscow — one of the few seas on the far side'],
  ['Mare Ingenii', -33.7, 163.5, 4, 5, 3, 'Sea of Cleverness, on the far side'],
  ['Mare Australe', -38.9, 93, 8, 9, 3, 'Southern Sea, on the south-east limb'],
];

// [name, lat, lon, width km, rank, kind ('' | 'rays' | 'dark'), note]
export const CRATERS = [
  ['Tycho', -43.3, -11.4, 85, 1, 'rays', 'Young crater with bright rays that cross half the Moon — obvious at full Moon'],
  ['Copernicus', 9.6, -20.1, 93, 1, 'rays', 'Terraced walls and a ray system — a showpiece near the middle of the face'],
  ['Kepler', 8.1, -38, 32, 2, 'rays', 'Small but bright, with its own rays'],
  ['Aristarchus', 23.7, -47.4, 40, 1, 'rays', 'The brightest spot on the Moon'],
  ['Plato', 51.6, -9.4, 101, 1, 'dark', 'A dark, flat, lava-filled floor — looks like a grey lake'],
  ['Clavius', -58.4, -14.4, 225, 1, '', 'One of the largest craters, with a curved chain of smaller craters inside'],
  ['Ptolemaeus', -9.2, -1.8, 153, 2, '', 'A huge walled plain near the centre of the face'],
  ['Alphonsus', -13.4, -2.8, 119, 3, '', 'Ranger 9 crashed here in 1965'],
  ['Arzachel', -18.2, -1.9, 97, 3, '', 'Deep, with a central peak'],
  ['Archimedes', 29.7, -4, 83, 2, 'dark', 'A flooded crater on the edge of Mare Imbrium'],
  ['Eratosthenes', 14.5, -11.3, 58, 3, '', 'At the end of the Apennine mountains'],
  ['Grimaldi', -5.2, -68.6, 172, 2, 'dark', 'A very dark floor near the west limb'],
  ['Gassendi', -17.5, -39.9, 110, 2, '', 'On the shore of Mare Humorum, floor full of cracks'],
  ['Theophilus', -11.4, 26.4, 100, 2, '', 'Sharp rim and tall central peaks'],
  ['Langrenus', -8.9, 60.9, 132, 2, '', 'Bright crater on the edge of Mare Fecunditatis'],
  ['Petavius', -25.3, 60.4, 177, 3, '', 'Huge crater with a crack running across its floor'],
  ['Posidonius', 31.8, 29.9, 95, 3, '', 'On the shore of Mare Serenitatis'],
  ['Aristoteles', 50.2, 17.4, 87, 3, '', 'Paired with Eudoxus to its south'],
  ['Eudoxus', 44.3, 16.3, 67, 3, '', 'Paired with Aristoteles to its north'],
  ['Proclus', 16.1, 46.8, 28, 3, 'rays', 'Small, very bright, with fan-shaped rays'],
  ['Schickard', -44.4, -54.6, 227, 3, '', 'A giant walled plain in the south-west'],
  ['Bullialdus', -20.7, -22.2, 61, 3, '', 'Handsome crater in Mare Nubium'],
  ['Hipparchus', -5.5, 4.8, 150, 3, '', 'An ancient, worn-down crater'],
  ['Maginus', -50, -6.2, 163, 3, '', 'Big battered crater near Tycho'],
  ['Longomontanus', -49.5, -21.7, 145, 3, '', 'Large southern crater'],
  ['Atlas', 46.7, 44.4, 87, 3, '', 'Paired with Hercules'],
  ['Hercules', 46.7, 39.1, 69, 3, 'dark', 'Paired with Atlas'],
  ['Endymion', 53.6, 56.5, 125, 3, 'dark', 'Dark-floored crater in the north-east'],
  ['Cleomedes', 27.7, 55.5, 126, 3, '', 'Just north of Mare Crisium'],
  ['Fracastorius', -21.2, 33, 124, 3, '', 'A crater half-drowned by Mare Nectaris'],
  ['Pythagoras', 63.5, -62.8, 130, 3, '', 'Deep crater near the north-west limb'],
  ['Montes Apenninus', 18.9, -3.7, 0, 2, 'mount', 'The Apennine mountains — peaks up to 5 km, superb near half Moon'],
  ['Vallis Alpes', 48.5, 3.2, 0, 3, 'mount', 'The Alpine Valley — a straight cut through the lunar Alps'],
  ['Rupes Recta', -21.8, -7.8, 0, 3, 'mount', 'The Straight Wall — a 110 km cliff'],
  ['Tsiolkovskiy', -20.4, 129.1, 185, 2, 'dark', 'Far side: a crater with a strikingly dark lava floor'],
  ['Korolev', -4, -157.4, 437, 3, '', 'Far side: a huge double-ringed basin'],
  ['Apollo basin', -36.1, -151.8, 524, 3, '', 'Far side: a basin named for the Apollo programme'],
  ['Daedalus', -5.9, 179.4, 93, 3, '', 'Far side: almost exactly opposite Earth'],
];

// [mission, lat, lon, date, crew on the surface, place]
export const APOLLO = [
  [11, 0.674, 23.473, 'July 20, 1969', 'Neil Armstrong & Buzz Aldrin', 'Sea of Tranquility — the first people on the Moon'],
  [12, -3.012, -23.422, 'November 19, 1969', 'Pete Conrad & Alan Bean', 'Ocean of Storms — landed beside the Surveyor 3 probe'],
  [14, -3.645, -17.471, 'February 5, 1971', 'Alan Shepard & Edgar Mitchell', 'Fra Mauro hills — Shepard hit golf balls here'],
  [15, 26.132, 3.634, 'July 30, 1971', 'David Scott & James Irwin', 'Hadley Rille, at the foot of the Apennines — first lunar rover'],
  [16, -8.973, 15.5, 'April 21, 1972', 'John Young & Charles Duke', 'Descartes highlands'],
  [17, 20.191, 30.772, 'December 11, 1972', 'Gene Cernan & Harrison Schmitt', 'Taurus–Littrow valley — the last people on the Moon'],
];

/** Every labelled feature as { id, kind: 'sea'|'crater'|'mount'|'apollo', name, lat, lon, rank, sizeDeg, lines }. */
export const FEATURES = [
  ...APOLLO.map(([n, lat, lon, date, crew, place]) => ({ id: 'apollo' + n, kind: 'apollo', name: 'Apollo ' + n, lat, lon, rank: 1, sizeDeg: 0, lines: [`Landed ${date}`, crew, place, 'Far too small to see from Earth — but you can find the spot'] })),
  ...SEAS.map(([name, lat, lon, h, w, rank, note]) => ({ id: 'sea:' + name, kind: 'sea', name, lat, lon, rank, sizeDeg: Math.max(h, w), lines: [note, `About ${Math.round(Math.max(h, w) * 2 * 30.3 / 50) * 50} km across · a dark plain of ancient lava`, Math.abs(lon) > 95 ? 'On the far side — never visible from Earth' : 'Visible to the naked eye as a dark patch'] })),
  ...CRATERS.map(([name, lat, lon, km, rank, kind, note]) => ({ id: 'cr:' + name, kind: kind === 'mount' ? 'mount' : 'crater', name, lat, lon, rank, sizeDeg: km / 60.66, lines: [note, km ? `${km} km across` : 'Best when the lit edge is nearby and shadows are long', Math.abs(lon) > 95 ? 'On the far side — never visible from Earth' : km >= 80 || kind === 'rays' ? 'Within reach of steady binoculars' : 'Needs a small telescope'] })),
];

/** Unit vector for a latitude/longitude, in the Moon's own axes (x = centre of near side, y = east limb, z = north). */
export const llVec = (lat, lon) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];

// ---------- generated surface map ----------
// Not a photo: brightness and height are built from the lists above plus a sprinkling of small random craters,
// so the big features are in their true places and everything else is believable texture.
const MW = 1024, MH = 512;
let map = null;

/** -> { w, h, alb, gx, gy } Float32Arrays; alb = brightness 0..1, gx/gy = slope toward east/north. Built once. */
export function moonMap() {
  if (map) return map;
  const alb = new Float32Array(MW * MH), hgt = new Float32Array(MW * MH);
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const latOf = (j) => 90 - (j + 0.5) * 180 / MH, lonOf = (i) => (i + 0.5) * 360 / MW - 180;
  // highlands: bright with gentle mottling
  const nz = Array.from({ length: 64 * 32 }, rnd);
  for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
    const a = nz[((j >> 4) % 32) * 64 + ((i >> 4) % 64)], b = nz[((j >> 2) % 32) * 64 + ((i >> 2) % 64)];
    alb[j * MW + i] = 0.84 + 0.07 * (a - 0.5) + 0.04 * (b - 0.5);
  }
  /** Visit every map cell within `reach` degrees of a point: fn(cellIndex, dLat, dLonScaled, cellLat). */
  const around = (lat, lon, reach, fn) => {
    const j0 = Math.max(0, Math.floor((90 - lat - reach) * MH / 180)), j1 = Math.min(MH - 1, Math.ceil((90 - lat + reach) * MH / 180));
    for (let j = j0; j <= j1; j++) {
      const la = latOf(j), cl = Math.max(0.05, Math.cos(la * RAD)), span = Math.min(180, reach / cl);
      const i0 = Math.floor((lon - span + 180) * MW / 360), i1 = Math.ceil((lon + span + 180) * MW / 360);
      for (let ii = i0; ii <= i1; ii++) {
        const i = ((ii % MW) + MW) % MW;
        let dl = lonOf(i) - lon; dl = ((dl + 540) % 360) - 180;
        fn(j * MW + i, la - lat, dl * cl);
      }
    }
  };
  // seas: dark lava plains with soft, slightly ragged shores
  for (const [, lat, lon, h, w] of SEAS) {
    around(lat, lon, Math.max(h, w) * 1.25, (q, dLat, dLon) => {
      const d = Math.hypot(dLat / h, dLon / w) + 0.12 * (nz[(q * 7) % nz.length] - 0.5);
      const f = Math.max(0, Math.min(1, (1.1 - d) / 0.28));
      if (f > 0) alb[q] = alb[q] * (1 - f) + (0.47 + 0.05 * (nz[(q * 3) % nz.length] - 0.5)) * f;
    });
  }
  // craters: a bowl with a raised rim; some have dark floors or bright rays
  const stamp = (lat, lon, rc, kind) => {
    const rays = kind === 'rays', ph = rnd() * 6.28, spokes = 5 + Math.floor(rnd() * 5);
    around(lat, lon, rays ? rc * 9 : rc * 1.6, (q, dLat, dLon) => {
      const t = Math.hypot(dLat, dLon) / rc;
      if (t < 1) hgt[q] -= 0.16 * rc * (1 - t * t);
      if (t < 1.6) { hgt[q] += 0.07 * rc * Math.exp(-(((t - 1) / 0.2) ** 2)); alb[q] += 0.05 * Math.exp(-(((t - 1) / 0.25) ** 2)); }
      if (kind === 'dark' && t < 0.85) alb[q] = alb[q] * 0.25 + 0.44 * 0.75;
      if (rays) {
        alb[q] += 0.2 * Math.exp(-((t / 1.4) ** 2));
        if (t > 1 && t < 9) alb[q] += 0.11 * Math.exp(-t / 4) * Math.pow(0.5 + 0.5 * Math.cos(spokes * Math.atan2(dLat, dLon) + ph), 6);
      }
    });
  };
  for (const [, lat, lon, km, , kind] of CRATERS) if (km) stamp(lat, lon, km / 60.66, kind);
  for (let n = 0; n < 1100; n++) {
    const lat = Math.asin(rnd() * 2 - 1) / RAD, lon = rnd() * 360 - 180, rc = 0.8 + 1.8 * Math.pow(rnd(), 3);
    stamp(lat, lon, rc, '');
  }
  // slopes (used to shade crater walls when the Sun is low)
  const gx = new Float32Array(MW * MH), gy = new Float32Array(MW * MH), dDeg = 360 / MW;
  for (let j = 1; j < MH - 1; j++) {
    const cl = Math.max(0.05, Math.cos(latOf(j) * RAD));
    for (let i = 0; i < MW; i++) {
      const q = j * MW + i, e = j * MW + (i + 1) % MW, w = j * MW + (i + MW - 1) % MW;
      gx[q] = (hgt[e] - hgt[w]) / (2 * dDeg * cl); gy[q] = (hgt[q - MW] - hgt[q + MW]) / (2 * dDeg);
      alb[q] = Math.max(0.3, Math.min(1, alb[q]));
    }
  }
  map = { w: MW, h: MH, alb, gx, gy };
  return map;
}
