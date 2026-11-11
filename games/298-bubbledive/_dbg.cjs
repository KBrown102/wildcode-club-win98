// _dbg.cjs — 298 物理手感探针
const B = require('./game.js');
const st = B.makeState();
B.start(st, 1, 7);
console.log('WH', st.WH, 'target', st.target, 'cre', st.L.cre.length, 'vents', st.L.vents.length);
console.log('narrow', JSON.stringify(st.L.narrow));
console.log('start by', st.by.toFixed(0), 'r', st.r.toFixed(1), 'P', st.P.toFixed(3), 'V', st.V.toFixed(1));

function run(inp, secs, tag) {
  const s = B.makeState(); B.start(s, 1, 7);
  let t = 0; const dt = 1 / 60;
  const log = [];
  while (t < secs) {
    B.step(s, dt, inp);
    t += dt;
    if (Math.abs(t % 1.0 - dt) < dt) log.push(`${t.toFixed(0)}s y=${s.by.toFixed(0)} r=${s.r.toFixed(1)} vy=${s.vy.toFixed(0)} n=${s.n.toFixed(0)}`);
  }
  console.log('--- ' + tag + ' ---');
  log.forEach(l => console.log('  ' + l));
}
run({}, 6, 'noop');
run({ inflate: true }, 6, 'inflate');
run({ deflate: true }, 6, 'deflate');

// 通道宽度剖面
const s2 = B.makeState(); B.start(s2, 1, 7);
let prof = [];
for (let y = 0; y <= s2.WH; y += 100) prof.push(y + ':' + B.chanAtY(s2, y).toFixed(0));
console.log('--- chan profile ---'); console.log('  ' + prof.join('  '));

// 通关尝试：手动策略 —— 一路充气浮到顶
const s3 = B.makeState(); B.start(s3, 1, 7);
let t3 = 0; const dt = 1 / 60;
while (!s3.over && t3 < 70) {
  B.step(s3, dt, { inflate: s3.tank > 0 });
  t3 += dt;
}
console.log('--- inflate-to-top ---', 'over', s3.over, 'win', s3.win, 'y', s3.by.toFixed(0), 'got', s3.got, 't', t3.toFixed(1), 'score', s3.score);
