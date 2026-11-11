// _diag.cjs — 诊断：一局里到底发生了什么
const G = require("./game.js");

function run(lv, seed, mode, verbose) {
  const st = G.create(lv, seed);
  const dt = 1 / 60;
  let ph = 0;
  const log = [];
  while (!st.over) {
    st.inUp = false; st.inDown = false;
    if (mode === 'low') { st.inUp = st.tide < 0.15; st.inDown = st.tide > 0.15; }
    else if (mode === 'high') { st.inUp = st.tide < 0.72; st.inDown = st.tide > 0.72; }
    else if (mode === 'breath') {
      ph += dt / 9;
      const tg = 0.42 + 0.26 * Math.sin(ph * Math.PI * 2);
      if (st.tide < tg - 0.01) st.inUp = true; else if (st.tide > tg + 0.01) st.inDown = true;
    } else if (mode === 'smart') {
      let tg;
      if (st.birds.length) {
        // 只需淹过鸟锁定的那只 → 涨到它的高程略上
        let need = 0;
        for (const b of st.birds) for (const c of st.crabs) if (c.id === b.tid) need = Math.max(need, G.elevAt(st, c.x, c.y));
        tg = (need + 0.04 + 0.04) / 1.08;
      } else tg = 0.16;
      if (st.tide < tg - 0.008) st.inUp = true; else if (st.tide > tg + 0.008) st.inDown = true;
      if (st.oyster >= G.GONG_COST && st.birds.length >= 2) G.gong(st);
    }
    G.update(st, dt);
    for (const e of st.events) log.push(Math.round(st.t) + "s " + e.t);
    st.events.length = 0;
  }
  const sizes = st.crabs.map(c => c.size).join(",");
  const cnt = {};
  log.forEach(l => { const k = l.split(" ")[1]; cnt[k] = (cnt[k] || 0) + 1; });
  console.log("L" + (lv + 1) + " seed" + seed + " [" + mode.padEnd(6) + "] V=" + String(st.result.vitality).padStart(3) +
    "/" + st.result.goal + "  sizes=[" + sizes + "]  " +
    "molt=" + st.moltCount + " eaten=" + st.eaten + " washed=" + st.washed +
    " clam=" + st.clamCount + " scared=" + st.scared + " alive=" + st.result.alive);
  if (verbose) {
    console.log("   事件:", Object.entries(cnt).map(([k, v]) => k + "×" + v).join(" "));
  }
  return st.result.vitality;
}

for (const m of ['noop', 'low', 'high', 'breath', 'smart']) {
  let s = 0;
  for (const sd of [11, 202, 3003]) s += run(0, sd * 7 + 1, m, m === 'low' || m === 'smart');
  console.log("  >>> " + m + " 平均 " + (s / 3).toFixed(1) + "\n");
}
