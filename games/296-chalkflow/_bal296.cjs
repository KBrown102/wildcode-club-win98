/* 296-chalkflow 平衡探针 */
const C = require('./game.js');
const H = 760;
const kinds = ['noop', 'random', 'mid', 'strong'];
const seeds = [1, 2, 3, 4, 5];
console.log('lv  ' + kinds.map(k => k.padStart(9)).join('') + '   | caught/N');
const agg = {};
for (let lv = 0; lv < 8; lv++) {
  const row = [];
  for (const k of kinds) {
    let s = 0, c = 0;
    for (const sd of seeds) { const st = C.runAI(lv, sd, k, H); s += st.score; c += st.caught; }
    row.push((s / seeds.length).toFixed(1).padStart(9));
    agg[k] = (agg[k] || 0) + s / seeds.length;
    if (k === 'strong') row.push('  ' + (c / seeds.length).toFixed(1) + '/' + C.LEVELS[lv].N);
  }
  console.log(String(lv + 1).padStart(2) + '  ' + row.join(''));
}
console.log('sum ', kinds.map(k => (agg[k] || 0).toFixed(0).padStart(9)).join(''));
