# UpSight — to-do list

Saved from the owner's list on 2026-11-11. Future sessions: read this first.

## Status: FINISHED FOR NOW (owner, 2026-11-12, v0.35)
Every numbered item is built and the owner is happy with the app. Still unconfirmed on the phone: #3 colour key,
#10 aurora alert (needs a real storm), the upright lock and the v0.35 clean-up. Next time: start from the
"LATER, FOR GOOGLE PLAY" and "ON HOLD" lists, or whatever the owner asks for.

## How to work on this list
- Do **ONE item at a time**, in the order below. When an item is done, say in plain words what changed
  and how to test it on the phone, then **wait for the OK** before starting the next.
- The owner is not a terminal user. If something must be run, give a double-clickable runner or exact steps.
- Keep the dark theme. Keep the code tidy and modular, ready for future add-ons.
- Before using any outside data service, confirm it's free and allowed for use in an app, and report what was found.
- Tick items off here (`[x]`) as they get done.

## ORDER: 7, 4, 11, 5, 3, 2, 6, 1, 10, 9, 8

## Items

- [x] **1. PLANE FLIGHT INFO** *(owner confirmed 2026-11-12)* — look up each callsign's route (adsbdb / adsb.lol; confirm they're free for apps
  first), cached per plane. Show airline name, From → To airports, a progress bar with time left, and
  "Private / no route" for planes with no flight number. Use the route in "What's this?" answers and plane
  alerts. Photos (Planespotters) later, not now.
  - *BUILT 2026-11-11 in v0.27 (`js/routes.js`, sources in `config.planes.routeSources`). Sources checked:
    adsb.lol = free for everyone, ODbL, routes from Virtual Radar Server's CC0 list — BUT its route endpoint was
    returning empty answers on the test day; adsbdb.com = free public API (512 requests/min) that worked, BUT its
    page says the route data "may not be copied, published, or incorporated into other databases without the
    explicit permission of David J Taylor". The app tries adsb.lol first, adsbdb second, asks only for planes the
    user looks at, and caches 6 h. Tested in a browser with a fake plane list + real adsbdb lookup. Waiting for
    the owner's phone test.*

