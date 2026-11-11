/* 261-chromaring · 核心逻辑（零 DOM 依赖、可被 Node 直接 require 冒烟测试）
 * 设计：球固定在屏幕中央，彩色圆环从下方往上飘（屏幕往下推的视感）。
 *       圆环由 4 段颜色组成并缓慢旋转。玩家唯一动作＝按切换键让球的颜色循环。
 *       当球穿过圆环时，圆环 12 点钟位置的段颜色必须等于球的颜色才安全通过；
 *       否则撞死。越往后圆环越密、旋转越快，连击越高分越高。
 *       重置无读条无惩罚，点一下立刻再来。
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.GameLib = api;
})(typeof self !== 'undefined' ? self : this, function () {
'use strict';

// 4 色循环，红绿蓝金
const COLORS = [
  { name: 'red',   fill: '#ff4d6d', rgb: [255, 77, 109] },
  { name: 'green', fill: '#2ecc71', rgb: [46, 204, 113] },
  { name: 'blue',  fill: '#3aa6ff', rgb: [58, 166, 255] },
  { name: 'gold',  fill: '#f1c40f', rgb: [241, 196, 15] }
];
const W = 360, H = 640;
const BALL_X = W / 2;
const BALL_Y = H * 0.42;
const BALL_R = 11;
const RING_R = 78;          // 圆环中心到段色中线的距离
const RING_THICK = 18;      // 圆环色段厚度
const SEG_COUNT = 4;        // 每环段数
const STORAGE_KEY = 'chromaring_best';

function makeRing(y, rng){
  const segs = [];
  for (let i = 0; i < SEG_COUNT; i++){
    segs.push(Math.floor(rng() * COLORS.length));
  }
  return {
    y: y,
    rotation: rng() * 360,
    rotationDir: rng() < 0.5 ? -1 : 1,
    segments: segs
  };
}

function createGame(opts){
  opts = opts || {};
  const storage = opts.storage || null;
  const rng = opts.rng || Math.random;

  let best = 0;
  if (storage && typeof storage.getItem === 'function'){
    const v = parseInt(storage.getItem(STORAGE_KEY) || '0', 10);
    best = (v >= 0 && v < 1e9) ? v : 0;
  }

  const state = {
    phase: 'idle',         // 'idle' | 'play' | 'dead'
    score: 0,
    best: best,
    streak: 0,             // 当前连击
    maxStreak: 0,
    rings: [],
    spawnTimer: 0,
    rotationSpeed: 0.6,    // 度/帧
    speed: 2.2,            // 圆环向上飞（屏幕往下推）的像素/帧
    ballColorIdx: 0,
    particles: [],
    flashTime: 0,
    deadAt: 0,
    elapsed: 0,
    comboShake: 0
  };

  function reset(){
    state.phase = 'idle';
    state.score = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.rings = [];
    state.spawnTimer = 0;
    state.rotationSpeed = 0.6;
    state.speed = 2.2;
    state.ballColorIdx = 0;
    state.particles = [];
    state.flashTime = 0;
    state.deadAt = 0;
    state.elapsed = 0;
    state.comboShake = 0;
  }

  function seedRings(){
    state.rings = [];
    // 起手：球下方预先铺 3 个圆环，间距均匀
    const baseY = BALL_Y + RING_R + 250;
    for (let i = 0; i < 3; i++){
      state.rings.push(makeRing(baseY + i * 235, rng));
    }
  }

  function start(){
    reset();
    seedRings();
    state.phase = 'play';
  }

  // 玩家唯一动作：循环切色
  function switchColor(){
    if (state.phase !== 'play') return false;
    state.ballColorIdx = (state.ballColorIdx + 1) % COLORS.length;
    return true;
  }

  function tick(){
    state.elapsed++;

    if (state.phase === 'play'){
      // 圆环往上飘
      for (const r of state.rings){
        r.y -= state.speed;
        r.rotation += state.rotationSpeed * r.rotationDir;
      }

      // 生成新圆环：找到最小 y（最远端），在它下方再放一个
      state.spawnTimer++;
      const interval = Math.max(34, 70 - state.score * 0.45);
      if (state.spawnTimer >= interval){
        state.spawnTimer = 0;
        let maxY = -Infinity;
        for (const r of state.rings) if (r.y < maxY) maxY = r.y;
        state.rings.push(makeRing(maxY - 235, rng));
      }

      // 碰撞窗口：球到圆环圆心距离在 [RING_R - RING_THICK - BALL_R, RING_R + BALL_R]
      const hitMin = RING_R - RING_THICK - BALL_R + 4;
      const hitMax = RING_R + BALL_R;

      for (const r of state.rings){
        if (r._dead) continue;
        const dy = BALL_Y - r.y;
        if (dy < hitMin || dy > hitMax) continue;
        // 球撞圆环的角度（相对圆环本地坐标，正上方 90° = 12 点钟位置）
        const angleAtHit = (((90 - r.rotation) % 360) + 360) % 360;
        const segSize = 360 / SEG_COUNT;
        const segIdx = Math.floor(angleAtHit / segSize) % SEG_COUNT;
        const segColor = r.segments[segIdx];
        if (segColor !== state.ballColorIdx){
          die();
          return;
        } else {
          passRing(r, segIdx);
        }
      }

      // 清理穿过 + 离屏的圆环
      state.rings = state.rings.filter(r => !r._dead && r.y > -150);

      // 难度递增（封顶）
      state.rotationSpeed = Math.min(2.8, 0.6 + state.score * 0.018);
      state.speed = Math.min(4.5, 2.2 + state.score * 0.025);
    }

    // 死亡衰减
    if (state.flashTime > 0) state.flashTime--;
    if (state.comboShake > 0) state.comboShake--;

    // 粒子更新
    for (const p of state.particles){
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.life--;
    }
    state.particles = state.particles.filter(p => p.life > 0);
  }

  function passRing(ring, segIdx){
    state.score++;
    state.streak++;
    if (state.streak > state.maxStreak) state.maxStreak = state.streak;
    if (state.streak > 1) state.comboShake = Math.min(8, state.streak);
    ring._dead = true;
    // 散开粒子：从圆环当前位置炸出球颜色的粒子
    const col = COLORS[state.ballColorIdx];
    const baseAng = -Math.PI / 2 + (Math.random() - 0.5) * 0.6;
    for (let i = 0; i < 10; i++){
      const a = baseAng + (i - 5) * 0.18;
      state.particles.push({
        x: BALL_X,
        y: BALL_Y - (RING_R - 4),
        vx: Math.cos(a) * (1.6 + Math.random() * 0.8),
        vy: Math.sin(a) * (1.6 + Math.random() * 0.8) - 0.4,
        life: 32,
        color: col.fill,
        size: 3 + Math.random() * 1.5
      });
    }
  }

  function die(){
    state.phase = 'dead';
    state.flashTime = 16;
    state.deadAt = state.elapsed;
    // 球炸开
    const col = COLORS[state.ballColorIdx];
    for (let i = 0; i < 22; i++){
      const a = (i / 22) * Math.PI * 2 + Math.random() * 0.4;
      state.particles.push({
        x: BALL_X,
        y: BALL_Y,
        vx: Math.cos(a) * (3 + Math.random() * 1.5),
        vy: Math.sin(a) * (3 + Math.random() * 1.5),
        life: 44,
        color: col.fill,
        size: 3.5 + Math.random() * 1.8
      });
    }
    if (state.score > state.best){
      state.best = state.score;
      if (storage && typeof storage.setItem === 'function'){
        try{ storage.setItem(STORAGE_KEY, String(state.best)); }catch(e){}
      }
    }
  }

  return {
    state: state,
    COLORS: COLORS,
    W: W, H: H,
    BALL_X: BALL_X, BALL_Y: BALL_Y, BALL_R: BALL_R,
    RING_R: RING_R, RING_THICK: RING_THICK,
    SEG_COUNT: SEG_COUNT,
    STORAGE_KEY: STORAGE_KEY,
    start: start,
    switchColor: switchColor,
    tick: tick,
    isActive: function(){ return state.phase === 'play'; },
    // 暴露 reset 用于外部强制重置（一般不需要）
    reset: function(){ reset(); }
  };
}

return { createGame: createGame };
});
