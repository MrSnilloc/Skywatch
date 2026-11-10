// config.js — every tunable value for Sky Watch lives here.
// Change a number here and the whole app follows; nothing is hard-coded elsewhere.

export const CONFIG = {
  appName: 'Sky Watch',
  version: '0.3.0',

  // First-run defaults. The user can change all of these in Settings.
  defaults: {
    lat: 36.65,              // approx. ZIP 24133 — use GPS in Settings for exact
    lon: -80.1,
    elev: 400,               // metres above sea level
    locName: 'Home (ZIP 24133)',
    declAuto: true,          // work out the compass correction from the location automatically
    declination: -8.5,       // manual compass correction in degrees (west = negative), used when declAuto is off
    azOffset: 0,             // extra compass trim set by "Calibrate" on the Point screen
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
    // Starlink "trains": satellites from launches in the last 30 days still fly in a visible line.
    starlinkUrl: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=last-30-days&FORMAT=tle',
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
};
