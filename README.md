# UpSight

An Android-friendly sky app: ISS flyover times, planets, the Moon, and a finder that points your phone at any of them.
Dark theme, plus a red night-vision mode (Settings → Red night mode).

## Put it on your phone (no terminal needed)

The app must be on an **https** web address for the compass, GPS and "install" to work. GitHub Pages gives you one free:

1. On github.com click **New repository**. Name it `skywatch`, choose **Public**, click **Create**.
2. Click **uploading an existing file**. Drag in *everything inside this folder* (index.html, sw.js, manifest.webmanifest, and the `css`, `js`, `lib`, `icons` folders). Click **Commit changes**.
3. Go to the repository's **Settings → Pages**. Under *Build and deployment* choose **Deploy from a branch**, pick `main` and `/ (root)`, click **Save**.
4. After a minute the page shows your address: `https://YOUR-NAME.github.io/skywatch/`.
5. Open that address in **Chrome on your phone**. Tap the **⋮ menu → Install app** (or *Add to Home screen*).

It now has its own icon, opens full-screen and works offline (ISS data refreshes whenever you're online).

**Updating later:** upload the changed files to the repository again. In `sw.js` change the number in `skywatch-vN` (for example `skywatch-v2` to `skywatch-v3`) so phones pick up the new version.

## Using it
- **Tonight**: darkness level, Moon phase, planets, next visible ISS pass. Tap anything to point at it.
- **ISS**: list of passes (green = you can actually see it). Tap a pass for details, **Add to calendar** gives you a phone reminder 10 minutes before.
- **Showers**: meteor showers. The top card is the best shower tonight (rough rate per hour, best viewing window, Moon interference). Below it is every major shower by next peak. Tap one for details, **Point at radiant** to aim at the spot the meteors streak from, or **Where to look** for a good place to watch (meteors have the longest trails 40–80° away from the radiant).
- **Point**: hold the *back* of the phone up toward the sky and follow the dot. "On target ✓" turns green when you're lined up.
  If left/right seems consistently off, aim at the Moon and tap **Compass tools → Calibrate**.
- **Settings (gear)**: change location (type a ZIP code, use GPS, or enter coordinates), night mode, minimum pass height, compass correction.
  The compass correction (magnetic declination) is worked out automatically for your location; you can switch it to manual.

## Layout (for adding features)
| File | Job |
|---|---|
| `js/config.js` | **Every tunable number** (data sources, thresholds, colours of planets…) |
| `js/store.js` | Saved settings |
| `js/sky.js` | Sun / Moon / planets maths |
| `js/iss.js`, `js/issService.js` | ISS orbit data, live position, pass prediction |
| `js/compass.js` | Phone sensors → where the phone is pointing |
| `js/magnetic.js` | Magnetic declination for your location (compass → true north) |
| `js/showers.js` | Meteor shower list (**add a shower: one entry**), dates, radiant positions, tonight's plan |
| `js/geo.js` | ZIP code → location lookup |
| `js/skymath.js`, `js/skydata.js`, `data/sky.json` | Sky-map maths, star catalogue loader, ~5,000 stars + constellations |
| `js/satellites.js` | Tiangong, Hubble and the "brightest satellites" list (CelesTrak) |
| `js/outlook.js`, `js/weather.js` | The Look Up plan (today + tonight + next 30 days) and the cloud forecast (Open-Meteo) |
| `js/planes.js`, `js/ufo.js`, `js/views/planes.js` | Live aircraft + where they appear in your sky; UFO log and explanations |
| `js/comets.js` | Comet orbits, positions and brightness estimates |
| `js/launches.js` | Upcoming launches (Launch Library 2) + can-I-see-it check |
| `js/views/space.js`, `data/land.json`, `js/colors.js` | Space tab (globe, Moon, planets), coastlines, shared canvas colours |
| `js/events.js` | Eclipses, special Moons, planet events — pure calculations |
| `js/targets.js` | Everything the finder can aim at |
| `js/back.js` | Android Back button: close sheet/popup → Look Up → exit |
| `js/views/*.js` | The screens (Tonight, Sky, Passes, Events, Point, Settings) |
| `css/style.css` | Look and feel (colours are variables at the top) |

### How to add a feature
- **New screen** (e.g. Meteor Showers, Launches): copy `js/views/tonight.js`, change `id`/`title`, add it to the list in `js/views/index.js`. The bottom bar adds a button automatically.
- **New meteor shower**: add one entry to the list at the top of `js/showers.js`.
- **New thing to aim at** (e.g. a bright star, Tiangong): add a provider to `js/targets.js`. It then appears as a chip on the Point screen.
- **New popup that Back should close**: put `data-back` on its close button (see `js/back.js`). Sheets need nothing.
- **New setting**: add one line to `SECTIONS` in `js/views/settings.js`, and a default in `js/config.js`.
- **Alerts that fire with the app closed**: this web version uses calendar reminders. True background alerts need the Capacitor wrapper (planned next step).

## Live planes
Browsers block the free plane feeds for websites, so live planes (map, radar, overhead alerts, planes in What's this?) work in the **Android app** only. Everything else works in the web version too.

## New in v0.9
- **Space → Earth**: the Sun and Moon are in the scene (the Sun glows behind Earth from the night side); the Moon's shadow darkens Earth during solar eclipses and the Moon turns red in lunar eclipses. **Next eclipse ›** jumps to the next one.
- **Planes** on the Sky map (live ADS-B: adsb.lol / airplanes.live / OpenSky) with callsign, type, altitude, speed, distance; listed in *Find*.
- **🛸 What's this?** — a floating button on every screen — opens the camera with a crosshair (no labels — no spoilers). Tap **What's this?** and UpSight works out what's in the circle (planets, bright stars, satellites, Starlink trains, planes, comets, launches), shows your snapshot with it circled, and lets you save unknowns to the **UFO log**.
- **✈ Planes** chip on the Passes tab: live dark street **Map** (Esri Dark Gray, OpenStreetMap backup) (North-up or Heading-up — turns with your phone; pinch, drag, Follow a plane) and **Radar** (25/50/100 mi, trails, "easy to see" ring, planes heading your way). Colours show altitude. **Look Up** shows a banner when a plane is about to pass overhead (Settings to turn off).

## New in v0.8
- **Comets** (Events → Comets, Look Up, Sky map, Space → Planets): every known comet's orbit (Minor Planet Center / NASA JPL), estimated brightness now and at its best, where to look tonight.
- **Space**: Live speed on every view; real-looking Earth globe and Moon (with its dark seas) in the Moon view; tap a satellite to ring it, highlight its orbit and *Follow it*.
- **Expanded timeline** on Look Up (tap the timeline).

## New in v0.6
- **Launches** (Events → Launches, plus Look Up): upcoming rocket launches worldwide, with whether you could see them from your location (Wallops ≈ likely, Florida ≈ maybe) and which way to look.
- **Space** tab: animated 3D Earth with day/night, coastlines and real satellite orbits; the Earth–Moon system; the solar system from above. Live or sped up.

## New in v0.5
- **Starlink trains** on the Passes tab (and in Look Up / the Sky map): recent launches grouped into trains, with pass times. Trains older than ~2 weeks are marked fading.

## New in v0.4
- **Look Up** replaces Tonight: a plan for today *and* tonight — cloud forecast for three nights, a timeline, what's worth looking at (passes, planets, showers, eclipses incl. daytime solar eclipses, special Moons), and the next 30 days.

## New in v0.3
- **Sky** — live star map. Hold the phone up (Live) or swipe (Drag). Tap anything to identify it; *Find* + *Guide me to it* gives a green arrow. Works in daylight (stars drawn for reference), with a time scrubber (±1 h / ±1 day) and layer toggles.
- **Passes** — ISS, Tiangong, Hubble and a *More…* list of other bright satellites.
- **Events** — lunar and solar eclipses for your location (with local times and eye-safety notes), Blood/Blue/Super/Harvest/Hunter's Moons, planet oppositions, best-view dates and conjunctions, plus the meteor-shower calendar.

## Credits
- Aircraft: adsb.lol, airplanes.live, OpenSky Network (community ADS-B feeds).
- Launch data: The Space Devs — Launch Library 2.
- Coastlines: Natural Earth (public domain) via world-atlas (ISC).
- Cloud forecast: Open-Meteo.com (CC BY 4.0).
- Star and constellation data: d3-celestial (BSD-3-Clause), derived from the Hipparcos/Yale Bright Star catalogues.
Orbit maths: satellite.js (MIT). Sun/Moon/planets/radiants: astronomy-engine (MIT). Magnetic declination: NOAA World Magnetic Model 2025 via geomagnetism (Apache-2.0). ISS orbit data: CelesTrak, with backup sources. ZIP lookup: zippopotam.us. Licences are in `lib/THIRD-PARTY-LICENSES.txt`.
Shower dates follow the International Meteor Organization / American Meteor Society calendars and are approximate.
