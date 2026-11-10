// ui.js — small drawing helpers shared by the screens (icons, moon, sky-path diagram, toast).

export const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const svg = (inner, size = 24) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

export const icons = {
  tonight: svg('<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/><path d="M17 3v3M15.5 4.5h3"/>'),
  iss: svg('<rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9.5 12H4M20 12h-5.5M12 9.5V4M12 20v-5.5"/><path d="M2.5 9.5h3v5h-3zM18.5 9.5h3v5h-3z"/>'),
  sky: svg('<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18" opacity=".35"/><path d="M8 8l3 2 2-3 3 4-4 1-1 4-3-3z"/>'),
  events: svg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="2.6"/>'),
  showers: svg('<path d="M16 3l1.3 2.8 3 .5-2.2 2.1.5 3L16 10l-2.6 1.4.5-3-2.2-2.1 3-.5z"/><path d="M10 14l-7 7M12 18l-4 4M6 11l-3 3"/>'),
  point: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.2"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
};

/** Moon drawing for a phase angle (0 new, 90 first quarter, 180 full, 270 last quarter). */
export function moonSVG(phase, size = 88) {
  const r = size / 2 - 3, c = size / 2;
  const rx = Math.abs(Math.cos(phase * Math.PI / 180)) * r;
  const crescent = phase < 90 || phase > 270;
  const waxing = phase < 180;
  const d = `M ${c} ${c - r} A ${r} ${r} 0 0 1 ${c} ${c + r} A ${rx.toFixed(2)} ${r} 0 0 ${crescent ? 0 : 1} ${c} ${c - r} Z`;
  const flip = waxing ? '' : ` transform="translate(${size} 0) scale(-1 1)"`;
  return `<svg class="moon-svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="var(--moondark)" stroke="var(--line)" stroke-width="1.5"/>
    <path d="${d}" fill="var(--moon)"${flip}/></svg>`;
}

/** Little sky map of a pass: centre = straight up, edge = horizon, N at top. */
export function polarSVG(track, size = 64) {
  const c = size / 2, r = size / 2 - 4;
  const pt = ([az, el]) => {
    const rad = (90 - Math.max(0, el)) / 90 * r, a = az * Math.PI / 180;
    return [c + rad * Math.sin(a), c - rad * Math.cos(a)];
  };
  // Split into runs of "visible" / "not visible" so each is drawn in its own colour.
  const runs = [];
  track.forEach((s, i) => {
    const last = runs[runs.length - 1];
    if (last && last.vis === s[2]) last.pts.push(pt(s));
    else { runs.push({ vis: s[2], pts: last ? [last.pts[last.pts.length - 1], pt(s)] : [pt(s)] }); }
  });
  const paths = runs.map(run => `<polyline points="${run.pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="none" stroke="${run.vis ? 'var(--accent)' : 'var(--dim)'}" stroke-width="${run.vis ? 2.6 : 1.6}" stroke-linecap="round" stroke-linejoin="round" opacity="${run.vis ? 1 : .55}"/>`).join('');
  const s = pt(track[0]), e = pt(track[track.length - 1]);
  return `<svg class="polar" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--line)" stroke-width="1.2"/>
    <circle cx="${c}" cy="${c}" r="${(r * 2 / 3).toFixed(1)}" fill="none" stroke="var(--line)" stroke-width=".8" stroke-dasharray="2 3"/>
    <circle cx="${c}" cy="${c}" r="${(r / 3).toFixed(1)}" fill="none" stroke="var(--line)" stroke-width=".8" stroke-dasharray="2 3"/>
    <text x="${c}" y="9" text-anchor="middle" font-size="8" fill="var(--dim)">N</text>
    ${paths}<circle cx="${s[0].toFixed(1)}" cy="${s[1].toFixed(1)}" r="2.6" fill="var(--text)"/>
    <circle cx="${e[0].toFixed(1)}" cy="${e[1].toFixed(1)}" r="2" fill="none" stroke="var(--text)" stroke-width="1.3"/></svg>`;
}

let toastTimer = null;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}
