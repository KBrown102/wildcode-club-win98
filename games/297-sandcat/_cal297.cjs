/* 297 关卡标定 + AI 对照 */
const G = require('./game.js');
const seeds = [11, 22, 33, 44, 55, 66];
const rows = [];
for (let lv = 0; lv < 8; lv++) {
  let par = [], quota = [], noop = [], rnd = [], str = [], okS = 0, hr = [], hs = [];
  for (const s of seeds) {
    const geo = G.genLevel(lv, s);
    par.push(geo.par); quota.push(geo.quota);
    const mk = () => { const st = G.makeState(lv, geo, s); st.sandMax = geo.quota; st.sandBase = geo.quota; st.sandLeft = geo.quota; return st; };
    let a = mk(); G.runAI(a, 'noop', 25); noop.push(G.score(a));
    let b = mk(); G.runAI(b, 'random', 120); rnd.push(G.score(b)); hr.push(G.homesCount(b) + '/' + b.cats.length);
    let c = mk(); G.runAI(c, 'strong', 240); str.push(G.score(c)); hs.push(G.homesCount(c) + '/' + c.cats.length);
    if (G.homesCount(c) === c.cats.length) okS++;
  }
  const avg = a => Math.round(a.reduce((x, y) => x + y, 0) / a.length);
  const mn = a => Math.min(...a), mx = a => Math.max(...a);
  rows.push({ lv: lv + 1, par: mn(par) + '-' + mx(par), quota: mn(quota) + '-' + mx(quota), noop: mn(noop) + '-' + mx(noop), rnd: mn(rnd) + '-' + mx(rnd), rndH: hr.join(' '), str: mn(str) + '-' + mx(str), strH: hs.join(' '), avgS: avg(str), ok: okS + '/' + seeds.length });
}
console.table(rows);
console.log('\nSTARS (avg strong × 0.34/0.60/0.82):');
console.log(JSON.stringify(rows.map(r => [Math.round(r.avgS * 0.34), Math.round(r.avgS * 0.60), Math.round(r.avgS * 0.82)])));
