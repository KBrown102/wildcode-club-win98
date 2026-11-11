const G = require('./game.js');
const seeds = [11, 22, 33];
for (const lv of [0,1,2,3,4,5,6,7]) {
  let stat = { build: 0, noopFail: 0, planFail: 0, outRange: 0, ok: 0, pars: [] };
  for (const s of seeds) {
    for (let a = 0; a < 260; a++) {
      const rng = G.mulberry32((s >>> 0) + a * 7919 + lv * 104729);
      const geo = G.tryBuild(G.LEVELS[lv], rng);
      if (!geo) continue;
      stat.build++;
      const st = G.makeState(lv, geo, s);
      const s0 = G.scratch(st); G.settleCats(s0, 900);
      if (G.allHome(s0)) { stat.noopFail++; continue; }
      const plan = G.planSolve(st, 420);
      if (!plan.ok) { stat.planFail++; continue; }
      stat.pars.push(plan.grains);
      const cfg = G.LEVELS[lv];
      if (plan.grains < cfg.gmin || plan.grains > cfg.gmax) { stat.outRange++; continue; }
      stat.ok++;
    }
  }
  stat.pars.sort((a, b) => a - b);
  const q = p => stat.pars.length ? stat.pars[Math.floor(p * (stat.pars.length - 1))] : -1;
  console.log(`L${lv + 1} build=${stat.build} noopFail=${stat.noopFail} planFail=${stat.planFail} outRange=${stat.outRange} ok=${stat.ok} par[p10,p50,p90]=${q(0.1)},${q(0.5)},${q(0.9)} n=${stat.pars.length}`);
}
