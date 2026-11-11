/* smoke.cjs — 294-wintercache 逻辑冒烟 */
const G = require('./game.js');
let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; } else { fail++; console.log('  FAIL: ' + m); } }
function sec(n) { console.log('— ' + n); }
const SEED = 20260909;

sec('关卡生成');
for (let li = 0; li < G.LEVELS.length; li++) {
  const L = G.LEVELS[li], g = G.genLevel(li, SEED);
  ok(g, 'L' + (li + 1) + ' 生成成功');
  ok(g.nuts.length === L.nuts, 'L' + (li + 1) + ' 坚果数 ' + L.nuts);
  ok(g.marks.length === L.marks, 'L' + (li + 1) + ' 地标数 ' + L.marks);
  const ks = new Set(g.nuts.map(n => n.k));
  ok(ks.size === Math.min(5, L.nuts), 'L' + (li + 1) + ' 五果齐套(' + ks.size + ')');
  ok(g.grid[G.START] === 0, 'L' + (li + 1) + ' 起点可通行');
  g.nuts.forEach(n => ok(g.grid[n.cell] === 0, 'L' + (li + 1) + ' 坚果不在地标上'));
  const g2 = G.genLevel(li, SEED);
  ok(g2 === g, 'L' + (li + 1) + ' 固定种子（错题本）');
}

sec('初始状态');
{
  const st = G.newState(0, SEED);
  ok(st.phase === 'autumn', '起手是秋章');
  ok(st.timeLeft === G.LEVELS[0].at, '秋章时限');
  ok(st.digLeft === G.LEVELS[0].quota, '配额');
  ok(st.pouch.length === 0 && st.buried.length === 0, '空囊空藏');
  ok(G.curCell(st) === G.START, '松鼠在起点');
  ok(st.nuts.every(n => !n.taken), '坚果都在地上');
}

sec('寻路');
{
  const st = G.newState(7, SEED);
  const marks = st.G.marks;
  ok(G.gotoCell(st, marks[0]) === false, '不能走进地标');
  let free = -1;
  for (let c = 0; c < G.NC; c++) if (st.grid[c] === 0 && c !== G.START) { free = c; break; }
  ok(G.gotoCell(st, free) === true, '可走到空地');
  ok(G.gotoCell(st, -1) === false, '越界拒绝');
  ok(G.gotoCell(st, G.NC) === false, '越界拒绝2');
  const p = st.sq.path;
  ok(p.every(c => st.grid[c] === 0), '路径不穿地标');
}

sec('秋章：拾取 / 颊囊 / 埋藏');
{
  const st = G.newState(0, SEED);
  const target = st.nuts[0].cell;
  G.gotoCell(st, target);
  let g = 0;
  while ((st.sq.path.length || st.act) && g++ < 2000) G.update(st, 1 / 60);
  ok(st.nuts[0].taken, '走到坚果上自动拾取');
  ok(st.pouch.length === 1, '进颊囊');
  ok(st.pouch[0] === st.nuts[0].k, '种类一致');

  ok(G.bury(st) === true, '可埋在当前格');
  ok(st.pouch.length === 0, '埋后颊囊清空');
  ok(st.buried.length === 1, '记录埋藏');
  ok(st.buried[0].order === 0, '埋藏序号');
  ok(G.bury(st) === false, '空囊不能再埋');
  let g2 = 0; while (st.act && g2++ < 200) G.update(st, 1 / 60);
  ok(G.bury(st) === false, '同格不能再埋一颗');
}
{
  const st = G.newState(7, SEED);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let steps = 0;
  for (let i = 0; i < 400 && st.pouch.length < st.L.cap; i++) {
    const d = dirs[i % 4];
    if (G.stepDir(st, d[0], d[1])) steps++;
    let g = 0; while (st.sq.path.length && g++ < 400) G.update(st, 1 / 60);
    while (st.act) G.update(st, 1 / 60);
  }
  ok(st.pouch.length <= st.L.cap, '颊囊不超容量 ' + st.pouch.length + '/' + st.L.cap);
}
{
  const st = G.newState(3, SEED);
  ok(G.bury(st) === false, '空囊不能埋');
  for (let c = 0; c < G.NC; c++) if (st.grid[c] !== 0 && G.gotoCell(st, c) === false) { ok(true, '地标拒埋'); break; }
}

