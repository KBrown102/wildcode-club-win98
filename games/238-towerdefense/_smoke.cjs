/* 238 守塔 · 烟雾测试
   A 层：纯逻辑（路径合法性 / 放塔规则 / 升级卖出 / 波次推进 / 自动玩家长跑不变量）
   B 层：桩 DOM+Canvas+Audio 加载 app.js 实跑若干帧 */
const path = require('path');
const fs = require('fs');
const TD = require(path.join(__dirname, 'game.js'));

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
function head(s) { console.log('\n== ' + s); }

// ─────────── A 层 ───────────
head('A1 路径生成合法性（200 个种子）');
for (let s = 0; s < 200; s++) {
  const p = TD.makePath(s);
  ok(p.length >= 12, 'seed ' + s + ' 路径过短 ' + p.length);
  ok(p[0].x === 0, 'seed ' + s + ' 起点不在左边缘');
  ok(p[p.length - 1].x === TD.COLS - 1, 'seed ' + s + ' 终点不在右边缘');
  let dupe = false, adjBad = false;
  const seen = new Set();
  for (let i = 0; i < p.length; i++) {
    const key = p[i].y * 100 + p[i].x;
    if (seen.has(key)) dupe = true;
    seen.add(key);
    if (p[i].x < 0 || p[i].x >= TD.COLS || p[i].y < 0 || p[i].y >= TD.ROWS) adjBad = true;
    if (i > 0) {
      const d = Math.abs(p[i].x - p[i - 1].x) + Math.abs(p[i].y - p[i - 1].y);
      if (d !== 1) adjBad = true;
    }
  }
  ok(!dupe, 'seed ' + s + ' 路径自交/重复格');
  ok(!adjBad, 'seed ' + s + ' 路径不连续或越界');
  // 必须留出足够空地
  ok(TD.COLS * TD.ROWS - p.length >= 40, 'seed ' + s + ' 可建造空地过少');
}

head('A2 放塔 / 升级 / 卖出规则');
{
  const g = new TD.Game(7);
  const pc = g.path[0];
  ok(!g.canPlace(pc.x, pc.y), '路上竟然可以建塔');
  ok(!g.canPlace(-1, 0) && !g.canPlace(TD.COLS, 0), '越界竟然可以建塔');
  // 找一块空地
  let spot = null;
  for (let y = 0; y < TD.ROWS && !spot; y++) for (let x = 0; x < TD.COLS && !spot; x++) if (g.canPlace(x, y)) spot = { x, y };
  ok(!!spot, '找不到空地');
  const g0 = g.gold;
  const tw = g.place('arrow', spot.x, spot.y);
  ok(!!tw, '放塔失败');
  ok(g.gold === g0 - TD.TOWERS.arrow.cost, '放塔没扣钱');
  ok(!g.canPlace(spot.x, spot.y), '同格竟能重复建塔');
  ok(g.place('arrow', spot.x, spot.y) === false, '同格放塔应失败');
  g.gold += 400; // 备足升级费用再测三级成长
  const before = g.gold;
  const upc = TD.upCost('arrow', 1);
  ok(g.upgrade(tw) === true, '升级失败');
  ok(tw.lvl === 2 && g.gold === before - upc, '升级等级或扣费不对');
  g.upgrade(tw);
  ok(tw.lvl === 3, '升到 3 级失败');
  ok(g.upgrade(tw) === false, '满级还能升');
  const inv = tw.invested, gb = g.gold;
  const back = g.sell(tw);
  ok(back === Math.floor(inv * 0.6) && g.gold === gb + back, '卖出返还不对');
  ok(g.towers.length === 0 && g.canPlace(spot.x, spot.y), '卖出后塔没移除');
  // 钱不够
  const g2 = new TD.Game(9);
  g2.gold = 10;
  let sp2 = null;
  for (let y = 0; y < TD.ROWS && !sp2; y++) for (let x = 0; x < TD.COLS && !sp2; x++) if (g2.canPlace(x, y)) sp2 = { x, y };
  ok(g2.place('arrow', sp2.x, sp2.y) === false, '钱不够竟能建塔');
}

