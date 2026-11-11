/* 240-flap 烟测：桩 DOM/Canvas/Audio/localStorage/rAF，加载 index.html 内联脚本并真实驱动帧。
   运行：node _smoke.cjs   （退出码 0 = 全过） */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra !== undefined ? ('  -> ' + extra) : '')); }
}
function fin(v, name) { ok(name, Number.isFinite(v), v); }

// ---------- 数值有限性守卫（吸取 id235 的 NaN 教训：桩必须校验参数） ----------
function guard(fnName, args) {
  for (const a of args) {
    if (typeof a === 'number' && !Number.isFinite(a)) {
      throw new Error('non-finite arg to ' + fnName + ': ' + JSON.stringify(args));
    }
  }
}

// ---------- Canvas 2D 桩 ----------
function makeGrad() { return { addColorStop(o, c) { guard('addColorStop', [o]); } }; }
function makeCtx() {
  const c = {
    fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', globalAlpha: 1,
    setTransform(...a) { guard('setTransform', a); },
    clearRect(...a) { guard('clearRect', a); },
    save() {}, restore() {},
    translate(...a) { guard('translate', a); },
    scale(...a) { guard('scale', a); },
    rotate(...a) { guard('rotate', a); },
    createLinearGradient(...a) { guard('createLinearGradient', a); return makeGrad(); },
    createRadialGradient(...a) { guard('createRadialGradient', a); return makeGrad(); },
    fillRect(...a) { guard('fillRect', a); },
    strokeRect(...a) { guard('strokeRect', a); },
    beginPath() {}, closePath() {},
    moveTo(...a) { guard('moveTo', a); },
    lineTo(...a) { guard('lineTo', a); },
    arc(...a) { guard('arc', a); },
    arcTo(...a) { guard('arcTo', a); },
    ellipse(...a) { guard('ellipse', a); },
    fill() {}, stroke() {},
    fillText(t, ...a) { guard('fillText', a); },
    strokeText(t, ...a) { guard('strokeText', a); },
    measureText() { return { width: 10 }; },
    clip() {},
  };
  return c;
}

const canvasStub = {
  width: 0, height: 0, style: {},
  getContext() { return makeCtx(); },
  addEventListener() {},
  getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 640 }; },
};

// ---------- Audio 桩 ----------
class GainStub {
  constructor() { this.gain = { value: 0, setValueAtTime(...a) { guard('setValueAtTime', a); }, exponentialRampToValueAtTime(...a) { guard('expRamp', a); } }; }
  connect() {}
}
class OscStub {
  constructor() { this.type = ''; this.frequency = { value: 0, setValueAtTime(...a) { guard('oscFreq', a); } }; }
  connect() {} start(...a) { guard('start', a); } stop(...a) { guard('stop', a); }
}
class AudioCtxStub {
  constructor() { this.currentTime = 0; this.destination = {}; this.state = 'running'; }
  createOscillator() { return new OscStub(); }
  createGain() { return new GainStub(); }
  resume() {}
}

