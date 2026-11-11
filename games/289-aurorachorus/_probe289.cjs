// _probe289.cjs — 追踪「在最宽涌浪后缘起爆」的极限链长
const G = require('./game.js');
const dt = 1 / 60;

function widest(s) {
  let b = null;
  for (const x of G.bands(s)) if (!b || x[1] - x[0] > b[1] - b[0]) b = x;
  return b;
}

for (const li of [0, 2, 4]) {
  let bestRun = null;
  for (let seed = 1; seed <= 8; seed++) {
    const st = G.newState(li, seed * 1013);
    for (let f = 0; f < 60 * 60 && !st.done; f++) {
      G.update(st, dt);
      if (st.cd > 0 || st.waves <= 0) continue;
      const b = widest(st);
      if (!b || b[1] - b[0] + 1 < 3) continue;
      const before = st.lit;
      G.launch(st, b[0]);
      // 等涟漪跑完
      let guard = 0;
      while (st.ripples.length && guard++ < 900) G.update(st, dt);
      const chain = st.maxChain;
      if (!bestRun || chain > bestRun.chain) bestRun = { chain, band: b[1] - b[0] + 1, seed };
    }
  }
  const L = G.LEVELS[li];
  console.log(`L${li + 1} n=${L.n} band目标=${L.band} → 单发最长连锁=${bestRun.chain} (当时亮带宽 ${bestRun.band})  理论 1+1.95B=${(1 + 1.95 * bestRun.band).toFixed(1)}`);
}

console.log('\n--- 亮带宽度直方图（L5, seed 固定, 60s） ---');
{
  const st = G.newState(4, 777);
  const hist = {};
  for (let f = 0; f < 60 * 60; f++) {
    G.update(st, dt);
    const b = widest(st);
    const w = b ? b[1] - b[0] + 1 : 0;
    hist[w] = (hist[w] || 0) + 1;
  }
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  for (const k of keys) console.log(` 宽 ${k}: ${(hist[k] / 36).toFixed(1)}%`);
}