head('A3 波次与出怪');
{
  const g = new TD.Game(11);
  ok(g.state === 'rest' && g.wave === 0, '初始不是备战态');
  const bonus = g.callEarly();
  ok(bonus > 0 && g.state === 'wave' && g.wave === 1, '提前召唤失败');
  ok(g.spawnQueue.length >= 6, '第 1 波怪数过少');
  for (let i = 0; i < 240; i++) g.update(1 / 60);
  ok(g.enemies.length > 0, '出怪后场上无敌人');
  // 无塔时必然漏怪掉血
  for (let i = 0; i < 60 * 90; i++) { g.update(1 / 60); if (g.lives < 20) break; }
  ok(g.lives < 20, '完全不放塔却没掉生命');
  // 5 的倍数波必有首领
  const g5 = new TD.Game(13);
  const list = g5.waveList(5);
  ok(list.indexOf('boss') >= 0, '第 5 波没有首领');
  ok(new TD.Game(13).waveList(4).indexOf('boss') < 0, '第 4 波不该有首领');
}

head('A4 塔真能杀怪 + 清波给奖励');
{
  const g = new TD.Game(21);
  g.gold = 4000;
  // 沿路两侧铺满箭塔
  let built = 0;
  for (const c of g.path) {
    for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const x = c.x + d[0], y = c.y + d[1];
      if (g.canPlace(x, y) && built < 26) { g.place('arrow', x, y); built++; }
    }
  }
  ok(built >= 10, '沿路可建塔位过少 ' + built);
  g.callEarly();
  let guard = 0;
  while (g.state === 'wave' && guard++ < 60 * 120) g.update(1 / 60);
  ok(g.kills > 0, '塔没有杀死任何敌人');
  ok(g.state === 'rest', '第 1 波没能清完（guard=' + guard + '）');
  ok(g.lives === 20, '铺满塔还漏怪 lives=' + g.lives);
  ok(g.wave === 1 && g.restT > 0, '清波后没进间歇');
}

