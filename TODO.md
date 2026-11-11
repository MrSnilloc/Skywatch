# UpSight — to-do list

Saved from the owner's list on 2026-11-11. Future sessions: read this first.

## How to work on this list
- Do **ONE item at a time**, in the order below. When an item is done, say in plain words what changed
  and how to test it on the phone, then **wait for the OK** before starting the next.
- The owner is not a terminal user. If something must be run, give a double-clickable runner or exact steps.
- Keep the dark theme. Keep the code tidy and modular, ready for future add-ons.
- Before using any outside data service, confirm it's free and allowed for use in an app, and report what was found.
- Tick items off here (`[x]`) as they get done.

## ORDER: 7, 4, 11, 5, 3, 2, 6, 1, 10, 9, 8

## Items

- [ ] **1. PLANE FLIGHT INFO** — look up each callsign's route (adsbdb / adsb.lol; confirm they're free for apps
  first), cached per plane. Show airline name, From → To airports, a progress bar with time left, and
  "Private / no route" for planes with no flight number. Use the route in "What's this?" answers and plane
  alerts. Photos (Planespotters) later, not now.

- [ ] **2. SKY MAP SIDEWAYS** — turning the phone sideways goes full screen (top bar and tabs hidden, controls
  fade, tap to show them). Also add a manual full-screen button.

- [ ] **3. PLANE COLOR LEGEND** — altitude key (under 5k ft orange, 5–15k yellow, 15–28k light blue, above 28k
  blue) on the plane map, radar and Sky map.

- [ ] **4. BUG: ISS missing from Sky map** — the ISS didn't show on the Sky map during a real pass
  (Nov 10, 2026). Check layer defaults, sunlit/dark filters and orbit-data age. Find the cause before
  changing anything.
  - *Investigated 2026-11-11, nothing changed yet. Replaying the Nov 10 5:52 PM pass (default location, fresh
    orbit data, default layers) DOES draw the ISS, so layer defaults, the sunlit/dark filter and orbit-data age
    are all ruled out as code bugs. Not confirmed on the phone: a saved "Satellites" layer switched off, or the
    time scrubber left off "Now". Most likely cause: in Live mode the portrait view is only ~15° wide each side,
    so a compass error beyond that puts the ISS off-screen, and there is no off-screen cue unless "Guide me" is
    on; the marker is also a small 6 px diamond that looks like every other satellite. Magnetic declination
    (−8.7°) is already applied once, with the right sign (relevant to #11).*
  - *Fix BUILT 2026-11-11 in v0.21 (`js/views/skymap.js`, `config.sats.highlight`): "ISS pass now" banner (tap
    to be guided), blue edge arrow when the ISS is off-screen during a visible pass, bigger ISS marker. Checked
    in a browser replay of the Nov 10 pass. Waiting for the owner's phone test during a real pass — tick the
    box once they say OK.*

- [ ] **5. "WHAT'S THIS?" REWORK** — it said "Unidentified" while aimed at the ISS. Use a wider search radius to
  allow for compass error. Rank results by brightness, movement and passes happening right now. At night,
  use the live Sky-map view with a crosshair instead of the camera.

- [ ] **6. PROJECTED PATHS** — dotted line ahead of planes and satellites with +1 min time marks, and a faded
  trail behind. On the plane map/radar, the Sky map and the Space view.

- [x] **7. ANDROID BACK BUTTON** — Back closes any open sheet or popup first, then returns to the Look Up start
  screen. Only Back on Look Up exits the app. (Capacitor App plugin backButton listener.)
  - *Done 2026-11-11 in v0.20 (`js/back.js`, plugin in `android-app/plugins/app`). Owner confirmed on the phone.*

- [ ] **8. SPACE TAB UPGRADE**
  - Rename Planets to "Solar system".
  - Planet picker (Mercury–Neptune), each a close-up with its moons. Jupiter: exact Galilean moons plus their
    shadows crossing the planet. Saturn: rings at the true tilt, plus Titan and others. Mars: Phobos and
    Deimos. Uranus and Neptune: main moons. Mercury/Venus: phase.
  - "Through binoculars tonight" toggle: the moons as you'd see them from the backyard tonight.
  - Earth tab: the Moon orbits and Earth spins when time is sped up; satellites switch to orbit lines at high speed.
  - One shared speed control for all Space views (Live, 1 min/s, 1 hr/s, 1 day/s, rewind).

- [ ] **9. MOON CLOSE-UP** — a detailed Moon you can spin, with named craters and seas, the Apollo landing
  sites, and today's lit edge highlighted as the best place to look with binoculars. Real phase and tilt
  for tonight.

- [ ] **10. AURORA ALERTS** — NOAA SWPC free forecast (Kp index / OVATION). Alert when a storm is strong enough
  for my latitude (look north). New "Aurora" switch in Settings → Notifications, plus a Look Up card when
  there's a chance.

- [ ] **11. COMPASS CALIBRATION (one-tap offset)** — pick a target, aim the phone at it, tap Calibrate. Save
  offset = the target's true azimuth − the compass heading on the phone, and apply it everywhere (Sky map,
  "What's this?", pointers).
  - Targets: Sun, Moon, Polaris (true north, altitude ≈ latitude), the ISS during a pass, or a landmark
    ("I'm facing true north").
  - Calibrate holding the phone up toward the sky, the same way it's used for aiming, not just lying flat.
  - This also fixes magnetic vs true north (about 8° W where I live). First check whether the app already
    corrects for this, so it isn't applied twice.
  - Show the result ("Compass corrected 8° east"), a small "calibrated" badge while an offset is applied,
    and a Reset button. Save the offset on the phone.
  - If the offset is over ~30°, don't save it; say "Move away from metal or a magnetic case and try again."
  - Sun safety note: don't look straight at the Sun; line up using the phone's shadow or the screen.
  - *BUILT 2026-11-11 in v0.22 (`js/calibration.js`, `js/views/calibrate.js`, limits in `config.compass`).
    Checked first: the app already applied magnetic declination once (correct sign), so the saved offset is
    only the error left over on top of that — nothing is applied twice. All screens (Sky map, "What's this?",
    Point, plane map) now read one shared `compassCorrection()`. Tested with simulated sensors in a browser.
    Waiting for the owner's phone test — tick the box once they say OK.*

