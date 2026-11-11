// 291 平衡扫描：找「贪心显著强于随机」的配置
const G = require('./game.js');

function settle(st) { let g = 0; while (st.phase !== 'aim' && !st.over && g++ < 6000) G.update(st, 1 / 60); }
function playGreedy(seed, opt) {
  const st = G.create(Object.assign({ seed }, opt));
  let n = 0;
  while (!st.over && n++ < 500) {
    if (st.phase !== 'aim') { G.update(st, 1 / 60); continue; }
    let best = null;
    for (let c = 0; c < 8; c++) {
      const r = G.simulateAfter(st, c);
      if (!r) continue;
      const v = r.score * 100 - r.cells * 6 + r.maxMade * 40;
      if (!best || v > best.v) best = { v, c };
    }
    if (!best) break;
    G.setCol(st, best.c); G.drop(st); settle(st);
  }
  return st;
}
function playRandom(seed, opt, rnd) {
  const st = G.create(Object.assign({ seed }, opt));
  let n = 0;
  while (!st.over && n++ < 500) {
    if (st.phase !== 'aim') { G.update(st, 1 / 60); continue; }
    const cand = [];
    for (let c = 0; c < 8; c++) if (G.landRow(st, c) >= 0) cand.push(c);
    if (!cand.length) break;
    G.setCol(st, cand[Math.floor(rnd() * cand.length)]); G.drop(st); settle(st);
  }
  return st;
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const rows = [];
for (const thresh of [3, 4]) {
  for (const capMax of [4, 5, 6]) {
    for (const sp of [2.2, 2.6, 3.2]) {
      const opt = { thresh, capMax, sp };
      const gs = [], gm = [], gc = [], gd = [], rs = [], rm = [];
      let rnd = (function (a) { return function () { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; })(20260908);
      for (let s = 1; s <= 8; s++) {
        const a = playGreedy(s * 7919, opt); gs.push(a.score); gm.push(a.maxMade); gc.push(a.bestCascade); gd.push(a.drops);
      }
      for (let s = 1; s <= 8; s++) { const b = playRandom(s * 7919, opt, rnd); rs.push(b.score); rm.push(b.maxMade); }
      rows.push({
        thresh, capMax, sp,
        g: Math.round(avg(gs)), r: Math.round(avg(rs)),
        ratio: +(avg(gs) / Math.max(1, avg(rs))).toFixed(2),
        gm: +avg(gm).toFixed(1), rm: +avg(rm).toFixed(1),
        gc: +avg(gc).toFixed(1), gd: Math.round(avg(gd))
      });
    }
  }
}
rows.sort((a, b) => b.ratio - a.ratio);
console.log('thresh capMax  sp |  greedy  random  ratio | gLv rLv  gChain gDrops');
rows.forEach(r => console.log(
  String(r.thresh).padStart(6) + String(r.capMax).padStart(7) + String(r.sp).padStart(5) +
  ' | ' + String(r.g).padStart(7) + String(r.r).padStart(8) + String(r.ratio).padStart(7) +
  ' | ' + String(r.gm).padStart(3) + String(r.rm).padStart(5) + String(r.gc).padStart(8) + String(r.gd).padStart(7)
));