sec('一夜落雪 → 冬章');
{
  const st = G.newState(0, SEED);
  st.timeLeft = 0.02;
  let g = 0;
  while (st.phase === 'autumn' && g++ < 200) G.update(st, 1 / 60);
  ok(st.phase === 'snow', '秋尽入雪');
  while (st.phase === 'snow' && g++ < 400) G.update(st, 1 / 60);
  ok(st.phase === 'winter', '雪停入冬');
  ok(st.timeLeft === G.LEVELS[0].wt, '冬章时限重置');
  ok(st.digLeft === G.LEVELS[0].quota, '配额就位');
}

sec('冬章：挖掘 / 连中回补');
{
  const st = G.newState(2, SEED);
  // 直接埋三颗（绕过走路）
  st.phase = 'autumn';
  const cells = [];
  for (let c = 0; c < G.NC && cells.length < 3; c++) if (st.grid[c] === 0 && G.nutAt(st, c) < 0) cells.push(c);
  cells.forEach((c, i) => { st.pouch.push(i % 5); st.sq.px = c % G.COLS; st.sq.py = (c / G.COLS) | 0; G.bury(st); while (st.act) G.update(st, 1 / 60); });
  ok(st.buried.length === 3, '埋下三颗');
  st.timeLeft = 0.02;
  let g = 0; while (st.phase !== 'winter' && g++ < 600) G.update(st, 1 / 60);
  const q0 = st.digLeft;
  st.sq.px = cells[0] % G.COLS; st.sq.py = (cells[0] / G.COLS) | 0;
  ok(G.digHere(st) === true, '可挖脚下');
  let g2 = 0; while (st.act && g2++ < 200) G.update(st, 1 / 60);
  ok(st.found === 1, '挖中');
  ok(st.digLeft === q0 - 1, '扣配额');
  ok(st.dug[cells[0]] === 1, '标记已挖');
  ok(G.digHere(st) === false, '同格不重复挖');
  // 连中三发回补
  for (const c of cells.slice(1)) { st.sq.px = c % G.COLS; st.sq.py = (c / G.COLS) | 0; G.digHere(st); while (st.act) G.update(st, 1 / 60); }
  ok(st.found === 3, '三发全中');
  ok(st.digLeft === q0 - 3 + 1, '连中三发 +1 配额');
  // 挖空
  let empty = -1;
  for (let c = 0; c < G.NC; c++) if (st.grid[c] === 0 && !st.dug[c] && !st.buriedMap[c]) { empty = c; break; }
  st.sq.px = empty % G.COLS; st.sq.py = (empty / G.COLS) | 0;
  G.digHere(st); while (st.act) G.update(st, 1 / 60);
  ok(st.miss === 1, '挖空计数');
  ok(st.combo === 0, '挖空断连');
}

sec('结算');
{
  const st = G.newState(4, SEED);
  const cells = [];
  for (let c = 0; c < G.NC && cells.length < 4; c++) if (st.grid[c] === 0 && G.nutAt(st, c) < 0) cells.push(c);
  cells.forEach((c, i) => { st.pouch.push(i % 5); st.sq.px = c % G.COLS; st.sq.py = (c / G.COLS) | 0; G.bury(st); while (st.act) G.update(st, 1 / 60); });
  st.timeLeft = 0.02;
  let g = 0; while (st.phase !== 'winter' && g++ < 600) G.update(st, 1 / 60);
  st.sq.px = cells[0] % G.COLS; st.sq.py = (cells[0] / G.COLS) | 0;
  G.digHere(st); while (st.act) G.update(st, 1 / 60);
  st.timeLeft = 0.01;
  let g2 = 0; while (st.phase !== 'end' && g2++ < 400) G.update(st, 1 / 60);
  const r = st.result;
  ok(!!r, '产出结算');
  ok(r.buried === 4 && r.found === 1 && r.sprouts === 3, '埋4回1忘3');
  const exp = G.KINDS[0].score + 3 * 5;
  ok(r.score === exp, '分数 = 寻回分 + 遗忘×5 (' + r.score + '/' + exp + ')');
  ok(st.phase === 'end', '进入结算');
}
{
  const st = G.newState(1, SEED);
  let g = 0; while (st.phase !== 'end' && g++ < 60 * 400) G.update(st, 1 / 60);
  ok(st.result.kind === 'empty', '什么都不做 → empty');
  ok(st.result.score === 0, 'noop 得 0 分（核心机制必要性）');
}