## Status note, 2026-11-11 (session stopped at the usage limit)
- **#5 BUILT in v0.23** (`js/identify.js`, night crosshair view in `skymap.js`). Browser-tested; needs phone test.
- **#8 and #9 BUILT in v0.24** but only partly checked (`js/moons.js`, `js/moonmap.js`, `js/views/spacePlanet.js`,
  `js/views/spaceMoon.js`, shared speed bar in `space.js`). Seen working in a browser: Jupiter/Saturn close-ups,
  "Show moons", binoculars view, Moon close-up with names and Apollo flags, shared speeds.
  NOT yet checked: Earth tab orbit lines at high speed, rewind, Mercury/Venus/Mars/Uranus/Neptune close-ups,
  drag-to-spin on a real touch screen, red night mode, moon shadows on Jupiter during a real shadow transit.
  Known rough edges: the top bar wraps ("Solar system" on two lines) when the date text is long; long captions
  overlap the top of the picture when zoomed in; Moon craters look blocky near the lit edge.
- Moon positions for Mars/Saturn/Uranus/Neptune were fitted from NASA JPL Horizons (public domain, used once at
  build time, not by the app). Add JPL to the credits screen.
- None of #4, #5, #8, #9, #11 is ticked: all wait for the owner's phone test.

## Planet look (owner feedback 2026-11-11: painted planets don't look good, Jupiter has no Great Red Spot)
- **BUILT in v0.25:** drag to fly around a planet + "◎ Recentre" chip (also on Earth and the Moon close-up);
  real-image support (`js/planetTextures.js`, file list in `config.space.textures`). With no image files present
  the old painted look is used, so the app still works.
- **DONE in v0.26:** the 8 images are in `data/planets/` (Solar System Scope, CC BY 4.0, shrunk to 1024 px,
  420 KB total; credit added to the README — also needed on the future credits screen). Jupiter's map turns at
  the Great Red Spot's rate and is lined up with Sky & Telescope's position (91° on 2026-06-01, +1.75°/month) in
  `config.space.jupiterSpot` — refresh that once a year. Central-meridian maths checked against Meeus (0.1°).
- Seen in a browser: Jupiter (spot visible), Saturn, Mars. NOT looked at yet: Mercury, Venus, Uranus, Neptune,
  Saturn's ring picture at a wide tilt, red night mode. Other planets' maps are assumed centred on longitude 0;
  if a feature looks misplaced use `config.space.textureLonShift`. Waiting for the owner's phone test.

## ON HOLD (don't build — just kept here)
- 3D spacecraft models (NASA 3D Resources — check license terms).
- A Learning tab with lessons about the Moon, planets and stars.

## LATER, FOR GOOGLE PLAY (don't build yet — just kept here)
- Privacy policy
- Map tiles that are allowed in an app
- Credits screen
- Signed release build
- Trademark check on "UpSight"
- $25 developer account
