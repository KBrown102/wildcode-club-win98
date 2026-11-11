/* 289-aurorachorus 《极光 · 合声》
   纯逻辑层：零 DOM / 零 Canvas，Node 可直接 require 做冒烟与平衡性模拟。

   世界模型：
     相位场  φ(i,t) = ph0 + OMEGA*t - S*i + mAmp*sin(OMG*t + psi0 - K*i) + jit[i] + off[i]
     因 OMEGA/S === OMG/K === V，整幅图案是以 V≈3.17 col/s 向右平移的刚性行波。
     每 2π/OMG ≈ 4.72s 会有一道「宽涌浪」从左侧扫入。

   核心技巧（数学上可证）：
     涟漪速度 RV=6.5 与涌浪同向，相对速度 RV-V=3.33。
     从涌浪【左缘/后缘】起爆 → 可向右吃到 ≈ 1 + 1.95*B 根；
     从【右缘/前缘】起爆 → 只能向左吃到 ≈ 1 + 0.67*B 根。
     所以「等一道宽涌浪，点它的左边缘」是最优解 —— 位置与时机双重技巧。
*/
(function (g) {
  'use strict';

  var W = 480, H = 800;
  var AUR_L = 30, AUR_R = 450;

  var OMEGA = 2 * Math.PI / 3.2;   // 1.9635 rad/s，单柱呼吸周期 3.2s
  var S = 0.62;                    // 空间相位梯度 rad/col
  var V = OMEGA / S;               // 图案右移速度 ≈ 3.167 col/s
  var K = 0.42;                    // 调制空间频率 rad/col
  var OMG = K * V;                 // ≈1.330 rad/s → 涌浪周期 2π/OMG ≈ 4.72s
  var RV = 6.5;                    // 涟漪速度 col/s
  var WIN_SIN = 0.64;              // 共鸣窗：sin φ ≥ 0.64（窗宽 1.754 rad）
  var WIN_SIN_TIDE = 0.30;         // 合声潮放宽（窗宽 ≈2.49 rad）
  var COOL = 0.40;                 // 失手冷却
  var REFUND_AT = 5;               // 连锁 ≥5 返还 1 束
  var TIDE_ON = 3.0, TIDE_WARN = 2.6;
  var WIN_W = 1.754;               // 常规窗宽（弧度），用于反解梯度

  var LEVELS = [
    { n: 13, waves: 7, tide: 15, band: 7.0 },
    { n: 16, waves: 8, tide: 16, band: 8.0 },
    { n: 19, waves: 9, tide: 17, band: 9.0 },
    { n: 22, waves: 10, tide: 18, band: 10.0 },
    { n: 26, waves: 11, tide: 19, band: 11.0 }
  ];

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  var G = {};
  G.W = W; G.H = H; G.AUR_L = AUR_L; G.AUR_R = AUR_R;
  G.LEVELS = LEVELS; G.V = V; G.RV = RV; G.OMEGA = OMEGA; G.OMG = OMG;
  G.S = S; G.K = K; G.TIDE_ON = TIDE_ON; G.TIDE_WARN = TIDE_WARN;
  G.WIN_SIN = WIN_SIN; G.REFUND_AT = REFUND_AT; G.COOL = COOL;

  // ---------- 建关 ----------
  G.newState = function (li, seed) {
    li = clamp(li | 0, 0, LEVELS.length - 1);
    if (seed === undefined || seed === null) seed = (Math.random() * 1e9) | 0;
    var L = LEVELS[li];
    var rnd = mulberry32(seed >>> 0);
    var n = L.n;
    var colW = (AUR_R - AUR_L) / n;

    // 想让最宽亮带 ≈ L.band 根 → 最小相位梯度 gmin = WIN_W / band
    // 梯度调制幅度 = mAmp*K，故 mAmp = (S - gmin)/K
    var gmin = WIN_W / L.band;
    var mAmp = Math.max(0.05, (S - gmin) / K);

    var cols = [];
    for (var i = 0; i < n; i++) {
      var yb = 474 + 18 * Math.sin(i * 0.33 + 0.7);
      var hh = 236 + 66 * Math.sin(i * 0.21 + 1.9);
      cols.push({ x: AUR_L + (i + 0.5) * colW, w: colW, yb: yb, h: hh, yt: yb - hh });
    }

    // 静态空间抖动：只与 i 有关，不破坏刚性行波
    var jit = [];
    var r1 = rnd() * 6.283, r2 = rnd() * 6.283;
    for (i = 0; i < n; i++) {
      jit.push(0.22 * Math.sin(0.51 * i + r1) + 0.14 * Math.sin(0.23 * i + r2));
    }

    var st = {
      li: li, n: n, colW: colW, cols: cols,
      SP: S, mAmp: mAmp,
      ph0: rnd() * 6.283, psi0: rnd() * 6.283, jit: jit,
      off: new Array(n).fill(0),
      locked: new Array(n).fill(false),
      lit: 0,
      waves: L.waves, wavesMax: L.waves,
      score: 0, maxChain: 0, launches: 0, misses: 0,
      ripples: [], groups: [], gid: 0,
      cd: 0, time: 0,
      tideT: L.tide, tideOn: false, tideWarn: false, afterglow: false,
      cursor: (n - 1) / 2,
      done: false, cleared: false,
      seed: seed >>> 0,
      sandbox: false,
      events: []
    };
    return st;
  };

  // ---------- 相位 / 亮度 ----------
  G.phase = function (st, i) {
    var amp = st.tideOn ? st.mAmp * 0.55 : st.mAmp;
    return st.ph0 + OMEGA * st.time - st.SP * i
      + amp * Math.sin(OMG * st.time + st.psi0 - K * i)
      + st.jit[i] + st.off[i];
  };
  G.bright = function (st, i) { return (Math.sin(G.phase(st, i)) + 1) * 0.5; };
  G.thSin = function (st) { return st.tideOn ? WIN_SIN_TIDE : WIN_SIN; };
  G.inWin = function (st, i) {
    if (st.locked[i]) return false;
    return Math.sin(G.phase(st, i)) >= G.thSin(st);
  };

  // 当前所有亮带区间（含端点），已锁定的柱不算
  G.bands = function (st) {
    var out = [], s = -1;
    for (var i = 0; i < st.n; i++) {
      var w = st.locked[i] ? false : (Math.sin(G.phase(st, i)) >= G.thSin(st));
      if (w && s < 0) s = i;
      if (!w && s >= 0) { out.push([s, i - 1]); s = -1; }
    }
    if (s >= 0) out.push([s, st.n - 1]);
    return out;
  };

  G.colAt = function (st, x) {
    return clamp(Math.floor((x - AUR_L) / st.colW), 0, st.n - 1);
  };

  // ---------- 发射 ----------
  G.launch = function (st, i) {
    if (st.done) return false;
    if (st.cd > 0) return false;
    if (st.waves <= 0) return false;
    i = clamp(i | 0, 0, st.n - 1);
    if (st.locked[i]) {
      // 彩蛋：已点亮的柱子可以当乐器弹 —— 免费出声，不耗波束不进冷却
      st.events.push({ t: 'chime', i: i });
      return false;
    }

    st.launches++;

    if (!G.inWin(st, i)) {
      // 失手：不扣波束，只推后相位 + 冷却 —— 零焦虑，但乱点没收益
      st.off[i] += 0.85;
      st.cd = COOL;
      st.misses++;
      st.events.push({ t: 'miss', i: i });
      return false;
    }
    st.waves--;

    st.locked[i] = true;
    st.lit++;
    st.cd = 0.16;
    var gr = { id: ++st.gid, len: 1, alive: 2, done: false, born: st.time };
    st.groups.push(gr);
    st.events.push({ t: 'launch', i: i });
    st.events.push({ t: 'lock', i: i, k: 1 });
    st.ripples.push({ pos: i, dir: 1, g: gr });
    st.ripples.push({ pos: i, dir: -1, g: gr });
    return true;
  };

  function finishGroup(st, gr) {
    if (gr.done) return;
    gr.done = true;
    var L = gr.len, gain = L * L * 5;
    st.score += gain;
    if (L > st.maxChain) st.maxChain = L;
    st.events.push({ t: 'chainEnd', len: L, gain: gain, x: 0 });
    if (L >= REFUND_AT) {
      st.waves++;
      st.events.push({ t: 'refund', len: L });
    }
    var k = st.groups.indexOf(gr);
    if (k >= 0) st.groups.splice(k, 1);
  }

  function settle(st) {
    if (st.done) return;
    st.done = true;
    st.cleared = st.lit >= st.n;
    st.events.push({ t: st.cleared ? 'clear' : 'over' });
  }

  function hit(st, rp, k) {
    if (k < 0 || k >= st.n) { rp.dead = true; return; }
    var gr = rp.g;
    if (st.locked[k]) {
      st.events.push({ t: 'res', i: k });
      st.score += 3;
      return;
    }
    if (G.inWin(st, k)) {
      st.locked[k] = true;
      st.lit++;
      gr.len++;
      st.events.push({ t: 'lock', i: k, k: gr.len });
    } else {
      rp.dead = true;                       // 涟漪被暗柱吸收 —— 不惩罚，纯止损
      st.events.push({ t: 'absorb', i: k });
    }
  }

  // ---------- 主更新 ----------
  G.update = function (st, dt) {
    if (!(dt > 0)) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.done) return st;

    st.time += dt;
    if (st.cd > 0) st.cd = Math.max(0, st.cd - dt);

    var wasOn = st.tideOn, wasWarn = st.tideWarn;
    st.tideT -= dt;
    st.tideOn = st.tideT <= TIDE_ON;
    st.tideWarn = !st.tideOn && st.tideT <= TIDE_ON + TIDE_WARN;
    if (st.tideT <= 0) st.tideT += LEVELS[st.li].tide;
    if (st.tideOn !== wasOn) st.events.push({ t: 'tide', on: st.tideOn });
    if (st.tideWarn !== wasWarn && st.tideWarn) st.events.push({ t: 'tideWarn' });

    // 余晖：只剩最后几根暗柱时，它们会自己慢慢亮起来（保底，零挫败）
    var leftN = st.n - st.lit;
    var glowN = Math.max(2, Math.round(st.n * 0.12));
    var ag = leftN > 0 && leftN <= glowN;
    if (ag !== st.afterglow) { st.afterglow = ag; st.events.push({ t: 'afterglow', on: ag }); }
    if (ag) {
      for (var q = 0; q < st.n; q++) {
        if (st.locked[q]) continue;
        var ph = G.phase(st, q);
        var err = ((Math.PI / 2 - ph + Math.PI) % 6.283185307 + 6.283185307) % 6.283185307 - Math.PI;
        st.off[q] += err * Math.min(1, 1.7 * dt);
      }
    }

    var rip = st.ripples;
    for (var a = rip.length - 1; a >= 0; a--) {
      var rp = rip[a];
      var left = RV * dt;
      while (left > 0 && !rp.dead) {
        var step = Math.min(left, 0.4);
        left -= step;
        var f0 = Math.floor(rp.pos);
        rp.pos += rp.dir * step;
        var f1 = Math.floor(rp.pos);
        if (f1 !== f0) {
          var k;
          if (rp.dir > 0) { for (k = f0 + 1; k <= f1; k++) hit(st, rp, k); }
          else { for (k = f0 - 1; k >= f1; k--) hit(st, rp, k); }
        }
      }
      if (rp.dead || rp.pos < -1.5 || rp.pos > st.n + 0.5) {
        rp.g.alive--;
        if (rp.g.alive <= 0) finishGroup(st, rp.g);
        rip.splice(a, 1);
      }
    }

    if (st.lit >= st.n && rip.length === 0) settle(st);
    else if (st.waves <= 0 && rip.length === 0) settle(st);
    return st;
  };

  G.tick = G.update;

  G.stars = function (st) {
    if (!st.cleared) return 0;
    if (st.maxChain >= Math.ceil(st.n * 0.32)) return 3;
    if (st.maxChain >= Math.ceil(st.n * 0.22)) return 2;
    return 1;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = G;
  else g.AuroraGame = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