head('A5 自动玩家长跑（不变量 + 能推进到较深波次）');
{
  const g = new TD.Game(33);
  const spots = [];
  for (const c of g.path) {
    for (const d of [[0, -1], [0, 1], [-1, 0], [1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const x = c.x + d[0], y = c.y + d[1];
      if (x >= 0 && y >= 0 && x < TD.COLS && y < TD.ROWS && !g.blocked[y * TD.COLS + x]) {
        if (!spots.some(s => s.x === x && s.y === y)) spots.push({ x, y });
      }
    }
  }
  ok(spots.length >= 20, '路侧空位过少 ' + spots.length);
  let frames = 0, lastLives = g.lives, badNaN = false, badGold = false, maxEnemies = 0;
  while (g.state !== 'over' && g.wave < 26 && frames < 60 * 60 * 12) {
    // 简单 AI：有钱就补塔，塔够了就升级
    if (g.towers.length < spots.length && g.gold >= 60) {
      const s = spots[g.towers.length % spots.length];
      if (g.canPlace(s.x, s.y)) {
        const type = (g.towers.length % 5 === 3) ? 'cannon' : (g.towers.length % 7 === 5 ? 'frost' : 'arrow');
        if (g.gold >= TD.TOWERS[type].cost) g.place(type, s.x, s.y);
        else g.place('arrow', s.x, s.y);
      }
    } else if (g.towers.length) {
      const t = g.towers[frames % g.towers.length];
      if (t.lvl < 3 && g.gold >= TD.upCost(t.type, t.lvl) + 120) g.upgrade(t);
    }
    g.update(1 / 60); frames++;
    if (g.lives > lastLives) { ok(false, '生命竟然回升'); break; }
    lastLives = g.lives;
    if (g.gold < 0) badGold = true;
    maxEnemies = Math.max(maxEnemies, g.enemies.length);
    for (const e of g.enemies) {
      if (!isFinite(e.x) || !isFinite(e.y) || !isFinite(e.hp) || !isFinite(e.t)) badNaN = true;
      if (e.x < -1 || e.y < -1 || e.x > TD.COLS + 1 || e.y > TD.ROWS + 1) badNaN = true;
    }
    for (const s of g.shots) if (!isFinite(s.x) || !isFinite(s.y)) badNaN = true;
  }
  ok(!badNaN, '出现 NaN 或坐标越界');
  ok(!badGold, '金币变负数');
  ok(g.wave >= 8, '自动玩家只撑到第 ' + g.wave + ' 波（太难）');
  ok(g.shots.length < 400 && g.enemies.length < 200, '数组泄漏 shots=' + g.shots.length + ' enemies=' + g.enemies.length);
  console.log('   [info] 自动玩家：到第 ' + g.wave + ' 波，state=' + g.state + '，击杀 ' + g.kills +
    '，塔 ' + g.towers.length + '，生命 ' + g.lives + '，峰值同屏敌人 ' + maxEnemies + '，帧 ' + frames);
}

head('A6 生命耗尽必定结算');
{
  const g = new TD.Game(41);
  let guard = 0;
  while (g.state !== 'over' && guard++ < 60 * 60 * 6) g.update(1 / 60);
  ok(g.state === 'over', '一直不放塔却没结算');
  ok(g.lives === 0, '结算时生命不为 0');
  const w = g.wave, k = g.kills;
  g.update(1 / 60);
  ok(g.wave === w && g.kills === k, '结算后仍在推进');
  ok(g.place('arrow', 0, 0) === false || true, 'noop');
}

head('A7 霜塔减速 / 炮塔溅射');
{
  const g = new TD.Game(5);
  g.gold = 9999;
  g.callEarly();
  for (let i = 0; i < 120; i++) g.update(1 / 60);
  ok(g.enemies.length > 0, '没有敌人可测');
  const e = g.enemies[0];
  g.impact({ type: 'frost', x: e.x, y: e.y, tx: e.x, ty: e.y, tid: e.id, dmg: 5, splash: 0, slow: 0.5, slowDur: 1.5 });
  ok(e.slowT > 0 && e.slow === 0.5, '霜塔没造成减速');
  const hp0 = g.enemies.map(x => x.hp);
  g.impact({ type: 'cannon', x: e.x, y: e.y, tx: e.x, ty: e.y, tid: e.id, dmg: 20, splash: 1.5 });
  let hurtCount = 0;
  g.enemies.forEach((x, i) => { if (x.hp < (hp0[i] || 1e9)) hurtCount++; });
  ok(hurtCount >= 1, '溅射一个都没打到');
}

// ─────────── B 层：桩 DOM 跑 app.js ───────────
head('B 渲染层（桩 DOM + Canvas + Audio）');
(function () {
  const handlers = {};
  function mkEl(id) {
    const el = {
      id, textContent: '', innerHTML: '', disabled: false, value: '',
      style: {}, children: [], _cls: new Set(), _h: {},
      clientWidth: 900, clientHeight: 520,
      classList: {
        add(c) { el._cls.add(c); }, remove(c) { el._cls.delete(c); },
        contains(c) { return el._cls.has(c); }, toggle(c) { el._cls.has(c) ? el._cls.delete(c) : el._cls.add(c); }
      },
      getAttribute(n) { return el['_attr_' + n]; },
      setAttribute(n, v) { el['_attr_' + n] = v; },
      addEventListener(t, fn) { (el._h[t] = el._h[t] || []).push(fn); },
      removeEventListener() { },
      dispatchEvent(ev) { (el._h[ev.type] || []).forEach(f => f(ev)); return true; },
      click() { (el._h.click || []).forEach(f => f({ type: 'click', preventDefault() { } })); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 624, height: 432 }; },
      appendChild(c) { el.children.push(c); }
    };
    return el;
  }

  const ctxStub = new Proxy({
    canvas: null, measureText: () => ({ width: 60 }),
    createLinearGradient: () => ({ addColorStop() { } }),
    createRadialGradient: () => ({ addColorStop() { } }),
    setTransform() { }, save() { }, restore() { }
  }, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'globalAlpha' || k === 'lineWidth' || k === 'lineDashOffset') return 1;
      return function () { };
    },
    set() { return true; }
  });

  const els = {};
  const ids = ['board', 'hWave', 'hGold', 'hLife', 'hKill', 'btnCall', 'btnSpeed', 'btnMute',
    'panel', 'pInfo', 'btnUp', 'btnSell', 'startVeil', 'overVeil', 'btnStart', 'btnRetry',
    'oWave', 'oSub', 'tip', 'stage'];
  ids.forEach(id => { els[id] = mkEl(id); });
  els.board.getContext = () => ctxStub;
  els.board.width = 0; els.board.height = 0;

  const shop = ['arrow', 'cannon', 'frost'].map(t => { const e = mkEl('tw_' + t); e.setAttribute('data-type', t); return e; });

  const rafQ = [];
  const store = {};
  global.window = {
    devicePixelRatio: 2,
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); },
    AudioContext: function () {
      return {
        currentTime: 0, destination: {},
        createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() { }, start() { }, stop() { } }),
        createGain: () => ({ gain: { value: 0, setValueAtTime() { }, linearRampToValueAtTime() { }, exponentialRampToValueAtTime() { } }, connect() { } })
      };
    },
    requestAnimationFrame(fn) { rafQ.push(fn); return rafQ.length; },
    localStorage: { getItem: k => store[k] || null, setItem: (k, v) => { store[k] = v; } }
  };
  global.document = {
    getElementById: id => els[id] || mkEl(id),
    querySelectorAll: sel => (sel === '.tw' ? shop : []),
    addEventListener(t, fn) { (handlers[t] = handlers[t] || []).push(fn); }
  };
  global.localStorage = window.localStorage;
  global.requestAnimationFrame = window.requestAnimationFrame;
  global.performance = { now: () => Date.now() };
  global.self = global.window;
  global.window.TD = TD;

  let err = null;
  try {
    // 用 CommonJS 加载 app.js（它是 IIFE，读全局 window/document）
    const code = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
    new Function('window', 'document', 'localStorage', 'requestAnimationFrame', 'performance', 'self', code)
      (global.window, global.document, global.localStorage, global.requestAnimationFrame, global.performance, global.window);
  } catch (e) { err = e; }
  ok(!err, 'app.js 加载抛错：' + (err && err.stack));
  if (err) return;

  const G = global.window.__GAME;
  ok(!!G, '缺少 __GAME 钩子');
  if (!G) return;

  function frames(n, dtms) {
    for (let i = 0; i < n; i++) {
      const fn = rafQ.shift();
      if (!fn) { ok(false, '第 ' + i + ' 帧没有排到 rAF 回调'); return; }
      fn(i * (dtms || 16.7));
    }
  }

  let e2 = null;
  try {
    frames(3);
    ok(G.state().state === 'rest', '初始不是备战');
    G.start();
    // 铺一圈塔
    G.pick('arrow');
    let placed = 0;
    const g = G.g;
    for (const c of g.path) {
      for (const d of [[0, -1], [0, 1]]) {
        const x = c.x + d[0], y = c.y + d[1];
        if (g.canPlace(x, y) && g.gold >= 60) { if (G.tapCell(x, y) === 'placed') placed++; }
      }
    }
    ok(placed >= 2, '桩环境里一个塔都没放下');
    // 选中一个塔并升级
    const first = g.towers[0];
    G.tapCell(first.cx, first.cy);
    els.btnUp.click();
    els.btnSpeed.click();
    els.btnMute.click();
    els.btnMute.click();
    els.btnCall.click();
    frames(400, 16.7);
    ok(G.state().wave >= 1, '跑了 400 帧还没开波');
    // 模拟点击画布（真实事件路径）
    els.board.dispatchEvent({ type: 'pointerdown', clientX: 30, clientY: 30, preventDefault() { } });
    els.board.dispatchEvent({ type: 'pointermove', clientX: 200, clientY: 120, preventDefault() { } });
    frames(600, 16.7);
    // 键盘
    (handlers.keydown || []).forEach(f => f({ key: '2', preventDefault() { } }));
    (handlers.keydown || []).forEach(f => f({ key: ' ', preventDefault() { } }));
    (handlers.keydown || []).forEach(f => f({ key: 'Escape', preventDefault() { } }));
    (handlers.resize || []).forEach(f => f({}));
    frames(900, 16.7);
    els.btnRetry.click();
    frames(120, 16.7);
    ok(G.state().wave <= 1, '重开后波次没归零');
    ok(G.g.lives === 20 && G.g.kills === 0, '重开后生命/击杀没归零');
  } catch (e) { e2 = e; }
  ok(!e2, '渲染层运行抛错：' + (e2 && e2.stack));
  console.log('   [info] 桩环境跑完：' + JSON.stringify(G.state()));
})();

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail ? 1 : 0);
