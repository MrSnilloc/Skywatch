// config.js — every tunable value for UpSight lives here.
// Change a number here and the whole app follows; nothing is hard-coded elsewhere.

export const CONFIG = {
  appName: 'UpSight',
  version: '0.26.0',

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

  sky: {
    // Naked-eye planets are shown by default; the rest sit behind a "telescope" fold.
    planets: ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'],
    farPlanets: ['Uranus', 'Neptune'],
    planetColors: {
      Mercury: '#b9b2a8', Venus: '#fff0c4', Mars: '#ff7b5c', Jupiter: '#ffd9a0',
      Saturn: '#e8d49a', Uranus: '#9fe8f0', Neptune: '#7aa5ff',
    },
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