// ---------- window / document / localStorage 桩 ----------
const store = {};
const localStorageStub = {
  getItem(k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem(k, v) { store[k] = String(v); },
  removeItem(k) { delete store[k]; },
};

let rafCbs = [];
const windowStub = {
  innerWidth: 400, innerHeight: 640, devicePixelRatio: 2,
  AudioContext: AudioCtxStub,
  addEventListener() {},
  removeEventListener() {},
  requestAnimationFrame(cb) { rafCbs.push(cb); return rafCbs.length; },
  cancelAnimationFrame() {},
  localStorage: localStorageStub,
  setTimeout: (fn) => { /* 奖章琶音的延时不执行，避免测试挂起 */ return 0; },
};
const documentStub = {
  getElementById(id) { return id === 'c' ? canvasStub : null; },
  addEventListener() {},
  body: { appendChild() {} },
};

// ---------- 抽出 index.html 内联脚本并执行 ----------
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到内联 <script>'); process.exit(1); }
const code = m[1];

console.log('== A 层：加载与初始状态 ==');
let G;
try {
  const fn = new Function('window', 'document', 'localStorage', 'setTimeout', 'requestAnimationFrame', code);
  fn(windowStub, documentStub, localStorageStub, windowStub.setTimeout, windowStub.requestAnimationFrame);
  G = windowStub.__GAME;
  ok('内联脚本加载无抛错', true);
} catch (e) {
  ok('内联脚本加载无抛错', false, e && e.stack);
  process.exit(1);
}
ok('暴露 __GAME 钩子', !!G);
ok('初始 state=ready', G.state === 'ready', G.state);
ok('初始分数 0', G.score === 0, G.score);
ok('开局预铺柱子 >=3', G.pipes.length >= 3, G.pipes.length);
fin(G.bird.y, '初始 bird.y 有限');
ok('birdX 在画面内', G.birdX > 0 && G.birdX < G.W, G.birdX);

console.log('\n== A 层：柱子几何合法 ==');
let geomOK = true, gapMin = 1e9, gapMax = -1e9;
for (const p of G.pipes) {
  const top = p.cy - p.g / 2, bot = p.cy + p.g / 2;
  if (!(Number.isFinite(p.x) && Number.isFinite(p.cy) && Number.isFinite(p.g))) geomOK = false;
  if (top < 0 || bot > G.H - G.GROUND) geomOK = false;   // 隙必须完整落在可飞区
  gapMin = Math.min(gapMin, p.g); gapMax = Math.max(gapMax, p.g);
}
ok('每根柱子的隙都在可飞区内', geomOK);
ok('隙高在 [156,202] 区间', gapMin >= 156 && gapMax <= 202, gapMin + '~' + gapMax);
let moteInGap = true;
for (const p of G.pipes) {
  if (p.mote.dy < p.cy - p.g / 2 + 6 || p.mote.dy > p.cy + p.g / 2 - 6) moteInGap = false;
}
ok('光点落在隙内（可拾取不撞柱）', moteInGap);

console.log('\n== B 层：ready -> playing ==');
G.flap();
ok('点一下进入 playing', G.state === 'playing', G.state);
ok('拍翼后 vy 向上', G.bird.vy < 0, G.bird.vy);

console.log('\n== B 层：自动驾驶穿隙（每帧渲染，含 NaN 守卫） ==');
const DT = 1 / 60;
let maxScore = 0, boundsOK = true, nanOK = true, drawErr = null;
for (let f = 0; f < 3000 && G.state === 'playing'; f++) {
  // 简易自动驾驶：瞄准最近前方柱子的隙心稍下方
  const ps = G.pipes;
  let target = G.H * 0.42, bestDx = 1e9;
  for (const p of ps) {
    const dx = p.x + 62 - G.birdX;
    if (dx > -20 && dx < bestDx) { bestDx = dx; target = p.cy + 20; }
  }
  if (G.bird.y > target) G.flap();
  G.update(DT);
  try { G.draw(); } catch (e) { if (!drawErr) drawErr = e; }
  if (!Number.isFinite(G.bird.y) || !Number.isFinite(G.bird.vy) || !Number.isFinite(G.score)) nanOK = false;
  if (G.bird.y < -40 || G.bird.y > G.H + 40) boundsOK = false;
  maxScore = Math.max(maxScore, G.score);
}
ok('3000 帧渲染无抛错（梯度/arc 参数全有限）', drawErr === null, drawErr && drawErr.message);
ok('全程无 NaN', nanOK);
ok('小家伙不出界', boundsOK, G.bird.y);
ok('自动驾驶能连续穿隙 score>=3', maxScore >= 3, maxScore);
ok('分数随穿隙增长（>=8 说明难度曲线可玩）', maxScore >= 8, maxScore);
console.log('     自动驾驶成绩：score=' + maxScore + '  光点=' + G.motes + '  末态=' + G.state);

console.log('\n== A 层：撞柱判死 ==');
G.reset(false);
{
  const p = G.pipes[0];
  p.x = G.birdX - 30;          // 水平重叠
  G.bird.y = 6;                // 顶部实心段内
  G.bird.vy = 0;
  G.update(DT);
  ok('撞上柱身立即 over', G.state === 'over', G.state);
}

console.log('\n== A 层：落地判死 + 自由落体 ==');
G.reset(false);
let fellFrames = 0;
while (G.state === 'playing' && fellFrames < 400) { G.update(DT); fellFrames++; }
ok('不操作会自由落体触地结算', G.state === 'over', G.state);
ok('触地耗时合理（<3 秒）', fellFrames < 180, fellFrames);
ok('落地后 bird 不穿出地面', G.bird.y <= G.H - G.GROUND, G.bird.y);

console.log('\n== A 层：光点拾取加分与连穿 ==');
G.reset(false);
{
  const p = G.pipes[0];
  const before = G.score;
  p.x = G.birdX - p.mote.dx;     // 让光点正好在小家伙位置
  G.bird.y = p.mote.dy;
  G.bird.vy = 0;
  G.update(DT);
  ok('吃到光点 motes=1', G.motes === 1, G.motes);
  ok('吃到光点分数上涨', G.score > before, G.score + ' vs ' + before);
  ok('吃到光点建立连穿', G.combo >= 1, G.combo);
  ok('该光点标记为已取', p.mote.taken === true);
}

console.log('\n== A 层：结算/重开/最佳分 ==');
G.reset(false);
// 跑一段拿到分数再撞死
for (let f = 0; f < 1200 && G.state === 'playing'; f++) {
  const ps = G.pipes; let target = G.H * 0.42, bestDx = 1e9;
  for (const p of ps) { const dx = p.x + 62 - G.birdX; if (dx > -20 && dx < bestDx) { bestDx = dx; target = p.cy + 20; } }
  if (G.bird.y > target) G.flap();
  G.update(DT);
}
const runScore = G.score;
G.bird.y = G.H - G.GROUND;  // 强制落地
G.update(DT);
ok('强制落地后 over', G.state === 'over', G.state);
ok('最佳分写入 localStorage', (parseInt(store['flap_best'] || '0', 10) || 0) >= Math.min(runScore, G.best), store['flap_best']);
ok('best >= 本次得分', G.best >= runScore, G.best + ' / ' + runScore);
// over 状态下需过 0.45 秒冷却才能重开
G.flap();
ok('刚死立刻点击不会误重开', G.state === 'over');
for (let f = 0; f < 40; f++) G.update(DT);   // 推进 ~0.67 秒
G.flap();
ok('冷却后点击可重开进入 playing', G.state === 'playing', G.state);
ok('重开后分数归零', G.score === 0, G.score);
ok('重开后光点归零', G.motes === 0, G.motes);

console.log('\n== B 层：静音 / reset(ready) / 渲染各状态 ==');
let miscErr = null;
try {
  G.setMuted(true); G.update(DT); G.draw();
  G.setMuted(false); G.update(DT); G.draw();
  ok('静音开关切换无异常', G.isMuted() === false);
  G.reset(true);
  ok('reset(true) 回到 ready', G.state === 'ready', G.state);
  for (let f = 0; f < 60; f++) { G.update(DT); G.draw(); }   // ready 悬浮呼吸
  ok('ready 态悬浮 60 帧无异常且 y 有限', Number.isFinite(G.bird.y));
  // over 面板渲染（无奖章分支 + 有奖章分支）
  G.reset(false); G.bird.y = G.H - G.GROUND; G.update(DT); G.draw();
  ok('over 面板（低分无奖章）渲染无异常', true);
} catch (e) { miscErr = e; }
ok('杂项流程无抛错', miscErr === null, miscErr && miscErr.stack);

console.log('\n== A 层：大 dt 与极端输入不炸 ==');
let robustErr = null;
try {
  G.reset(false);
  G.update(5);            // 超大 dt 应被夹住
  for (let i = 0; i < 50; i++) { G.flap(); G.update(0); }   // dt=0 连续拍翼
  ok('超大 dt / dt=0 连拍后坐标有限', Number.isFinite(G.bird.y) && Number.isFinite(G.bird.vy));
} catch (e) { robustErr = e; }
ok('极端输入无抛错', robustErr === null, robustErr && robustErr.stack);

console.log('\n===============================');
console.log('通过 ' + pass + ' / 失败 ' + fail);
process.exit(fail === 0 ? 0 : 1);
