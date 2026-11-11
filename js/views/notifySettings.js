// views/notifySettings.js — Settings → Notifications: one switch per type, lead times, quiet hours, a test button.
// The list of types comes from CONFIG.notify.types, so adding a type there adds its row here automatically.

import { store } from '../store.js';
import { esc, toast } from '../ui.js';
import { fmtTime, fmtDayInline } from '../time.js';
import { notifySupported, permissionState, askPermission, exactState, openExactSetting, notifyNow, rescheduleSoon } from '../notify.js';

const HOURS = Array.from({ length: 24 }, (_, h) => [h, new Date(2000, 0, 1, h).toLocaleTimeString('en-US', { hour: 'numeric' })]);

function rowHTML(t) {
  const k = 'n_' + t.id, onNow = !!store.get(k);
  let extra = '';
  if (t.leads) extra = `<select data-key="${k}_lead" data-num="1" aria-label="${esc(t.label)} warning time">${t.leads.map(m => `<option value="${m}" ${+store.get(k + '_lead') === m ? 'selected' : ''}>${m} min</option>`).join('')}</select>`;
  if (t.times) extra = `<select data-key="${k}_time" aria-label="${esc(t.label)} time">${t.times.map(([v, l]) => `<option value="${v}" ${String(store.get(k + '_time')) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  // The lead-time menu sits outside the switch's <label>, so tapping the menu never flips the switch.
  return `<div class="set-row nrow ${onNow ? '' : 'off'}"><span class="nic">${t.icon}</span><label class="grow" for="cb-${k}">${esc(t.label)}<span class="sub">${esc(t.hint)}</span></label>${extra}
    <label class="swl"><input type="checkbox" id="cb-${k}" data-key="${k}" ${onNow ? 'checked' : ''}><span class="switch"></span></label></div>`;
}

export async function openNotifySettings(ctx, onBack) {
  const sheet = document.getElementById('sheet');
  const types = ctx.config.notify.types;
  const groups = [...new Set(types.map(t => t.group))];
  const native = notifySupported();
  const perm = native ? await permissionState() : 'unsupported';
  const exact = native && perm === 'granted' ? await exactState() : 'granted';
  const st = store.getCache('notifyStatus');

  const banner = !native
    ? `<div class="card warn"><div class="big">Notifications are in the Android app</div><div class="muted">You can pick what you want here now; the installed UpSight app on your phone sends them.</div></div>`
    : perm !== 'granted'
      ? `<div class="card warn"><div class="big">Notifications are blocked</div><div class="muted">Allow them and UpSight can tell you when things are coming up.</div><div class="actions"><button class="btn" data-act="allow">Allow notifications</button></div></div>`
      : exact !== 'granted'
        ? `<div class="card"><div class="sub">Android may deliver alerts a few minutes late. For on-the-minute alerts (handy for 5-minute warnings), allow “Alarms &amp; reminders”.</div><div class="actions"><button class="btn ghost" data-act="exact">Turn on precise timing</button></div></div>`
        : '';
  const status = native && perm === 'granted' && st ? `<p class="foot">${st.count} alert${st.count === 1 ? '' : 's'} lined up${st.next ? ` · next: ${esc(st.next.title)}, ${fmtDayInline(new Date(st.next.at))} ${fmtTime(new Date(st.next.at))}` : ''}</p>` : '';

  sheet.innerHTML = `<div class="sheet-card">
    <div class="sheet-head"><button class="btn ghost small" data-back data-act="back">‹ Settings</button><h2>Notifications</h2><span style="width:70px"></span></div>
    ${banner}
    ${groups.map(g => `<h3 class="sect">${esc(g)}</h3><div class="card list-in">${types.filter(t => t.group === g).map(rowHTML).join('')}</div>`).join('')}
    <h3 class="sect">Quiet hours</h3>
    <div class="card list-in">
      <label class="set-row"><span class="grow">No alerts overnight<span class="sub">Eclipses still come through</span></span><input type="checkbox" data-key="quietOn" ${store.get('quietOn') ? 'checked' : ''}><span class="switch"></span></label>
      <div class="set-row"><span class="grow">From</span><select data-key="quietFrom" data-num="1">${HOURS.map(([h, l]) => `<option value="${h}" ${+store.get('quietFrom') === h ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <span>to</span><select data-key="quietTo" data-num="1">${HOURS.map(([h, l]) => `<option value="${h}" ${+store.get('quietTo') === h ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    </div>
    ${native ? '<div class="actions"><button class="btn ghost" data-act="test">Send a test notification</button></div>' : ''}
    <p class="foot">Passes, events and launches are worked out ahead, so they arrive even when UpSight is closed. Opening the app now and then keeps them up to date (launch times often slip). You can also silence any type from your phone’s own notification settings.</p>
    ${status}</div>`;
  sheet.classList.remove('hidden');

  sheet.onclick = async (e) => {
    if (e.target === sheet) { close(); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') onBack();
    if (act === 'allow') { const ok = await askPermission(); toast(ok ? 'Notifications on' : 'Still blocked — allow them in your phone’s Settings → Apps → UpSight'); if (ok) rescheduleSoon(ctx, 500); openNotifySettings(ctx, onBack); }
    if (act === 'exact') { await openExactSetting(); setTimeout(() => openNotifySettings(ctx, onBack), 800); }
    if (act === 'test') { const ok = await notifyNow(ctx, 'daily', 'UpSight test 👁', 'This is how your sky alerts will look.'); toast(ok ? 'Sent — check your notifications' : 'Couldn’t send'); }
  };
  sheet.onchange = (e) => {
    const t = e.target.closest('[data-key]'); if (!t) return;
    let val = t.type === 'checkbox' ? t.checked : (t.dataset.num ? parseFloat(t.value) : t.value);
    if (t.dataset.key === 'n_daily_time' && val !== 'sunset') val = parseFloat(val);
    store.set(t.dataset.key, val);
    const row = t.closest('.nrow'); if (row && t.type === 'checkbox') row.classList.toggle('off', !t.checked);
  };
  function close() { sheet.classList.add('hidden'); sheet.innerHTML = ''; }
}
