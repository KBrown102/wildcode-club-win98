/**
 * _smoke.cjs —— 纯逻辑冒烟（Node，require game.js）
 * 覆盖：全关可解 / 无操作不通关 / 预算充足 / 确定性 / 旋转语义 / 自动解=三星 /
 *      提示 / 放置-旋转-拾回 循环 / 重置 / 全关自动解无异常。
 */
const G = require('./js/game.js');
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + name); } }

// 1) 全关可解 + 无操作不通关 + 预算充足
G.LEVELS.forEach((L, i) => {
  const s = G.solve(L, L.budget);
  ok('L' + (i + 1) + ' 可解', s.ok);
  ok('L' + (i + 1) + ' 预算≥par', L.budget >= (s.ok ? s.used : 0));
  const b0 = G.beamPath(L, {});
  ok('L' + (i + 1) + ' 无操作不通关', b0.lit === false);
});

// 2) 确定性
const L1 = G.LEVELS[0];
const a = JSON.stringify(G.beamPath(L1, { '1,1': '/' }).path);
const b = JSON.stringify(G.beamPath(L1, { '1,1': '/' }).path);
ok('beamPath 确定性', a === b);

// 3) 旋转语义：'/' 与 '\\' 反射结果不同
const rot = G.Game.prototype; // 不实例化，直接验证底层
// 构造一个极简关卡：source 向右，目标需经一次反射
const mini = { cols: 3, rows: 3, source: { c: 0, r: 0, dir: 'R' }, target: { c: 2, r: 2 }, walls: [], fixed: [], budget: 2 };
const sSlash = G.beamPath(mini, { '2,0': '/' });   // 右→上，走到 (2,-1) 出界，不亮
const sBack = G.beamPath(mini, { '2,0': '\\' });   // 右→下，到 (2,2) 目标，亮
ok('旋转语义：\\ 命中目标', sBack.lit === true);
ok('旋转语义：/ 不命中', sSlash.lit === false);

// 4) autosolve 全关 = 三星 且无异常
let allWon = true;
G.LEVELS.forEach((L, i) => {
  const g = new G.Game(G.LEVELS);
  g.load(i);
  const w = g.autosolve();
  if (!w) allWon = false;
  ok('L' + (i + 1) + ' autosolve 通关', w === true);
  ok('L' + (i + 1) + ' autosolve 三星', w && g.stars() === 3);
});
ok('全关 autosolve 无漏', allWon);

// 5) 提示：在无操作关卡上调用提示应转正并（par≤3 时）通关
{
  const g = new G.Game(G.LEVELS);
  g.load(0);                 // par=1
  const h = g.hint();
  ok('L1 提示返回非空', h !== null);
  ok('L1 提示后通关', g.won === true);
  ok('L1 提示后三星', g.stars() === 3);
}

// 6) 放置-旋转-拾回 循环
{
  const g = new G.Game(G.LEVELS);
  g.load(3); // 非空关
  const c = 1, r = 1;
  const placed = g.place(c, r);
  ok('放置成功', placed === true && g.movable[G.key(c, r)] === '/');
  g.rotate(c, r);
  ok('旋转变 \\', g.movable[G.key(c, r)] === '\\');
  g.rotate(c, r);
  ok('再旋转回 /', g.movable[G.key(c, r)] === '/');
  const rem = g.remove(c, r);
  ok('拾回成功', rem === true && !g.movable[G.key(c, r)]);
}

// 7) 重置清空
{
  const g = new G.Game(G.LEVELS);
  g.load(6);
  g.place(1, 1); g.place(2, 2);
  g.reset();
  ok('重置清空镜面', g.usedCount() === 0 && g.won === false);
}

// 8) 占用格/固定镜不可放置
{
  const g = new G.Game(G.LEVELS);
  g.load(2); // 含固定镜 (6,6)
  const src = g.level.source;
  ok('光源格不可放', g.place(src.c, src.r) === false);
  const tgt = g.level.target;
  ok('目标格不可放', g.place(tgt.c, tgt.r) === false);
  ok('固定镜不可放', g.place(6, 6) === false);
}

console.log('\n逻辑冒烟结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
