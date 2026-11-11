// _cal298.cjs — 四档 AI 对照 + 三星阈值标定
const B = require('./game.js');
const DT = 1 / 60;
const clamp = B.clamp;

function nearestCre(s, sx) {
  var best = null, bd = 1e9;
  for (var i = 0; i < s.L.cre.length; i++) {
    var c = s.L.cre[i];
    if (c.got) continue;
    var d = Math.abs(c.y - s.by) + Math.abs(c.x - s.bx) * 0.45 + (c.shy ? 40 : 0);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
function nearestVent(s) {
  var best = null, bd = 1e9;
  for (var i = 0; i < s.L.vents.length; i++) {
    var v = s.L.vents[i];
    if (v.cd > 0) continue;
    var d = Math.abs(v.y - s.by) + Math.abs(v.x - s.bx) * 0.4;
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

const AI = {
  noop: () => ({}),
  random: (s, rnd) => ({
    inflate: rnd() < 0.30, deflate: rnd() < 0.26,
    swim: rnd() < 0.2 ? (rnd() < 0.5 ? -1 : 1) : 0
  }),
  /* 会移动 + 会气穴，但体积完全不看通道宽 / 害羞 */
  mid: (s) => {
    var c = nearestCre(s);
    if (!c) return { inflate: s.tank > 0 && s.vy > -200 };
    var dx = c.x - s.bx, dy = c.y - s.by;
    var swim = Math.abs(dx) > 14 ? (dx > 0 ? 1 : -1) : 0;
    if (s.tank <= 6) {
      var v = nearestVent(s);
      if (v) {
        var vdx = v.x - s.bx, vdy = v.y - s.by;
        swim = Math.abs(vdx) > 14 ? (vdx > 0 ? 1 : -1) : 0;
        return { inflate: vdy < 0 && s.tank > 0, deflate: vdy > 60, swim: swim };
      }
    }
    return { inflate: dy < -20 && s.tank > 0, deflate: dy > 20, swim: swim };
  },
  /* 完整策略：★ 基于物理模型的体积控制器 —— 直接反解目标体积
     终速公式 v = G(1 - V/VN)/DAMP  →  V_target = VN(1 - v_desired·DAMP/G)，n_target = V_target·P
     这正是人类玩家的心智模型：想要什么速度，就把气泡调到多大。 */
  strong: (s) => {
    const G = B.G, DAMP = 2.40, VN = B.VN, KR = B.KR;
    function vol2n(V) { return clamp(V * s.P, B.NMIN, B.NMAX); }
    function drive(des, swim, capV) {
      var Vt = VN * (1 - des * DAMP / G);
      if (capV !== undefined) Vt = Math.min(Vt, capV);
      var nT = vol2n(Vt);
      if (nT < s.n - 1.5) return { deflate: true, swim: swim };
      if (nT > s.n + 1.5 && s.tank > 0) return { inflate: true, swim: swim };
      return { swim: swim };
    }
    /* 气穴补给优先 —— 罐空了什么都做不了 */
    if (s.tank <= 8) {
      var v = nearestVent(s);
      if (v) {
        var vdx = v.x - s.bx, vdy = v.y - s.by;
        var vs = Math.abs(vdx) > 12 ? (vdx > 0 ? 1 : -1) : 0;
        return drive(clamp(vdy * 1.6, -200, 200), vs);
      }
    }
    var c = nearestCre(s);
    if (!c) return drive(-235, 0);                       // 采齐 → 出海
    var dx = c.x - s.bx, dy = c.y - s.by;
    var swim = Math.abs(dx) > 10 ? (dx > 0 ? 1 : -1) : 0;
    var ady = Math.abs(dy);
    var des = ady < 42 ? clamp(dy * 2.1, -110, 110)
      : (dy > 0 ? clamp(75 + ady * 0.9, 0, 215) : clamp(-75 - ady * 0.9, -240, 0));

    /* 通行上限：本处与前方通道决定的最大体积（允许一点挤压余量） */
    var ahead = clamp(s.by + (des < 0 ? -46 : 46), 0, s.WH);
    var chan = Math.min(B.chanAtY(s, s.by), B.chanAtY(s, ahead));
    var capV = Math.pow(chan * 1.38 / 2 / KR, 2);   // 1.38 = 挤压容差 1/0.68 的留量
    /* 害羞生物：必须缩到 RSHY 以内 */
    if (c.shy && ady < 300) capV = Math.min(capV, Math.pow((B.RSHY - 2) / KR, 2));
    var hardCap = VN * (1 + 235 * DAMP / G);   // 终速封顶
    return drive(clamp(des, -235, 220), swim, Math.min(capV, hardCap));
  }
};

function play(lv, seed, kind) {
  var s = B.makeState();
  B.start(s, lv, seed);
  var rnd = B.mulberry32(lv * 977 + seed * 31 + 7);
  var t = 0;
  while (!s.over && t < B.TLIM + 5) {
    B.step(s, DT, AI[kind](s, rnd));
    t += DT;
  }
  if (!s.over) B.finish(s, false);
  return { score: s.score, got: s.got, target: s.target, win: s.win, time: s.time };
}

const SEEDS = [3, 11, 29, 47, 53, 71];
const kinds = ['noop', 'random', 'mid', 'strong'];
const acc = {};
kinds.forEach(k => acc[k] = { sc: 0, win: 0, got: 0, n: 0 });
const perLv = {};

for (var lv = 1; lv <= 8; lv++) {
  perLv[lv] = {};
  kinds.forEach(k => perLv[lv][k] = []);
  for (var si = 0; si < SEEDS.length; si++) {
    for (var ki = 0; ki < kinds.length; ki++) {
      var r = play(lv, SEEDS[si], kinds[ki]);
      acc[kinds[ki]].sc += r.score; acc[kinds[ki]].win += r.win ? 1 : 0;
      acc[kinds[ki]].got += r.got; acc[kinds[ki]].n++;
      perLv[lv][kinds[ki]].push(r.score);
    }
  }
}
console.log('=== 总体（8 关 × 6 种子 = 48 局/档）===');
kinds.forEach(k => {
  var a = acc[k];
  console.log(`  ${k.padEnd(7)} 均分 ${(a.sc / a.n).toFixed(1).padStart(7)}   通关 ${a.win}/${a.n}   平均采集 ${(a.got / a.n).toFixed(2)}`);
});
console.log('\n=== 逐关 strong 均分（用于标定三星）===');
const th = [];
for (var lv2 = 1; lv2 <= 8; lv2++) {
  const arr = perLv[lv2].strong.slice().sort((x, y) => x - y);
  const mn = arr[0], mx = arr[arr.length - 1];
  const avg = arr.reduce((p, c) => p + c, 0) / arr.length;
  const midArr = perLv[lv2].mid.slice().sort((x, y) => x - y);
  const midAvg = midArr.reduce((p, c) => p + c, 0) / midArr.length;
  console.log(`  L${lv2}: strong min ${mn} avg ${avg.toFixed(0)} max ${mx}  |  mid avg ${midAvg.toFixed(0)}  |  noop ${perLv[lv2].noop[0]} random ${perLv[lv2].random.reduce((p, c) => p + c, 0) / 6 | 0}`);
  const ref = Math.max(avg, midAvg);
  th.push([Math.round(ref * 0.34), Math.round(ref * 0.60), Math.round(ref * 0.84)]);
}
console.log('\nSTARS = ' + JSON.stringify(th).replace(/\],\[/g, '], ['));
