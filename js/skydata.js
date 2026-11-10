// skydata.js — loads the star catalogue (data/sky.json) and keeps its positions current for the observer.
// Data: Bright Star Catalogue-derived stars to magnitude 6, constellation lines, bright deep-sky objects (d3-celestial, BSD-3).

import { eqjVec, makeEqjToEnu } from './skymath.js';

let loading = null;
let D = null;

export function loadSkyData() {
  if (D) return Promise.resolve(D);
  if (!loading) {
    loading = fetch('data/sky.json').then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => {
      const nS = j.stars.length;
      const mag = new Float32Array(nS), bv = new Float32Array(nS);
      const pts = [];                                   // all EQJ unit vectors, packed later
      j.stars.forEach((s, i) => { mag[i] = s[2]; bv[i] = s[3]; pts.push(eqjVec(s[0], s[1])); });
      const lineStart = pts.length;
      const segs = [];                                  // {start,count,con}
      j.cons.forEach((c, ci) => c.lines.forEach(seg => { segs.push({ start: pts.length, count: seg.length, con: ci }); seg.forEach(p => pts.push(eqjVec(p[0], p[1]))); }));
      const labelStart = pts.length;
      j.cons.forEach(c => pts.push(eqjVec(c.ra, c.dec)));
      const dsoStart = pts.length;
      j.dso.forEach(d => pts.push(eqjVec(d[0], d[1])));
      const eqj = new Float32Array(pts.length * 3);
      pts.forEach((v, i) => { eqj[i * 3] = v[0]; eqj[i * 3 + 1] = v[1]; eqj[i * 3 + 2] = v[2]; });
      D = { raw: j, nStars: nS, mag, bv, eqj, enu: new Float32Array(eqj.length), lineStart, segs, labelStart, dsoStart, stamp: -1, key: '' };
      return D;
    });
  }
  return loading;
}

export const skyData = () => D;

/** Refresh the local-horizon positions of everything for this moment/place. Cheap (~6k vectors). */
export function updateSkyPositions(Astronomy, date, observer, locKey) {
  if (!D) return;
  const key = locKey + '|' + Math.floor(date.getTime() / 1000);
  if (key === D.key) return;
  makeEqjToEnu(Astronomy, date, observer)(D.eqj, D.enu);
  D.key = key;
}

export function starVec(i) { return [D.enu[i * 3], D.enu[i * 3 + 1], D.enu[i * 3 + 2]]; }
export function vecAt(idx) { return [D.enu[idx * 3], D.enu[idx * 3 + 1], D.enu[idx * 3 + 2]]; }
