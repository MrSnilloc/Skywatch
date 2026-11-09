// config.js — every tunable value for Sky Watch lives here.
// Change a number here and the whole app follows; nothing is hard-coded elsewhere.

export const CONFIG = {
  appName: 'Sky Watch',
  version: '0.1.0',

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
