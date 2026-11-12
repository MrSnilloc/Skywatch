// config.js — every tunable value for UpSight lives here.
// Change a number here and the whole app follows; nothing is hard-coded elsewhere.

export const CONFIG = {
  appName: 'UpSight',
  version: '0.35.0',
  rotatingViews: ['sky'],    // only these screens turn sideways with the phone; the rest stay upright (Android app),

  // First-run defaults. The user can change all of these in Settings.
  defaults: {
    lat: 36.65,              // approx. ZIP 24133 — use GPS in Settings for exact
    lon: -80.1,
    elev: 400,               // metres above sea level
    locName: 'Home (ZIP 24133)',
    declAuto: true,          // work out the compass correction from the location automatically
    declination: -8.5,       // manual compass correction in degrees (west = negative), used when declAuto is off
    azOffset: 0,             // saved compass calibration offset in degrees, east positive (see calibration.js)
    hour12: true,
    nightMode: false,        // red night-vision theme
    showFab: true,           // floating "What's this?" camera button
    planeAlerts: true,       // Look Up shows planes about to pass overhead
    minPeakEl: 10,           // hide ISS passes that never climb above this many degrees
    showAllPasses: false,    // also list passes that can't be seen (daylight / ISS in shadow)
  },

  iss: {
    noradId: 25544,
    // Tried in order until one answers. All allow browser (CORS) requests.
    tleSources: [
      'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle',
      'https://api.wheretheiss.at/v1/satellites/25544/tles?format=text',
      'https://tle.ivanstanojevic.me/api/tle/25544',
    ],
    fetchTimeoutMs: 8000,
    refreshHours: 6,         // re-download orbit data when older than this
    tleWarnDays: 10,         // warn that predictions may drift when data is older
    passDays: 10,            // how far ahead to search
    scanStepSec: 20,         // coarse scan step (finds every pass)
    trackStepSec: 10,        // detail step inside a pass (drives the little sky-path drawing)
    darkSunAlt: -6,          // observer's Sun must be this far below the horizon (civil twilight)
    minVisibleEl: 5,         // a moment only counts as "visible" above this elevation
    calendarLeadMin: 10,     // calendar reminder fires this many minutes before the pass
  },

  space: {
    // The one speed control shared by every Space view: [app-seconds per real second, label]. Rewind flips the sign.
    speeds: [[1, 'Live'], [60, '1 min/s'], [3600, '1 hr/s'], [86400, '1 day/s']],
    orbitLinesSpeed: 3600,   // at this speed or faster, Earth's satellites are drawn as orbit lines instead of dots
    binoMagLimit: 9.5,       // faintest moon ordinary binoculars can show (higher number = fainter)
    binoGlareRadii: 2,       // a moon closer than this many planet-radii to its planet is lost in the glare
    binoFieldArcmin: 30,     // width of sky shown in "Through binoculars tonight" (the Moon is about 30′ wide)
    // The Moon close-up (moonSurface.js): NASA's real Moon. A missing file just means the simple drawn Moon.
    moon: {
      picture: 'data/moon/moon.jpg',          // colour picture of the whole surface (NASA SVS CGI Moon Kit)
      heights: 'data/moon/moon_height.jpg',   // heights as grey levels — used for crater shadows near the lit edge
      maxWidth: 4096,          // the picture is shrunk to this width in memory (4096 = full sharpness, about 33 MB while the Moon is open)
      kmPerLevel: 0.08,        // height of one grey level (the picture spans about 20 km, deepest basin to highest peak)
      smooth: 2,               // how many times the heights are blurred before use (hides the picture's graininess)
      relief: 3,               // how strongly slopes are shaded (1 = true to life, which looks flat on a phone)
      gain: 1.3,               // overall brightness of the picture
      contrast: 1.1,           // above 1 = darker seas
      step: 1,                 // one picture dot per this many screen pixels (smaller = sharper but slower)
      dragStep: 2.5,           // …while the view is changing (dragging, time sped up)
      settleMs: 220,           // …and sharpen again this long after it stops changing
    },
    // Real surface maps for the planet close-ups (see planetTextures.js). A missing file just means the simple painted look.
    textures: {
      Mercury: 'data/planets/mercury.jpg', Venus: 'data/planets/venus.jpg', Mars: 'data/planets/mars.jpg', Jupiter: 'data/planets/jupiter.jpg',
      Saturn: 'data/planets/saturn.jpg', Uranus: 'data/planets/uranus.jpg', Neptune: 'data/planets/neptune.jpg',
    },
    ringTexture: 'data/planets/saturn_ring.png',
    ringSpan: [1.16, 2.28],  // where the ring picture's inner and outer edges sit, in Saturn radii
    textureLonShift: {},     // degrees to slide a map sideways if a feature sits at the wrong longitude, e.g. { Mars: 10 }
    // Jupiter's Great Red Spot drifts. Sky & Telescope puts it at System II longitude 91° on June 1, 2026, moving
    // about 1.75° a month. UPDATE lonSys2 + at ONCE A YEAR OR SO from their "Transit Times of Jupiter's Great Red Spot" page.
    jupiterSpot: { lonSys2: 91, at: '2026-06-01T00:00:00Z', driftPerYear: 21, mapLonWest: 46 },   // mapLonWest = where the spot is in jupiter.jpg
  },

  identify: {               // "What's this?" (identify.js)
    radiusDeg: 25,           // search this far around the aim point (phone compasses can be 10–20° off)
    sureDeg: 8,              // a match this close to the aim point is called "Identified!"
    farWeight: 0.25,         // how much something at the edge of the circle still counts (0 = not at all, 1 = fully)
    moveBonus: 0.15,         // extra weight for things that move (satellites, planes, rockets)
    passBonus: 0.35,         // extra weight for a highlighted satellite (the ISS) passing over right now
    starMaxMag: 2.6,         // only stars brighter than this are offered
    darkSunAlt: -4,          // stars and planets count once the Sun is this far down
    nightSunAlt: -6,         // below this the aiming view is the live sky map + crosshair instead of the camera
  },

  compass: {
    maxOffsetDeg: 30,        // a calibration bigger than this is refused (metal or a magnet nearby)
    maxAltGapDeg: 20,        // the phone's tilt must be within this of the target's height to count as "aimed at it"
    minTargetAltDeg: 5,      // targets lower than this are too close to the horizon to use
    maxTargetAltDeg: 70,     // targets higher than this are too close to overhead for a compass fix
  },

  sats: {
    // Extra satellites offered on the Passes screen (ISS is built in). Sources are tried in order.
    featured: [
      { id: 'css', name: 'Tiangong', blurb: 'Chinese space station', norad: 48274 },
      { id: 'hst', name: 'Hubble', blurb: 'Space telescope', norad: 20580 },
    ],
    singleUrl: (n) => [
      `https://celestrak.org/NORAD/elements/gp.php?CATNR=${n}&FORMAT=tle`,
      `https://tle.ivanstanojevic.me/api/tle/${n}`,
    ],
    groupUrl: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle',   // ~150 brightest satellites
    groupMax: 160,
    overheadMinEl: 5,
    // These get a big marker on the Sky map, plus a "pass now" banner and an edge arrow while they can be seen.
    highlight: ['iss'],
    // Starlink "trains": satellites from launches in the last 30 days still fly in a visible line.
    starlinkUrl: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=json',
    starlinkFadeDays: 14,    // after this the train spreads out and dims (still listed, marked "fading")        // sky map marks satellites above this elevation
  },

  launches: {
    // Launch Library 2 (The Space Devs) — free; limited to ~15 requests/hour, so results are cached.
    url: 'https://ll.thespacedevs.com/2.3.0/launches/upcoming/?limit=30&mode=normal',
    cacheMin: 60,
    likelyKm: 650,           // pad closer than this: a night/twilight launch is usually easy to see
    maybeKm: 1300,           // closer than this: sometimes visible low on the horizon (e.g. Florida from Virginia)
    // --- estimated path on the Sky map (launchPath.js) ---
    skyBeforeMin: 180,       // show the path from this long before liftoff…
    skyAfterMin: 10,         // …until this long after
    skyMinEl: 0.5,           // only the part at least this many degrees above your horizon
    // A typical two-stage rocket to low orbit: [seconds after liftoff, height km, distance over the ground km]
    ascent: [[0, 0, 0], [60, 8, 2], [90, 20, 9], [120, 38, 27], [150, 62, 68], [180, 85, 125], [240, 120, 285], [300, 150, 490], [360, 175, 750], [420, 195, 1060], [480, 205, 1430], [540, 210, 1860]],
    // Directions (degrees from north) each site is allowed to launch toward. Unknown sites: any direction.
    sites: [
      { name: 'Cape Canaveral / Kennedy', lat: 28.5, lon: -80.6, from: 35, to: 125 },
      { name: 'Wallops Island', lat: 37.85, lon: -75.48, from: 85, to: 140 },
      { name: 'Vandenberg', lat: 34.7, lon: -120.6, from: 130, to: 205 },
      { name: 'Starbase', lat: 25.99, lon: -97.15, from: 80, to: 110 },
    ],
    // Orbit tilt (degrees) guessed from the launch's orbit / name / mission text; first match wins. 'pad' = due east.
    orbits: [
      { match: 'ISS|Crew-|Cargo Dragon|CRS|Cygnus|Starliner|Progress|Soyuz MS|Dream Chaser|Axiom', inclinations: [51.6] },
      { match: 'GTO|GEO|Geostationary|Geosynchronous|TLI|Lunar|Mars|L2|Heliocentric', inclinations: ['pad'] },
      { match: 'SSO|Sun-Synchronous', inclinations: [97.5] },
      { match: 'Polar', inclinations: [90] },
      { match: 'Starlink', inclinations: [53, 43] },
      { match: 'LEO|Low Earth', inclinations: [53, 'pad'] },
    ],
  },

  comets: {
    // Orbit elements for every known comet. Minor Planet Center first, NASA/JPL as backup. Cached for a day.
    urls: [
      'https://www.minorplanetcenter.net/iau/MPCORB/CometEls.txt',
      'https://ssd-api.jpl.nasa.gov/sbdb_query.api?fields=full_name,q,e,i,om,w,tp,M1,K1&sb-kind=c&sb-cdata=' + encodeURIComponent('{"AND":["M1|DF"]}'),
    ],
    cacheHours: 24,
    listMag: 12,             // Events lists comets predicted brighter than this (lower = brighter)
    mapMag: 10,              // Sky map / Space view draw comets brighter than this
    nakedEyeMag: 6, binocularMag: 9,
  },

  planes: {
    // Free live aircraft feeds (ADS-B), tried in order. {lat} {lon} {nm} are filled in.
    // Web browsers block these feeds for web apps (no CORS), so live planes need the Android app,
    // which fetches natively. The web version shows a note instead.
    sources: [
      'https://api.adsb.lol/v2/point/{lat}/{lon}/{nm}',
      'https://api.airplanes.live/v2/point/{lat}/{lon}/{nm}',
      'opensky',
    ],
    radiusNm: 60,            // look this far around you (nautical miles, ~110 km)
    refreshSec: 10,
    // Colour by altitude (feet): [below this height, colour, label]. Used by the map, radar, Sky map and their key.
    altBands: [[5000, '#ff9a4d', 'under 5k'], [15000, '#ffd27a', '5–15k'], [28000, '#9fe0ff', '15–28k'], [Infinity, '#5cc8ff', 'above 28k']],
    // Flight routes (routes.js): tried in order. adsb.lol's list is public-domain; adsbdb.com is a free public API whose
    // route data carries a "not to be copied or published without permission" notice — fine for looking a flight up,
    // but get permission (or remove 'adsbdb' here) before publishing the app on Google Play.
    routeSources: ['adsblol', 'adsbdb'],
    routeCacheHours: 6,      // remember each flight's route this long
    routeTimeoutMs: 6000,
    minEl: 1,                // only draw planes at least this far above your horizon
    // Dark map, no key needed: Esri "Dark Gray Canvas" (base + labels). If it fails, OpenStreetMap, darkened.
    mapLayers: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    ],
    mapAttribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    mapFallback: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    mapFallbackAttribution: '© OpenStreetMap contributors',
    overheadKm: 4,           // "passing overhead" means within this distance
    overheadSec: 300,        // ...within the next 5 minutes
  },

  // Aurora (aurora.js): NOAA SWPC 3-day Kp forecast — US government, public domain, free, no key.
  aurora: {
    forecastUrl: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json',
    cacheMin: 60,            // NOAA updates it a few times a day; ask at most this often
    poleLat: 80.7, poleLon: -72.7,   // Earth's magnetic (dipole) north pole, 2025
    ovalLatAtKp0: 66.5,      // magnetic latitude of the aurora's edge in calm conditions…
    degPerKp: 2,             // …and how far it moves toward the equator per Kp step
    horizonReachDeg: 4,      // it can be seen low on the horizon this many degrees beyond its edge
    minKp: 4,                // never call it a chance below this, even in the far north
    slimKp: 1,               // within this much Kp of what's needed = "slim chance" card (no alert)
    darkSunAlt: -8,          // the Sun must be this far below the horizon
  },

  // Projected paths (paths.js): dotted line ahead with minute marks, faded trail behind.
  paths: {
    planeAheadMin: 0,        // dotted line ahead of EVERY plane, in minutes (0 = none: it cluttered the map)
    planeAheadSelMin: 10,    // the plane you tapped: longer, with "+1 min" labels
    satAheadMin: 5,          // Sky map: satellites you can see (and the ISS, and the one you tapped)
    satTrailMin: 3,
    spaceMarksMin: 10,       // Space view: minute marks this far ahead of the satellite you tapped
    stepSec: 15,             // one point every this many seconds (must divide 60)
    labelGapPx: 26,          // minute labels closer together than this are skipped
  },

  sky: {
    // Naked-eye planets are shown by default; the rest sit behind a "telescope" fold.
    planets: ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
    farPlanets: ['Uranus', 'Neptune'],
    planetColors: {
      Mercury: '#b9b2a8', Venus: '#fff0c4', Mars: '#ff7b5c', Jupiter: '#ffd9a0',
      Saturn: '#e8d49a', Uranus: '#9fe8f0', Neptune: '#7aa5ff',
    },
    fullFadeMs: 3500,        // full-screen Sky map: controls fade out after this long without a touch
    sunMinElongation: 12,    // planets closer to the Sun than this are "lost in the glare"
    heavyRefreshMs: 60000,   // rise/set + moon phases are recomputed this often
    lightRefreshMs: 5000,    // positions on the Tonight screen refresh this often
  },

  geo: {
    zipApi: 'https://api.zippopotam.us/us/',   // free ZIP -> latitude/longitude lookup
    timeoutMs: 8000,
  },

  showers: {
    minAlt: 20,              // radiant must be this high for a "good" viewing window
    darkSunAlt: -12,         // night counts as dark when the Sun is this far below the horizon
    stepMin: 15,             // sampling step when planning tonight
    lookaheadHours: 30,      // how far ahead to look for the next dark stretch
    moonGood: 0.25,          // Moon fuller than this starts to wash out faint meteors
    moonBad: 0.6,            // ...and is a real problem above this
  },

  point: {
    fovDeg: 40,              // angular radius shown by the finder ring
    lockDeg: 3,              // "on target" when within this many degrees
    smoothing: 0.22,         // 0..1 — higher = snappier, lower = steadier compass
  },

  notify: {
    // Phone notifications (Android app). Each type gets its own switch in Settings → Notifications and its own
    // Android channel, so it can also be silenced from the phone's settings.
    // TO ADD A TYPE: add an entry here, then teach notify.js how to find its moments (see BUILDERS there).
    types: [
      { id: 'iss', group: 'Passes', icon: '🛰', label: 'ISS', hint: 'Visible passes only', on: true, leads: [5, 10, 30], lead: 10 },
      { id: 'css', group: 'Passes', icon: '🛰', label: 'Tiangong', hint: 'Chinese space station', on: true, leads: [5, 10, 30], lead: 10 },
      { id: 'hst', group: 'Passes', icon: '🔭', label: 'Hubble', hint: 'Visible passes', on: false, leads: [5, 10, 30], lead: 10 },
      { id: 'starlink', group: 'Passes', icon: '⋯', label: 'Starlink trains', hint: 'Fresh launches only', on: true, leads: [5, 10, 30], lead: 10 },
      { id: 'eclipse', group: 'Events', icon: '🌘', label: 'Eclipses', hint: 'Day before + when it starts', on: true, quietOk: true },
      { id: 'moon', group: 'Events', icon: '🌕', label: 'Special moons', hint: 'Super, blue, harvest — at moonrise', on: true },
      { id: 'shower', group: 'Events', icon: '☄', label: 'Meteor shower peaks', hint: 'Evening of the peak night', on: true },
      { id: 'launch', group: 'Events', icon: '🚀', label: 'Launches you could see', hint: '30 min before + liftoff', on: false },
      { id: 'comet', group: 'Events', icon: '☄', label: 'Bright comets', hint: 'When one is bright enough to see', on: true },
      { id: 'aurora', group: 'Events', icon: '🌌', label: 'Aurora', hint: 'When a storm is strong enough for your latitude', on: true, quietOk: true },
      { id: 'daily', group: 'Daily and live', icon: '👁', label: 'Tonight’s sky summary', hint: 'Only when it looks clear', on: true,
        times: [['sunset', 'Sunset'], [18, '6 PM'], [20, '8 PM']], time: 18 },
      { id: 'planes', group: 'Daily and live', icon: '✈', label: 'Planes overhead', hint: 'Only while the app is open', on: false },
    ],
    quiet: { on: true, from: 22, to: 7 },   // no alerts in this window (types marked quietOk still come through)
    passDays: 7,             // schedule passes this far ahead
    eventDays: 45,           // ...and events this far ahead
    dailyDays: 3,            // daily summaries (the cloud forecast only reaches ~3 days)
    dayBeforeHour: 19,       // "tomorrow: eclipse" reminder time (7 PM the day before)
    showerHour: 21,          // meteor-shower reminder time on the peak evening
    cloudyPct: 70,           // skip the daily summary when the evening looks cloudier than this
    maxScheduled: 60,        // Android keeps a limited number of alarms per app — stay well under it
  },
};

// One on/off setting (and lead time / time of day where offered) per notification type, plus quiet hours.
for (const t of CONFIG.notify.types) {
  CONFIG.defaults['n_' + t.id] = t.on;
  if (t.leads) CONFIG.defaults['n_' + t.id + '_lead'] = t.lead;
  if (t.times) CONFIG.defaults['n_' + t.id + '_time'] = t.time;
}
Object.assign(CONFIG.defaults, { quietOn: CONFIG.notify.quiet.on, quietFrom: CONFIG.notify.quiet.from, quietTo: CONFIG.notify.quiet.to });
