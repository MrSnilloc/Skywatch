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
