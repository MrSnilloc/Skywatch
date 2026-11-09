# Sky Watch

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

**Updating later:** upload the changed files to the repository again. In `sw.js` change `skywatch-v1` to `skywatch-v2` so phones pick up the new version.

## Using it
- **Tonight**: darkness level, Moon phase, planets, next visible ISS pass. Tap anything to point at it.
- **ISS**: list of passes (green = you can actually see it). Tap a pass for details, **Add to calendar** gives you a phone reminder 10 minutes before.
- **Point**: hold the *back* of the phone up toward the sky and follow the dot. "On target ✓" turns green when you're lined up.
  If left/right seems consistently off, aim at the Moon and tap **Compass tools → Calibrate**.
- **Settings (gear)**: GPS location, night mode, minimum pass height, compass declination.

## Layout (for adding features)
| File | Job |
|---|---|
| `js/config.js` | **Every tunable number** (data sources, thresholds, colours of planets…) |
| `js/store.js` | Saved settings |
| `js/sky.js` | Sun / Moon / planets maths |
| `js/iss.js`, `js/issService.js` | ISS orbit data, live position, pass prediction |
| `js/compass.js` | Phone sensors → where the phone is pointing |
| `js/targets.js` | Everything the finder can aim at |
| `js/views/*.js` | The screens (Tonight, ISS, Point, Settings) |
| `css/style.css` | Look and feel (colours are variables at the top) |

### How to add a feature
- **New screen** (e.g. Meteor Showers, Launches): copy `js/views/tonight.js`, change `id`/`title`, add it to the list in `js/views/index.js`. The bottom bar adds a button automatically.
- **New thing to aim at** (e.g. a meteor-shower radiant, a bright star): add a provider to `js/targets.js`. It then appears as a chip on the Point screen.
- **New setting**: add one line to `SECTIONS` in `js/views/settings.js`, and a default in `js/config.js`.
- **Alerts that fire with the app closed**: this web version uses calendar reminders. True background alerts need the Capacitor wrapper (planned next step).

## Credits
Orbit maths: satellite.js (MIT). Sun/Moon/planets: astronomy-engine (MIT). ISS orbit data: CelesTrak, with backup sources.
