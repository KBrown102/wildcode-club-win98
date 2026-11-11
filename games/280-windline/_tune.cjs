/* 调参探针：模拟不同策略，看高度/张力/得分是否合理 */
const { createGame } = require("./game.js");

function sim(name, policy, secs) {
  const g = createGame();
  g.start("zhu");
  const dt = 1 / 60;
  let t = 0, snaps = 0, notes = 0;
  const altSamples = [];
  while (t < secs && g.state.phase !== "over") {
    const S = g.state;
    const inp = policy(S, t);
    g.step(dt, inp);
    g.drain();
    t += dt;
    if (S.snaps > snaps) snaps = S.snaps;
    if (S.notes > notes) notes = S.notes;
    if (Math.abs(t % 5) < dt) altSamples.push(Math.round(S.ky));
  }
  const S = g.state;
  console.log(
    `${name.padEnd(16)} alt=${Math.round(S.ky).toString().padStart(4)} max=${S.maxAlt
      .toFixed(0)
      .padStart(4)} ten=${S.tension.toFixed(0).padStart(3)} score=${S.score
      .toFixed(0)
      .padStart(5)} notes=${String(notes).padStart(3)} snaps=${snaps} L=${S.L.toFixed(0)} phase=${S.phase}`
  );
  console.log(`   alt@5s: ${altSamples.join(" → ")}`);
}

// 策略1：一直放线到底（莽）
sim("莽：全放线", () => ({ reel: -1, bias: 0 }), 100);

// 策略2：张力 > 62 就收线，< 38 就放线（稳健）
sim(
  "稳健：62/38",
  (S) => {
    let r = 0;
    if (S.tension > 62) r = 1;
    else if (S.tension < 38) r = -1;
    return { reel: r, bias: 0 };
  },
  100
);

// 策略3：贪婪 82/70
sim(
  "贪婪：82/70",
  (S) => {
    let r = 0;
    if (S.tension > 82) r = 1;
    else if (S.tension < 70) r = -1;
    return { reel: r, bias: 0 };
  },
  100
);

// 策略4：稳健 + 主动去够风铃
sim(
  "稳健+追铃",
  (S) => {
    let r = 0;
    if (S.tension > 64) r = 1;
    else if (S.tension < 42) r = -1;
    // 找最近的前方风铃
    let best = null, bd = 1e9;
    for (const b of S.bells) {
      if (b.taken) continue;
      const d = b.alt - S.ky;
      if (d > 20 && d < 420 && d < bd) { bd = d; best = b; }
    }
    let bias = 0;
    if (best) {
      const dx = best.x - S.sx;
      bias = dx > 14 ? 1 : dx < -14 ? -1 : 0;
    }
    return { reel: r, bias };
  },
  100
);

// 策略5：高手 —— 用 侧牵引 + 收放线 双向去够风铃，张力压在 82 以下
sim(
  "高手：82上限",
  (S) => {
    let best = null, bd = 1e9;
    for (const b of S.bells) {
      if (b.taken) continue;
      const d = b.alt - S.ky;
      if (d > 8 && d < 320 && d < bd) { bd = d; best = b; }
    }
    let r = 0;
    if (S.tension > 82) r = 1;
    else if (best && best.alt > S.ky + 16 && S.tension < 66) r = -1;
    else if (S.tension < 40) r = -1;
    let bias = 0;
    if (best) {
      const dx = best.x - S.sx;
      bias = dx > 10 ? 1 : dx < -10 ? -1 : 0;
    }
    return { reel: r, bias };
  },
  100
);

// 策略6：高手保守版 —— 张力压在 70 以下
sim(
  "高手：70上限",
  (S) => {
    let best = null, bd = 1e9;
    for (const b of S.bells) {
      if (b.taken) continue;
      const d = b.alt - S.ky;
      if (d > 8 && d < 320 && d < bd) { bd = d; best = b; }
    }
    let r = 0;
    if (S.tension > 70) r = 1;
    else if (best && best.alt > S.ky + 16 && S.tension < 56) r = -1;
    else if (S.tension < 34) r = -1;
    let bias = 0;
    if (best) {
      const dx = best.x - S.sx;
      bias = dx > 10 ? 1 : dx < -10 ? -1 : 0;
    }
    return { reel: r, bias };
  },
  100
);

// 检查张力公式在各高度/线长的稳态值
console.log("\n--- 张力稳态表（wind=基础风，theta=0, omega=0） ---");
const g0 = createGame();
for (const L of [60, 200, 400, 600, 800, 1100]) {
  const Tn = (L - 60) / (1100 - 60);
  const row = [];
  for (const alt of [0, 300, 600, 900, 1100]) {
    const wind = 0.75 + alt / 700;
    const t = 24 * wind * (0.34 + 0.95 * Tn) + 16 * Math.max(0, (alt - 380) / 720);
    row.push(`alt${alt}:${t.toFixed(0)}`);
  }
  console.log(`L=${String(L).padStart(4)} (Tn=${Tn.toFixed(2)})  ` + row.join("  "));
}
