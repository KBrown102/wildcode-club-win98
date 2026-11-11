// 328-starlane 冒烟测试：Node 模拟 DOM/Canvas 跑逻辑 + 校验 save/restore 配平
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('未找到 <script>'); process.exit(1); }
const code = m[1];

// ---- mock canvas ctx ----
let saveCount = 0, restoreCount = 0;
function makeCtx() {
  const grad = { addColorStop() {} };
  const ctx = {
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    save() { saveCount++; },
    restore() { restoreCount++; },
  };
  const noops = ['fillRect','beginPath','arc','moveTo','lineTo','fill','stroke',
    'translate','rotate','setLineDash','setTransform','fillText','closePath','rect','scale',
    'drawImage','clip','arcTo','quadraticCurveTo','bezierCurveTo','ellipse','clearRect'];
  noops.forEach(n => ctx[n] = function(){});
  // swallow property writes
  ['fillStyle','strokeStyle','lineWidth','globalAlpha','shadowColor','shadowBlur',
   'font','textAlign','lineCap','lineJoin'].forEach(p => { ctx[p] = ''; });
  return ctx;
}

function fakeEl() {
  return {
    classList: { add(){}, remove(){}, contains(){return false;} },
    addEventListener() {}, removeEventListener() {},
    textContent: '', style: {}, offsetWidth: 0,
    getContext() { return makeCtx(); },
    width: 0, height: 0,
  };
}
const canvas = fakeEl();
const ctxMock = makeCtx();
canvas.getContext = () => ctxMock;

const store = {};
const localStorage = {
  getItem(k){ return k in store ? store[k] : null; },
  setItem(k,v){ store[k] = String(v); },
};

let rafQueue = [];
const sandbox = {
  console,
  Math, Date, JSON, setTimeout: (fn)=>{ try{fn();}catch(e){} return 0; },
  requestAnimationFrame(cb){ rafQueue.push(cb); return rafQueue.length; },
  cancelAnimationFrame(){},
  localStorage,
  document: {
    getElementById(){ return canvas; },
    querySelector(){ return fakeEl(); },
    addEventListener(){},
    createElement(){ return fakeEl(); },
  },
  window: {
    innerWidth: 900, innerHeight: 1500, devicePixelRatio: 2,
    addEventListener(){}, removeEventListener(){},
    AudioContext: undefined, webkitAudioContext: undefined,
  },
};
sandbox.window.document = sandbox.document;
sandbox.window.localStorage = localStorage;
sandbox.global = sandbox;
// alias window props at top level (script uses window.innerWidth etc.)
sandbox.window.innerWidth = 900; sandbox.window.innerHeight = 1500;

let errors = [];
try {
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'starlane-inline.js' });
} catch (e) {
  console.error('脚本加载抛错:', e); process.exit(1);
}

const G = sandbox.window.__STARLANE;
if (!G) { console.error('测试钩子缺失'); process.exit(1); }

function pump(n, ts0) {
  let ts = ts0 || 1000;
  for (let i = 0; i < n; i++) {
    const cb = rafQueue.shift();
    if (!cb) break;
    try { cb(ts); } catch (e) { errors.push('frame: ' + e.message); }
    ts += 16.7;
  }
  return ts;
}

// 1) 启动前跑几帧（start 模式）
pump(3, 1000);
console.log('mode(启动前):', G.state.mode);

// 2) 开始游戏
G.start();
console.log('mode:', G.state.mode, '| bodies:', G.bodies(), '| rings:', G.rings(),
  '| comet.alive:', G.state.comet.alive);

// 3) play 模式跑若干帧（渲染 + 更新，验证 save/restore 配平 & 无异常）
let ts = pump(30, 2000);
console.log('play 30帧后 save/restore:', saveCount, '/', restoreCount,
  (saveCount === restoreCount ? '✓配平' : '✗失衡'));

// 4) 在星屑正上方放一个光环，竖直发射，验证穿环得分 + 连击 + 自适应
const pad = { x: sandbox.window.innerWidth*0.5, y: sandbox.window.innerHeight - Math.max(70, sandbox.window.innerHeight*0.12) };
G.state.rings[0] = { x: pad.x, y: pad.y - 260, r: 45, active: true, respawnT: 0, ph: 0, got: false };
G.state.ringsCollected = 20; // 触发黑洞自适应阈值
const before = G.state.score;
G.fire(0, -560);
console.log('发射后 comet.alive:', G.state.comet.alive, '| bodies前:', G.bodies());
ts = pump(120, ts); // ~2s
console.log('穿环得分 before/after:', before, '->', G.state.score,
  (G.state.score > before ? '✓得分' : '✗未得分'));
console.log('连击峰值:', G.state.combo, '| ringsCollected:', G.state.ringsCollected,
  '| 自适应后 bodies:', G.bodies(), (G.bodies() > 2 ? '✓引力体增加' : '✗未增'));

// 5) 推进到结束，验证结算 + 最佳存档
G.advance(61);
console.log('结束 mode:', G.state.mode, '| best存档:', localStorage.getItem('starlane_best'));
console.log('最终 score:', G.state.score, '| 无运行时错误:', errors.length === 0 ? '✓' : '✗ '+errors.join('; '));

// 6) 全程 save/restore 终检
console.log('总 save/restore:', saveCount, '/', restoreCount,
  (saveCount === restoreCount ? '✓配平' : '✗失衡'));

if (errors.length) { console.error('运行期错误:\n' + errors.join('\n')); process.exit(1); }
if (saveCount !== restoreCount) { console.error('save/restore 未配平'); process.exit(1); }
if (G.state.score <= before) { console.error('发射后未得分'); process.exit(1); }
console.log('\n冒烟全部通过 ✓');
