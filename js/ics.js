// ics.js — turn ISS passes into calendar events (with a reminder alarm) so Android's
// Calendar app can notify you even when UpSight is closed.

import { dirName } from './sky.js';

const pad = (n) => String(n).padStart(2, '0');

function utc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** Build the text of an .ics file for a list of passes. */
export function passesToICS(passes, leadMin = 10, name = 'ISS') {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UpSight//ISS passes//EN', 'CALSCALE:GREGORIAN'];
  const stamp = utc(new Date());
  for (const p of passes) {
    const start = p.visStart || p.rise.t;
    const end = p.visEnd && p.visEnd > start ? p.visEnd : p.set.t;
    const from = dirName(p.rise.az), to = dirName(p.set.az);
    out.push(
      'BEGIN:VEVENT',
      `UID:${name.replace(/\W/g, '')}-${p.rise.t.getTime()}@upsight`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${utc(start)}`,
      `DTEND:${utc(end)}`,
      `SUMMARY:${esc(`${name} flyover — look ${from}, max ${Math.round(p.peak.el)}°`)}`,
      `DESCRIPTION:${esc(`Appears ${from}, passes ${dirName(p.peak.az)} at ${Math.round(p.peak.el)}° up, disappears ${to}. ${p.brightness}.`)}`,
      'BEGIN:VALARM',
      `TRIGGER:-PT${leadMin}M`,
      'ACTION:DISPLAY',
      `DESCRIPTION:${esc(`${name} in ${leadMin} minutes — look ${from}`)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

/** Generic calendar file: items = [{uid,start,end,summary,desc,leadMin}] */
export function eventsToICS(items) {
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//UpSight//Sky events//EN', 'CALSCALE:GREGORIAN'];
  const stamp = utc(new Date());
  for (const it of items) {
    out.push('BEGIN:VEVENT', `UID:${it.uid}@upsight`, `DTSTAMP:${stamp}`, `DTSTART:${utc(it.start)}`, `DTEND:${utc(it.end)}`,
      `SUMMARY:${esc(it.summary)}`, `DESCRIPTION:${esc(it.desc || '')}`,
      'BEGIN:VALARM', `TRIGGER:-PT${it.leadMin || 30}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(it.summary)}`, 'END:VALARM', 'END:VEVENT');
  }
  out.push('END:VCALENDAR');
  return out.join('\r\n') + '\r\n';
}

/** Hand the .ics to the phone (Android offers to open it in Calendar). */
export function downloadICS(text, filename = 'upsight-events.ics') {
  const blob = new Blob([text], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
