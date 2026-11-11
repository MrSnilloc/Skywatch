// back.js — what the Android Back button does. In order:
//   1. close the open sheet (or step back inside it, e.g. Notifications → Settings),
//   2. close a popup on the current screen (info card, camera, selected plane…),
//   3. return to the start screen (Look Up),
//   4. on the start screen: leave the app.
//
// TO MAKE A NEW POPUP CLOSE ON BACK: put `data-back` on its close button. Nothing else to wire up.
// (Sheets need nothing at all: Back taps their dimmed backdrop, which every sheet already closes on.)

import { isNativeApp } from './platform.js';

const AppPlugin = () => globalThis.Capacitor && globalThis.Capacitor.Plugins && globalThis.Capacitor.Plugins.App;
const isShown = (el) => el.getClientRects().length > 0;

/** Press the top-most visible `data-back` button inside `scope`. Returns true if there was one. */
function pressBackButton(scope) {
  const btns = scope ? [...scope.querySelectorAll('[data-back]')].filter(isShown) : [];
  if (!btns.length) return false;
  btns[btns.length - 1].click();
  return true;
}

/** Close whatever is on top (sheet first, then a popup on the screen). Returns false if nothing was open. */
export function closeTopLayer() {
  const sheet = document.getElementById('sheet');
  if (sheet && !sheet.classList.contains('hidden')) {
    if (pressBackButton(sheet)) return true;
    sheet.click();                                             // same as tapping the dimmed backdrop
    if (!sheet.classList.contains('hidden')) { sheet.classList.add('hidden'); sheet.innerHTML = ''; }   // safety net
    return true;
  }
  return pressBackButton(document.getElementById('view'));
}

/** Hook up the Back button. `currentId()` = id of the screen showing, `homeId` = the start screen. */
export function initBack({ currentId, homeId, go }) {
  const onBack = () => {
    if (closeTopLayer()) return;
    if (currentId() !== homeId) { go(homeId); return; }
    const app = AppPlugin();
    if (app) app.exitApp();
  };
  const app = isNativeApp() && AppPlugin();
  if (app) app.addListener('backButton', onBack);
  else addEventListener('keydown', (e) => { if (e.key === 'Escape') onBack(); });   // on a computer: Esc acts as Back
}
