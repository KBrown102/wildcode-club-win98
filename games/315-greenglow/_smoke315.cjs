// 315-greenglow 逻辑冒烟：强档可通关、noop 恒 0、随机远低于强档、dt 守卫
const G = require('./js/game.js');
const { Game, aiInput, LEVELS } = G;

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }

const DT = 1 / 60;
function runLevel(level, strategy, maxFrames) {
  const g = new Game(level);
  const rng = G.mulberry32(12345 + level * 7 + (strategy === 'random' ? 999 : 0));
  let f = 0;
  for (; f < maxFrames; f++) {
    aiInput(g, strategy, rng);
    g.step(DT);
    if (strategy !== 'noop' && g.win) break;
  }
  return { g, frames: f };
}

// 1) 强档：每关都能通关且得分 > 0
console.log('— strong —');
const strongScores = [];
for (let L = 0; L < LEVELS; L++) {
  const { g, frames } = runLevel(L, 'strong', 60 * 120);
  strongScores.push(g.finalScore);
  ok(g.win, `L${L} strong 应通关 (frames=${frames}, win=${g.win}, score=${g.finalScore})`);
  ok(g.finalScore > 0, `L${L} strong 得分应>0`);
  ok(g.stars() >= 1, `L${L} strong 至少 1 星 (stars=${g.stars()})`);
  console.log(`  L${L}: win=${g.win} score=${g.finalScore} stars=${g.stars()} frames=${frames}`);
}

// 2) noop：恒 0 分、不通关
console.log('— noop —');
for (let L = 0; L < LEVELS; L++) {
  const { g } = runLevel(L, 'noop', 60 * 30);
  ok(g.score === 0, `L${L} noop 得分应恒 0 (got ${g.score})`);
  ok(!g.win, `L${L} noop 不应通关`);
  ok(g.finalScore === 0, `L${L} noop finalScore 应 0`);
}

// 3) random：远低于强档、不靠乱按拿满分
console.log('— random —');
for (let L = 0; L < LEVELS; L++) {
  const { g } = runLevel(L, 'random', 60 * 120);
  ok(g.finalScore < strongScores[L] * 0.6, `L${L} random(${g.finalScore}) 应 < strong*0.6(${Math.round(strongScores[L] * 0.6)})`);
}

// 4) dt 守卫：NaN / 负 / 巨大 不崩、分数不变
console.log('— dt guards —');
{
  const g = new Game(0);
  let crash = false;
  try { g.step(NaN); g.step(-1); g.step(1e9); g.step(0); g.step(0.05); } catch (e) { crash = true; console.log('  err', e); }
  ok(!crash, 'dt 守卫不应抛错');
  ok(g.score === 0, '异常 dt 后分数仍 0');
}

// 5) 关卡生成确定性 + 无重叠 + 数量正确
console.log('— generation —');
for (let L = 0; L < LEVELS; L++) {
  const a = G.makeLevel(L), b = G.makeLevel(L);
  ok(a.nodes.length === G.LEVELS_N[L], `L${L} 节点数=${a.nodes.length} 应=${G.LEVELS_N[L]}`);
  ok(JSON.stringify(a.nodes.map(n => [Math.round(n.x), Math.round(n.y)])) === JSON.stringify(b.nodes.map(n => [Math.round(n.x), Math.round(n.y)])), `L${L} 生成应确定`);
  let overlap = false;
  for (let i = 0; i < a.nodes.length; i++) for (let j = i + 1; j < a.nodes.length; j++)
    if (Math.hypot(a.nodes[i].x - a.nodes[j].x, a.nodes[i].y - a.nodes[j].y) < 60) overlap = true;
  ok(!overlap, `L${L} 节点不应过近`);
  // 每张碎片都在界内
  let inb = a.nodes.every(n => n.x > 0 && n.x < G.W && n.y > 0 && n.y < G.H);
  ok(inb, `L${L} 节点应在界内`);
}

// 6) 星级单调：bonus 阈值 0 < 20 < 70
console.log('— stars monotonic —');
{
  const g = new Game(0);
  const base = g.N * G.CONNECT_PT + G.WIN_BONUS;
  g.win = true; g.finalScore = base;            // 刚连完
  ok(g.stars() === 1, `base 应为 1 星 (got ${g.stars()})`);
  g.finalScore = base + 40;                     // 较从容
  ok(g.stars() === 2, `base+40 应为 2 星 (got ${g.stars()})`);
  g.finalScore = base + 120;                    // 很从容
  ok(g.stars() === 3, `base+120 应为 3 星 (got ${g.stars()})`);
}

console.log(`\n冒烟结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
