// views/settings.js — the settings sheet (opened from the gear). Secondary options live here
// so the three main screens stay clean.
//
// TO ADD A SETTING: add one entry to a section in SECTIONS below (type: toggle | number | select).

import { store } from '../store.js';
import { refreshIss } from '../issService.js';
import { fmtAge } from '../time.js';
import { esc, toast } from '../ui.js';

const SECTIONS = [
  { title: 'Display', items: [
    { key: 'nightMode', type: 'toggle', label: 'Red night mode', hint: 'Protects your night vision outdoors' },
    { key: 'hour12', type: 'toggle', label: '12-hour clock' },
  ]},
  { title: 'ISS passes', items: [
    { key: 'minPeakEl', type: 'select', label: 'Only passes that climb above', options: [[10, '10°'], [20, '20°'], [30, '30°'], [45, '45°']] },
    { key: 'showAllPasses', type: 'toggle', label: 'Also list passes I can’t see', hint: 'Daylight or ISS in shadow' },
  ]},
  { title: 'Compass', items: [
    { key: 'declination', type: 'number', label: 'Magnetic declination (°)', hint: 'Virginia ≈ −8.5 (west is negative)', step: 0.5 },
  ]},
];

function itemHTML(it) {
  const v = store.get(it.key);
  const hint = it.hint ? `<span class="sub">${esc(it.hint)}</span>` : '';
  if (it.type === 'toggle') return `<label class="set-row"><span class="grow">${esc(it.label)}${hint}</span><input type="checkbox" data-key="${it.key}" ${v ? 'checked' : ''}><span class="switch"></span></label>`;
  if (it.type === 'select') return `<label class="set-row"><span class="grow">${esc(it.label)}${hint}</span><select data-key="${it.key}" data-num="1">${it.options.map(([val, txt]) => `<option value="${val}" ${+v === val ? 'selected' : ''}>${txt}</option>`).join('')}</select></label>`;
  if (it.type === 'number') return `<label class="set-row"><span class="grow">${esc(it.label)}${hint}</span><input class="num" type="number" step="${it.step || 1}" data-key="${it.key}" data-num="1" value="${v}"></label>`;
  return '';
}

export function openSettings(ctx) {
  const sheet = document.getElementById('sheet');
  const iss = ctx.iss;
  const loc = ctx.location();
  sheet.innerHTML = `<div class="sheet-card">
    <div class="sheet-head"><h2>Settings</h2><button class="btn ghost small" data-act="close">Done</button></div>
    <h3 class="sect">Location</h3>
    <div class="card"><div class="val" id="locname">${esc(loc.name)}</div><div class="sub" id="loccoords">${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)}</div>
      <div class="actions"><button class="btn" data-act="gps">Use my GPS location</button></div>
      <div class="loc-grid"><input id="in-lat" type="number" step="0.001" value="${loc.lat}" aria-label="Latitude"><input id="in-lon" type="number" step="0.001" value="${loc.lon}" aria-label="Longitude"><button class="btn ghost small" data-act="setloc">Set</button></div></div>
    ${SECTIONS.map(s => `<h3 class="sect">${s.title}</h3><div class="card list-in">${s.items.map(itemHTML).join('')}</div>`).join('')}
    <h3 class="sect">Data</h3>
    <div class="card"><div class="sub">ISS orbit data: ${iss.tle ? `${fmtAge(Date.now() - iss.tle.epoch)} old (downloaded ${fmtAge(Date.now() - iss.tle.fetchedAt)} ago)` : 'not loaded'}</div>
      <div class="actions"><button class="btn" data-act="refresh">Refresh orbit data now</button></div></div>
    <p class="foot">${esc(ctx.config.appName)} ${esc(ctx.config.version)}</p></div>`;
  sheet.classList.remove('hidden');

  sheet.onclick = (e) => {
    if (e.target === sheet) return close();
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') close();
    if (b.dataset.act === 'refresh') { close(); refreshIss(ctx, { forceFetch: true }); toast('Refreshing ISS data…'); }
    if (b.dataset.act === 'gps') useGPS(ctx, sheet);
    if (b.dataset.act === 'setloc') {
      const lat = parseFloat(sheet.querySelector('#in-lat').value), lon = parseFloat(sheet.querySelector('#in-lon').value);
      if (!(Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return toast('Enter a valid latitude and longitude');
      store.set({ lat, lon, locName: 'Custom location' });
      toast('Location saved'); close();
    }
  };
  sheet.onchange = (e) => {
    const t = e.target.closest('[data-key]');
    if (!t) return;
    const val = t.type === 'checkbox' ? t.checked : (t.dataset.num ? parseFloat(t.value) : t.value);
    if (typeof val === 'number' && isNaN(val)) return;
    store.set(t.dataset.key, val);
  };

  function close() { sheet.classList.add('hidden'); sheet.innerHTML = ''; ctx.bus.emit('iss'); }
}

function useGPS(ctx, sheet) {
  if (!navigator.geolocation) return toast('This browser has no location access');
  toast('Finding you…');
  navigator.geolocation.getCurrentPosition((pos) => {
    const lat = pos.coords.latitude, lon = pos.coords.longitude;
    store.set({ lat, lon, elev: Math.round(pos.coords.altitude ?? store.get('elev')), locName: 'My location (GPS)' });
    sheet.querySelector('#locname').textContent = 'My location (GPS)';
    sheet.querySelector('#loccoords').textContent = `${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    sheet.querySelector('#in-lat').value = lat; sheet.querySelector('#in-lon').value = lon;
    toast('Location updated');
  }, (err) => toast('Couldn’t get location: ' + err.message), { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
}
