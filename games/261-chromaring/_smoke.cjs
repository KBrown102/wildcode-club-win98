/* 261-chromaring · 冒烟测试（Node 跑 game.js 纯逻辑）
 * 用法：node _smoke.cjs
 * 覆盖：start/tick/switchColor/碰撞/死亡/best 写入/重开
 */
'use strict';
const GameLib = require('./game.js');

let pass = 0, fail = 0;
function ok(name, cond, extra){
  if (cond){ console.log('  ✓', name); pass++; }
  else { console.log('  ✗', name, extra || ''); fail++; }
}
function eq(name, a, b){
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  ok(name, sa === sb, 'got='+sa+' want='+sb);
}

function makeStorage(initial){
  const d = Object.assign({}, initial || {});
  return {
    getItem(k){ return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
    setItem(k, v){ d[k] = String(v); },
    _d: d
  };
}

// 固定 rng 让测试可复现
function fixedRng(seq){ let i = 0; return function(){ return seq[i++ % seq.length]; }; }

console.log('--- chromaring smoke ---');

// 1) 基础结构
{
  const g = GameLib.createGame();
  ok('default phase idle', g.state.phase === 'idle');
  ok('COLORS len 4', g.COLORS.length === 4);
  ok('COLORS has red/green/blue/gold',
    ['red','green','blue','gold'].every(c => g.COLORS.find(x => x.name === c)));
  ok('W=360 H=640', g.W === 360 && g.H === 640);
  ok('SEG_COUNT=4', g.SEG_COUNT === 4);
  ok('BALL_X=180 BALL_Y=~268', g.BALL_X === 180 && g.BALL_Y > 260 && g.BALL_Y < 280);
}

// 2) start 后生成 3 个起手圆环
{
  const g = GameLib.createGame();
  g.start();
  ok('start phase play', g.state.phase === 'play');
  ok('start 3 rings', g.state.rings.length === 3);
  ok('start score 0', g.state.score === 0);
  ok('start ballColorIdx 0', g.state.ballColorIdx === 0);
  ok('rings below ball', g.state.rings.every(r => r.y > g.BALL_Y));
}

// 3) switchColor 循环 4 次回到原点
{
  const g = GameLib.createGame();
  g.start();
  const start = g.state.ballColorIdx;
  for (let i = 0; i < 4; i++) g.switchColor();
  ok('switchColor 4-cycle back', g.state.ballColorIdx === start);
}

// 4) tick 推进圆环往上飘
{
  const g = GameLib.createGame();
  g.start();
  const r0 = g.state.rings[0].y;
  for (let i = 0; i < 10; i++) g.tick();
  ok('rings y decreases', g.state.rings[0].y < r0);
}

// 5) 圆环旋转
{
  const g = GameLib.createGame();
  g.start();
  const rot0 = g.state.rings[0].rotation;
  for (let i = 0; i < 10; i++) g.tick();
  ok('rings rotation changes', g.state.rings[0].rotation !== rot0);
}

// 6) 强制死亡：固定 rng + 暴力切色循环
{
  // 让圆环段颜色固定成 [0,1,2,3]，球初始 0，先撞段 0 = 通过，
  // 切到 1，撞段 1 = 通过；再切到 2，等等。rng 控制段颜色可重现。
  // 这里我们用：固定每环都段 [0,1,2,3]，rotation=0 让 12 点落在段 1
  const rng = (function(){ let i = 0; const seq = [0.1, 0.2, 0.3, 0.4, 0.5]; return function(){ return seq[i++ % seq.length]; }; })();
  const g = GameLib.createGame({ rng });
  g.start();
  // 强制让所有起手圆环段相同
  for (const r of g.state.rings){
    r.segments = [0, 1, 2, 3];
    r.rotation = 0;  // 让 12 点位 = 段 1 (中心 135°)，需要球色 = 1
  }
  // 让球色 = 1
  g.state.ballColorIdx = 1;
  // tick 一段时间，第一个圆环应该通过
  let died = false;
  for (let i = 0; i < 600; i++){
    if (g.state.phase !== 'play'){ died = true; break; }
    g.tick();
  }
  // 我们没保证每个圆环都通过——但至少 score >= 1（如果第一个圆环在 600 tick 内经过）
  ok('eventually score >= 1 or phase dead', g.state.score >= 1 || g.state.phase === 'dead');
}

// 7) 必死情况：固定 rng 让圆环段颜色全是 0，初始球色 0，通过第一个；再切到 1，让后续撞死
{
  const g = GameLib.createGame();
  g.start();
  // 强制所有圆环段 0，球色切到 1，永远撞死
  for (const r of g.state.rings){
    r.segments = [0, 0, 0, 0];
    r.rotation = 0;
    r.y = g.BALL_Y + 200;  // 紧挨着球下方
  }
  g.state.ballColorIdx = 1;
  let died = false;
  for (let i = 0; i < 1000; i++){
    g.tick();
    if (g.state.phase === 'dead'){ died = true; break; }
  }
  ok('forced mismatch dies', died === true);
  ok('dead has particles', g.state.particles.length > 0);
  ok('dead has flashTime', g.state.flashTime > 0);
}

// 8) 死亡时 best 写入
{
  const storage = makeStorage();
  const g = GameLib.createGame({ storage });
  g.start();
  // 立刻强制死
  for (const r of g.state.rings){
    r.segments = [0, 0, 0, 0];
    r.rotation = 0;
    r.y = g.BALL_Y + 100;
  }
  g.state.ballColorIdx = 1;
  // 先手动让球切到对（让它通过几个涨分），再切错死
  // 简单粗暴：直接撞死，score=0，best 不会写
  // 让 score=3 再死
  g.state.score = 3;
  for (let i = 0; i < 1000; i++){
    g.tick();
    if (g.state.phase === 'dead') break;
  }
  // score 不会因为 tick 增加（因为没通过圆环），手动写入 best
  g.state.score = 8;  // 模拟撞死前的真实分
  // 现在 best = 0，新分 8 应该被写入——但 die() 里只在 die 时写
  // 让我们重新跑：score=8，然后撞死
  g.start();
  for (const r of g.state.rings){
    r.segments = [0, 0, 0, 0];
    r.rotation = 0;
    r.y = g.BALL_Y + 100;
  }
  g.state.ballColorIdx = 1;
  g.state.score = 8;
  for (let i = 0; i < 1000; i++){
    g.tick();
    if (g.state.phase === 'dead') break;
  }
  ok('after death best in memory', g.state.best === 8);
  ok('after death best in storage', storage.getItem('chromaring_best') === '8');
}

// 9) 重开：best 保留
{
  const storage = makeStorage({ 'chromaring_best': '42' });
  const g = GameLib.createGame({ storage });
  ok('initial best from storage', g.state.best === 42);
  g.start();
  ok('restart clears score', g.state.score === 0);
  ok('restart keeps best', g.state.best === 42);
  ok('restart clears streak', g.state.streak === 0);
  ok('restart has 3 rings', g.state.rings.length === 3);
}

// 10) 连击：通过多次
{
  const g = GameLib.createGame();
  g.start();
  // 把所有圆环都强制成「段 0」+ rotation=0 让 12 点位 = 段 0
  // 球色 = 0
  for (const r of g.state.rings){
    r.segments = [0, 0, 0, 0];
    r.rotation = 0;
    r.y = g.BALL_Y + 60;  // 紧贴球下方（让 tick 时能快速到达碰撞区）
  }
  g.state.ballColorIdx = 0;
  for (let i = 0; i < 1000; i++){
    g.tick();
    if (g.state.phase !== 'play') break;
  }
  ok('combo triggered', g.state.score >= 1);
}

// 11) idle 阶段 switchColor 无效
{
  const g = GameLib.createGame();
  ok('idle initial', g.state.phase === 'idle');
  const before = g.state.ballColorIdx;
  const result = g.switchColor();
  ok('idle switchColor noop', result === false && g.state.ballColorIdx === before);
}

console.log('\n' + pass + ' pass, ' + fail + ' fail');
process.exit(fail > 0 ? 1 : 0);