- [x] **2. SKY MAP SIDEWAYS** *(owner confirmed on the phone 2026-11-12, v0.30)* — turning the phone sideways goes full screen (top bar and tabs hidden, controls
  fade, tap to show them). Also add a manual full-screen button.
  - *BUILT 2026-11-11 in v0.27 (`skymap.js` setFull/onTurn; fade time `config.sky.fullFadeMs`). ⛶ button, fade,
    tap-to-show and Back-to-exit tested in a browser. Turning the phone sideways could NOT be tested there.
    The Android status bar stays visible (only the app's own bars hide). Waiting for the owner's phone test.*
  - *Owner 2026-11-12: on the phone the view rotated but stayed shrunk with the bars still showing — the turn was
    never noticed (it relied on a CSS "orientation + coarse pointer" question). FIXED in v0.30: the turn is now
    read from the screen's own shape on every resize/orientation change, and the map is re-sized after it.
    Reproduced and checked in a browser at 812x375. Waiting for the owner's phone test.*

- [ ] **3. PLANE COLOR LEGEND** — altitude key (under 5k ft orange, 5–15k yellow, 15–28k light blue, above 28k
  blue) on the plane map, radar and Sky map.
  - *BUILT 2026-11-11 in v0.27 (bands in `config.planes.altBands`; planes on the Sky map are now coloured by
    altitude too, and the key shows there while a plane is on screen). Waiting for the owner's phone test.*

- [x] **4. BUG: ISS missing from Sky map** *(owner confirmed 2026-11-12)* — the ISS didn't show on the Sky map during a real pass
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

- [x] **5. "WHAT'S THIS?" REWORK** *(owner confirmed 2026-11-12)* — it said "Unidentified" while aimed at the ISS. Use a wider search radius to
  allow for compass error. Rank results by brightness, movement and passes happening right now. At night,
  use the live Sky-map view with a crosshair instead of the camera.

- [x] **6. PROJECTED PATHS** — dotted line ahead of planes and satellites with +1 min time marks, and a faded
  trail behind. On the plane map/radar, the Sky map and the Space view.
  - *BUILT 2026-11-11 in v0.28 (`js/paths.js`, lengths in `config.paths`). Every plane: 3 min dotted line with
    minute dots; the tapped plane: 10 min with "+1 min, +2…" labels. Sky map: planes, plus satellites that are
    visible now / the ISS / the one tapped (5 min ahead, 3 min trail) — not every satellite, to avoid clutter.
    Space (Earth): featured + tapped satellites get half a lap of faded trail and half a lap dotted, with minute
    marks on the tapped one (labels thin out until you zoom in). Browser-tested with fake planes and a replayed
    ISS pass. Owner confirmed on the phone 2026-11-12.*
  - *Owner 2026-11-12: the line ahead of every plane was too cluttered. v0.31: only the tapped plane gets a
    lead line now (`config.paths.planeAheadMin: 0`). Satellites unchanged.*

- [x] **7. ANDROID BACK BUTTON** — Back closes any open sheet or popup first, then returns to the Look Up start
  screen. Only Back on Look Up exits the app. (Capacitor App plugin backButton listener.)
  - *Done 2026-11-11 in v0.20 (`js/back.js`, plugin in `android-app/plugins/app`). Owner confirmed on the phone.*

- [x] **8. SPACE TAB UPGRADE**
  - Rename Planets to "Solar system".
  - Planet picker (Mercury–Neptune), each a close-up with its moons. Jupiter: exact Galilean moons plus their
    shadows crossing the planet. Saturn: rings at the true tilt, plus Titan and others. Mars: Phobos and
    Deimos. Uranus and Neptune: main moons. Mercury/Venus: phase.
  - "Through binoculars tonight" toggle: the moons as you'd see them from the backyard tonight.
  - Earth tab: the Moon orbits and Earth spins when time is sped up; satellites switch to orbit lines at high speed.
  - One shared speed control for all Space views (Live, 1 min/s, 1 hr/s, 1 day/s, rewind).

- [x] **9. MOON CLOSE-UP** — a detailed Moon you can spin, with named craters and seas, the Apollo landing
  sites, and today's lit edge highlighted as the best place to look with binoculars. Real phase and tilt
  for tonight.

- [ ] **10. AURORA ALERTS** — NOAA SWPC free forecast (Kp index / OVATION). Alert when a storm is strong enough
  for my latitude (look north). New "Aurora" switch in Settings → Notifications, plus a Look Up card when
  there's a chance.
  - *BUILT 2026-11-12 in v0.29 (`js/aurora.js`, numbers in `config.aurora`). Source checked: NOAA SWPC 3-day Kp
    forecast — US government, public domain, free for any lawful use, no key; don't imply NOAA endorsement; no
    hard rate limit (app asks at most once an hour). Home (magnetic latitude ~46°) needs about Kp 8–9, so alerts
    will be rare. Alert = storm reaches your latitude during dark hours (comes through quiet hours); Look Up card
    also shows a "slim chance" one Kp step below. The forecast is only refreshed when the app is opened.
    Tested in a browser with the real feed and a faked Kp 9 night. Waiting for the owner's phone test.*

- [x] **11. COMPASS CALIBRATION (one-tap offset)** — pick a target, aim the phone at it, tap Calibrate. Save
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
- 2026-11-11: owner confirmed #8, #9 and #11 on the phone (ticked). #4 and #5 still wait for a night test.
- Owner: Moon craters (blocky near the lit edge) to be improved LATER; Mercury, Venus, Neptune look good.
- **Moon craters DONE in v0.32 (2026-11-12):** the Moon close-up is now painted from NASA's real Moon
  (`data/moon/moon.jpg` + `moon_height.jpg`, NASA Scientific Visualization Studio CGI Moon Kit, public domain,
  560 KB; loader `js/moonSurface.js`, settings `config.space.moon`). The heights shade the craters along the lit
  edge, and the picture is now drawn at screen sharpness however far you zoom (it used to be a 320-dot picture
  stretched). The old drawn Moon is the fallback if the files are missing. Names line up with the real craters
  (checked: Tsiolkovskiy). Browser-tested; waiting for the owner's phone test. The small Moon in the "Orbit"
  view and on the Earth view is still the simple drawn one.

## Added 2026-11-12 in v0.33 (owner's requests after the list was finished) — all waiting for the phone test
- **Moon sharper:** 4096-px NASA picture (same CGI Moon Kit, 2019 colour map, converted to a 1.3 MB JPEG) and the
  close-up is drawn dot-for-dot when still, coarser only while the view is changing (`config.space.moon`).
- **Moon "Shadow on / off" chip:** off = whole Moon evenly lit, like a map.
- **Moon pan:** two-finger drag slides the Moon; the "Drag: spin / slide" chip makes one finger slide instead.
  Recentre undoes it. Spin is unchanged.
- **Other tabs stay upright:** only the screens in `config.rotatingViews` (Sky) turn sideways. Uses our own tiny
  Android plugin (`android-app/.../UprightPlugin.java`, registered in `MainActivity.java`, called from
  `js/platform.js setRotation`). It compiles, but could NOT be tried without a phone.
- **Launch path on the Sky map** (`js/launchPath.js`, numbers in `config.launches`): from 3 h before liftoff to
  10 min after, a red dotted ESTIMATED path with minutes-after-liftoff marks, a pulsing "should be here now" dot,
  and an edge arrow from 15 min before. Direction is guessed from the orbit type and launch-site rules (no free
  source publishes real trajectories); when unsure it draws both possible paths. Layer switch: "Rocket launches".
  Tested in a browser with a made-up Wallops launch. Use the time buttons (+1h, +1d) to preview a future launch.
- **v0.34 — Space "⛶ Clean view" chip** (all Space views): hides every button, caption, the speed bar and the app's
  top bar and tabs; drag and pinch still work; the faint ✕ (top right) or Android Back brings them back. Names
  drawn on the picture stay (the Moon has its own "Names" chip). Owner confirmed v0.33 items look good.
- **v0.35 — clean-up pass (2026-11-12):** fixed planes on the Sky map being drawn twice (once as a "planet" dot
  with a bold name); removed unused imports and leftovers; planet pictures added to the offline list; Earth view
  keeps each highlighted satellite's orbit for 4 s instead of recalculating it every frame; tidier Space time
  label. Every screen, every Events section and every planet close-up opened in a browser with no errors.

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
- Flight routes: get David Taylor's permission for adsbdb.com route data, or remove 'adsbdb' from `config.planes.routeSources`
- Credits screen must list: Solar System Scope (CC BY 4.0), NASA/JPL Horizons, adsb.lol (ODbL), adsbdb.com, NOAA SWPC (aurora forecast),
  NASA's Scientific Visualization Studio (Moon maps)
- Map tiles that are allowed in an app
- Credits screen
- Signed release build
- Trademark check on "UpSight"
- $25 developer account