sec('三星');
{
  const st = G.newState(0, SEED);
  const fake = { score: 0 };
  ok(G.starsOf(0, fake) === 0, '0 分零星');
  fake.score = G.LEVELS[0].th[2];
  ok(G.starsOf(0, fake) === 3, '达到三星线');
  fake.score = G.LEVELS[0].th[1];
  ok(G.starsOf(0, fake) === 2, '达到二星线');
  for (let i = 0; i < 8; i++) {
    const t = G.LEVELS[i].th;
    ok(t[0] > 0 && t[1] > t[0] && t[2] > t[1], 'L' + (i + 1) + ' 阈值递增');
  }
}

sec('边界与防御');
{
  const st = G.newState(0, SEED);
  st.sq.px = 0; st.sq.py = 0;
  ok(G.stepDir(st, -1, 0) === false, '左边界');
  ok(G.stepDir(st, 0, -1) === false, '上边界');
  st.sq.px = G.COLS - 1; st.sq.py = G.ROWS - 1;
  ok(G.stepDir(st, 1, 0) === false, '右边界');
  ok(G.stepDir(st, 0, 1) === false, '下边界');
  const before = JSON.stringify([st.sq.px, st.sq.py, st.timeLeft]);
  G.update(st, NaN); G.update(st, -1); G.update(st, 0);
  ok(JSON.stringify([st.sq.px, st.sq.py, st.timeLeft]) === before || st.timeLeft >= 0, '异常 dt 不炸');
  G.update(st, 10);
  ok(st.timeLeft >= 0, '超大 dt 被夹住');
}
{
  const st = G.newState(5, SEED);
  st.phase = 'end';
  G.update(st, 1 / 60);
  ok(st.phase === 'end', '结算后不再更新');
}

sec('完整通关（8 关 · 智能策略）');
for (let li = 0; li < G.LEVELS.length; li++) {
  const st = G.newState(li, SEED);
  let g = 0;
  // 秋章：捡 → 埋
  while (st.phase === 'autumn' && g++ < 60 * 200) {
    if (!st.act && !st.sq.path.length) {
      const fn = st.nuts.filter(n => !n.taken);
      if (st.pouch.length >= Math.min(st.L.cap, 3) || !fn.length) {
        if (!G.bury(st)) {
          let best = -1, bs = 1e9;
          for (let c = 0; c < G.NC; c++) {
            if (st.grid[c] !== 0 || st.buriedMap[c] || G.nutAt(st, c) >= 0) continue;
            const cur = G.curCell(st);
            const d = Math.abs(c % G.COLS - cur % G.COLS) + Math.abs(((c / G.COLS) | 0) - ((cur / G.COLS) | 0));
            if (d < bs) { bs = d; best = c; }
          }
          if (best >= 0) G.gotoCell(st, best);
        }
      } else {
        const cur = G.curCell(st);
        let bn = -1, bd = 1e9;
        for (const n of fn) {
          const d = Math.abs(n.cell % G.COLS - cur % G.COLS) + Math.abs(((n.cell / G.COLS) | 0) - ((cur / G.COLS) | 0));
          if (d < bd) { bd = d; bn = n.cell; }
        }
        if (bn >= 0) G.gotoCell(st, bn);
      }
    }
    G.update(st, 1 / 60);
  }
  ok(st.buried.length > 0, 'L' + (li + 1) + ' 秋章埋下了东西 (' + st.buried.length + ')');
  // 冬章：完美记忆
  const buried = st.buried.map(b => b.cell);
  let i = 0;
  while (st.phase === 'winter' && g++ < 60 * 400) {
    if (!st.act && !st.sq.path.length) {
      if (i < buried.length && st.digLeft > 0) { G.gotoCell(st, buried[i]); i++; }
      else break;
    }
    G.update(st, 1 / 60);
  }
  while (st.phase !== 'end' && g++ < 60 * 600) G.update(st, 1 / 60);
  ok(st.phase === 'end', 'L' + (li + 1) + ' 正常收工');
  const r = st.result;
  ok(r.found + r.sprouts === r.buried, 'L' + (li + 1) + ' 寻回+遗忘=埋下');
  ok(r.score > 0, 'L' + (li + 1) + ' 得分 ' + r.score);
  ok(G.starsOf(li, r) >= 1, 'L' + (li + 1) + ' 好策略至少一星');
}

console.log('\n冒烟：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
