// ics.js — turn ISS passes into calendar events (with a reminder alarm) so Android's
// Calendar app can notify you even when Sky Watch is closed.

import { dirName } from './sky.js';

const pad = (n) => String(n).padStart(2, '0');

function utc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Build the text of an .ics file for a list of passes. */
export function passesToICS(passes, leadMin = 10) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Sky Watch//ISS passes//EN', 'CALSCALE:GREGORIAN'];
  const stamp = utc(new Date());
  for (const p of passes) {
    const start = p.visStart || p.rise.t;
    const end = p.visEnd && p.visEnd > start ? p.visEnd : p.set.t;
    const from = dirName(p.rise.az), to = dirName(p.set.az);
    out.push(
      'BEGIN:VEVENT',
      `UID:iss-${p.rise.t.getTime()}@skywatch`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(`ISS flyover — look ${from}, max ${Math.round(p.peak.el)}°`)}`,
      `DESCRIPTION:${esc(`Appears ${from}, passes ${dirName(p.peak.az)} at ${Math.round(p.peak.el)}° up, disappears ${to}. ${p.brightness}.`)}`,
      'BEGIN:VALARM',
      `TRIGGER:-PT${leadMin}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`ISS in ${leadMin} minutes — look ${from}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

/** Hand the .ics to the phone (Android offers to open it in Calendar). */
export function downloadICS(text, filename = 'skywatch-iss-passes.ics') {
  const blob = new Blob([text], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
