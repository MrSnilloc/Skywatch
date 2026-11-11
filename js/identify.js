// identify.js — "What's this?": given where the phone is aimed, list what the light most likely is.
//
// Phone compasses are often 10–20° off, so we search a WIDE circle (config.identify.radiusDeg) and rank
// everything in it by how likely it is to be the thing that caught your eye:
//   • brightness  — a dazzling planet beats a faint star;
//   • movement    — satellites, planes and rockets glide, which is what makes people look up;
//   • a pass happening right now — the ISS crossing the sky outranks everything near it;
//   • closeness to the aim point — still counts, but no longer decides everything.
// Pure logic, no screen code. TO TUNE THE RANKING: change the numbers in config.identify.

import * as M from './skymath.js';
import { skyData, vecAt } from './skydata.js';
import { assess } from './launches.js';

const MOVING = new Set(['sat', 'train', 'plane', 'launch']);
const DIR_AZ = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };

/** Star-style magnitude -> 0..1 "how eye-catching" (mag -4 = 1, mag 1 = 0.5, mag 6 = faintest). */
const magBright = (mag) => Math.max(0.05, Math.min(1, (6 - mag) / 10));

/**
 * Everything within the search circle around `fwd`, best guess first.
 * model = the Sky map's current model ({ objs, sunAlt, date }).
 * Each result: { kind, id, label, d (degrees from the aim point), vec, moving, passNow, score, ...extras }
 */
export function rankCandidates(ctx, model, fwd) {
  const cfg = ctx.config.identify, dark = model.sunAlt < cfg.darkSunAlt, out = [];
  const add = (kind, id, label, vec, bright, more = {}) => {
    if (!vec || vec[2] < -0.05) return;                         // below the horizon
    const d = M.angleBetween(vec, fwd);
    if (d > cfg.radiusDeg) return;
    const moving = MOVING.has(kind);
    const prominence = bright + (moving ? cfg.moveBonus : 0) + (more.passNow ? cfg.passBonus : 0);
    const closeness = 1 - d / cfg.radiusDeg;
    out.push({ kind, id, label, d, vec, moving, score: prominence * (cfg.farWeight + (1 - cfg.farWeight) * closeness), ...more });
  };

  for (const o of model.objs.values()) {
    if (o.kind === 'sun') add('sun', o.id, 'Sun', o.vec, 1);
    else if (o.kind === 'moon') add('moon', o.id, 'Moon', o.vec, 1);
    else if (o.kind === 'planet') { if (o.mag < (dark ? 6.5 : -3)) add('planet', o.id, o.label, o.vec, magBright(o.mag), { mag: o.mag }); }
    else if (o.kind === 'comet') { if (dark && o.mag < 8) add('comet', o.id, 'Comet ' + o.label, o.vec, magBright(o.mag)); }
    else if (o.kind === 'plane') {
      const km = o.look.rangeKm;                                 // closer = brighter lights
      add('plane', o.id, o.label, o.vec, !dark ? 0.5 : km < 15 ? 0.9 : km < 50 ? 0.7 : 0.45, { plane: o.plane, look: o.look });
    } else if (o.kind === 'sat') {
      const train = /^sat:sl/.test(o.id);
      if (train) { if (dark) add('train', o.id, o.label, o.vec, 0.5, { seen: o.seen }); }
      else if (o.seen) add('sat', o.id, o.label, o.vec, o.star ? 0.9 : 0.3, { seen: true, passNow: !!o.star });
    }
  }

  const D = skyData();
  if (D && dark) for (let i = 0; i < D.nStars && D.mag[i] < cfg.starMaxMag; i++) add('star', 'star:' + i, D.raw.names[i] || 'Bright star', vecAt(i), magBright(D.mag[i]), { mag: D.mag[i] });

  // a rocket launch in the last 45 minutes from a pad you could see
  if (ctx.launches && ctx.launches.status === 'ready') {
    for (const l of ctx.launches.list) {
      const age = (model.date - l.net) / 60000;
      if (age < -2 || age > 45) continue;
      const v = assess(l, ctx.location(), ctx.config.launches);
      if (v.level !== 'likely' && v.level !== 'maybe') continue;
      add('launch', 'launch:' + l.id, l.name, M.azAltToVec(DIR_AZ[v.dir] || 0, 12), 0.8);
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

/** How sure are we about the top result? 'sure' | 'probably' | 'nearest' */
export function confidence(ctx, best) {
  if (!best) return 'none';
  if (best.d <= ctx.config.identify.sureDeg) return 'sure';
  return best.passNow || best.moving || best.kind === 'moon' || best.kind === 'sun' ? 'probably' : 'nearest';
}
