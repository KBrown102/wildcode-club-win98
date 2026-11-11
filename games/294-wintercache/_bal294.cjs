/* _bal294.cjs — 平衡 / AI 对照：验证核心机制必要性 + 标定三星阈值 */
const G = require('./game.js');
const COLS = G.COLS, NC = G.NC;
const SEED = 20260909;

function dist(st, from) {
  const d = new Int32Array(NC).fill(-1), q = [from], h = 0;
  d[from] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i], x = c % COLS, y = (c / COLS) | 0;
    const nb = [];
    if (x > 0) nb.push(c - 1); if (x < COLS - 1) nb.push(c + 1);
    if (y > 0) nb.push(c - COLS); if (y < G.ROWS - 1) nb.push(c + COLS);
    for (const n of nb) if (d[n] < 0 && st.grid[n] === 0) { d[n] = d[c] + 1; q.push(n); }
  }
  return d;
}
function freeNuts(st) { return st.nuts.filter(n => !n.taken); }
function isFree(st, c) {
  return st.grid[c] === 0 && !st.buriedMap[c] && G.nutAt(st, c) < 0;
}
function bestBury(st) {
  const d = dist(st, G.curCell(st)), marks = st.G.marks;
  let best = -1, bs = 1e9;
  const anchor = [];
  for (const m of marks) {
    const x = m % COLS, y = (m / COLS) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= G.ROWS) continue;
      anchor.push(ny * COLS + nx);
    }
  }
  for (const c of anchor) if (isFree(st, c) && d[c] >= 0 && d[c] < bs) { bs = d[c]; best = c; }
  if (best >= 0) return best;
  for (let c = 0; c < NC; c++) if (isFree(st, c) && d[c] >= 0 && d[c] < bs) { bs = d[c]; best = c; }
  return best;
}
function nearestNut(st) {
  const fn = freeNuts(st); if (!fn.length) return -1;
  const d = dist(st, G.curCell(st));
  let best = -1, bs = 1e9;
  for (const n of fn) if (d[n.cell] >= 0 && d[n.cell] < bs) { bs = d[n.cell]; best = n.cell; }
  return best;
}
function smartAutumn(st) {
  const fn = freeNuts(st);
  if (st.pouch.length > 0 && (st.pouch.length >= Math.min(st.L.cap, 3) || fn.length === 0)) {
    if (G.bury(st)) return;
    const c = bestBury(st); if (c >= 0) G.gotoCell(st, c);
    return;
  }
  if (fn.length) { const c = nearestNut(st); if (c >= 0) G.gotoCell(st, c); }
}
function randomAutumn(st, rnd) {
  if (rnd() < 0.22) G.bury(st);
  G.gotoCell(st, (rnd() * NC) | 0);
}
function runAutumn(st, pol) {
  let g = 0;
  while (st.phase === 'autumn' && g++ < 60 * 200) {
    if (!st.act && !st.sq.path.length) pol(st);
    G.update(st, 1 / 60);
  }
}
function runWinter(st, cells) {
  let i = 0, g = 0;
  while (st.phase === 'winter' && g++ < 60 * 300) {
    if (!st.act && !st.sq.path.length) {
      if (i < cells.length && st.digLeft > 0) { G.gotoCell(st, cells[i]); i++; }
      else break;
    }
    G.update(st, 1 / 60);
  }
  while (st.phase === 'winter' && g++ < 60 * 400) G.update(st, 1 / 60);
}
function play(li, mode, rnd) {
  const st = G.newState(li, SEED);
  if (mode === 'noop') {
    let g = 0; while (st.phase !== 'end' && g++ < 60 * 400) G.update(st, 1 / 60);
    return st;
  }
  if (mode === 'random') { runAutumn(st, s => randomAutumn(s, rnd)); }
  else { runAutumn(st, smartAutumn); }
  if (st.phase === 'snow') { let g = 0; while (st.phase === 'snow' && g++ < 600) G.update(st, 1 / 60); }
  const buried = st.buried.map(b => b.cell);
  let cells;
  if (mode === 'random') { cells = []; for (let i = 0; i < st.L.quota + 6; i++) cells.push((rnd() * NC) | 0); }
  else {
    const keep = mode === 'perfect' ? 1 : mode === 'strong' ? 0.78 : 0.48;
    cells = buried.filter(() => rnd() < keep);
    const wrong = mode === 'strong' ? 2 : 4;
    for (let i = 0; i < wrong; i++) {
      let c; let n = 0; do { c = (rnd() * NC) | 0; n++; } while ((st.grid[c] !== 0 || buried.indexOf(c) >= 0) && n < 50);
      cells.push(c);
    }
  }
  runWinter(st, cells);
  return st;
}

const modes = ['noop', 'random', 'mid', 'strong', 'perfect'];
const seeds = [11, 29, 47, 83, 127, 211];
const agg = {};
modes.forEach(m => agg[m] = Array(G.LEVELS.length).fill(0).map(() => []));
for (const li of G.LEVELS.map((_, i) => i)) {
  for (const m of modes) {
    for (const s of seeds) {
      const rnd = G.mulberry32(s + li * 31 + 7);
      const st = play(li, m, rnd);
      agg[m][li].push(st.result ? st.result.score : 0);
    }
  }
}
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log('关 | ' + modes.map(m => m.padStart(9)).join(' | '));
for (let li = 0; li < G.LEVELS.length; li++) {
  console.log(String(li + 1).padStart(2) + ' | ' + modes.map(m => avg(agg[m][li]).toFixed(1).padStart(9)).join(' | '));
}
console.log('\n--- 建议三星阈值 (strong×0.28 / 0.50 / 0.72) ---');
for (let li = 0; li < G.LEVELS.length; li++) {
  const s = avg(agg['strong'][li]);
  console.log(`L${li + 1} strong=${s.toFixed(1)} -> th: [${Math.round(s * 0.28)}, ${Math.round(s * 0.50)}, ${Math.round(s * 0.72)}]`);
}
console.log('\n--- 秋章埋藏数 (strong) ---');
for (let li = 0; li < G.LEVELS.length; li++) {
  const st = play(li, 'strong', G.mulberry32(11 + li * 31 + 7));
  console.log(`L${li + 1} 坚果${st.L.nuts} 埋下${st.result.buried} 寻回${st.result.found} 遗忘${st.result.sprouts} 错挖${st.result.miss} 余配额${st.result.digLeft} 分${st.result.score}`);
}
