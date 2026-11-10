// ufo.js — the UFO log (saved on the phone) and the plain-English explanations used by "What's that light?".

import { store } from './store.js';

export const getLog = () => store.getCache('ufoLog') || [];
export function addToLog(entry) { const l = getLog(); l.unshift({ ...entry, id: Date.now() }); store.setCache('ufoLog', l.slice(0, 200)); return l.length; }
export function removeFromLog(id) { store.setCache('ufoLog', getLog().filter(e => e.id !== id)); }

/** Why something might look like a UFO, in a sentence. */
export function explain(c) {
  switch (c.kind) {
    case 'planet':
      if (c.label === 'Venus') return 'Venus is the #1 thing reported as a UFO — dazzlingly bright, it seems to hover and even “follow” your car.';
      if (c.label === 'Jupiter') return 'Jupiter is very bright and steady — another classic UFO look-alike.';
      return 'A planet — a steady light that barely twinkles, unlike the stars around it.';
    case 'moon': return 'The Moon — near the horizon it can look huge, orange, or oddly shaped through clouds.';
    case 'sun': return 'The Sun. Please don’t look straight at it!';
    case 'star': return 'A bright star. Low in the sky, stars twinkle hard and flash red, green and white — a very common UFO report.';
    case 'train': return 'A Starlink train — a line of lights gliding together in silence. One of the most-reported “UFOs” today.';
    case 'sat': return c.seen ? 'A satellite catching sunlight — a steady, silent light that glides across and may fade out as it enters Earth’s shadow.' : 'A satellite is there, but it’s in Earth’s shadow or the sky is too bright to see it.';
    case 'plane': return 'An airplane. Look for blinking red (left wing), green (right wing) and white strobe lights.';
    case 'comet': return 'A comet — a fuzzy smudge, sometimes with a faint tail.';
    case 'launch': return 'A rocket launch — a bright moving light or a glowing “jellyfish” plume, especially just after sunset or before sunrise.';
    default: return '';
  }
}
