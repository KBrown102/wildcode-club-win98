/**
 * smoothing.js —— 帧率无关平滑 · 屏幕抖动 · 缓动曲线
 * ============================================================================
 * 技法提炼自 gamedev-skills/awesome-gamedev-agent-skills 仓库的 camera-systems、
 * game-feel、input-systems 三个 skill 的引擎中立部分，此处用原生 JS 重写。
 * 零依赖，UMD。
 *
 * 用法：
 *   // 1) 帧率无关跟随（相机、UI 数值、音量渐变、hint 淡入……一律用它）
 *   camX = SM.approach(camX, targetX, 8, dt);
 *   // 2) 屏幕抖动： trauma 累加，trauma² 输出，必然自己归零
 *   var shake = new SM.Shake({ maxOffset: 10, scale: 0.6 });  // 禅意向请把 scale 调小
 *   shake.add(0.35);                  // 事件触发，取挡位表里的值
 *   shake.update(dt);
 *   ctx.save(); ctx.translate(shake.offsetX, shake.offsetY); ctx.rotate(shake.roll);
 *   ...画世界...
 *   ctx.restore();
 *   // 3) 缓动曲线
 *   var k = SM.ease.backOut(t);       // t ∈ [0,1]
 *
 * ---------------------------------------------------------------------------
 * ★ 核心公式只有一个，它同时是这三种东西：
 *
 *      x += (target - x) · (1 - e^(-rate·dt))
 *
 *   ① 相机平滑跟随（camera-systems）：rate ≈ 5..12
 *   ② 本仓库 frost-wipe.js 的雾气回涨：rate = 1/tau，tau = 2..8 秒
 *   ③ 空气阻力 / 速度衰减（physics-tuning）：同样的一阶衰减
 *
 *   它们是同一个一阶线性系统的解析解。区别在于**rate 的量纲是 1/秒**，
 *   所以它是帧率无关的；而 `x += (target-x)*0.1` 里的 0.1 量纲是「每帧」，
 *   在 30fps 下会比 144fps 慢 4.8 倍 —— 同一个游戏在不同机器上手感不同。
 *
 *   经验换算：想要「每帧 0.1 @60fps」的手感，用 rate = -ln(1-0.1)·60 ≈ 6.3
 * ---------------------------------------------------------------------------
 *
 * 禅意向适配（重要）：这份技法来自商业动作游戏的爽感语境，直接照搬会毁掉
 * 留白调性。建议只取 small 挡位，或干脆用 overshoot 弹性替代震动 ——
 * 「有呼吸」和「被打了一拳」是两件事。详细打折建议见 tech/juice-and-feel。
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else if (typeof define === 'function' && define.amd) define(factory);
  else root.SM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAU = Math.PI * 2;

  // ==========================================================================
  // 1. 帧率无关逼近
  // ==========================================================================

  /**
   * 把 cur 朝 target 挪一点，使得任意帧率下"每秒靠近的比例"恒定。
   * @param {number} cur    当前值
   * @param {number} target 目标值
   * @param {number} rate   收敛速率，单位 1/秒。越大越跟手。5..12 是常用区间
   * @param {number} dt     距上一帧的真实秒数
   * @returns {number} 新值
   */
  function approach(cur, target, rate, dt) {
    if (!(dt > 0)) return cur;
    return cur + (target - cur) * (1 - Math.exp(-rate * dt));
  }

  /**
   * 用「半衰期」说话的版本 —— 更好向非程序同事解释。
   * @param {number} halfLife 差距减半所需秒数。0.1 秒 ≈ 跟手，0.5 秒 ≈ 飘
   */
  function approachHalf(cur, target, halfLife, dt) {
    if (!(dt > 0) || !(halfLife > 0)) return cur;
    return cur + (target - cur) * (1 - Math.pow(2, -dt / halfLife));
  }

  /**
   * 无 Math.exp 的快速版。
   * 用的是 e^-k 的二阶 Padé 近似 1/(1+k+k²/2)：
   *   k 小时与精确解一致；k 大时单调趋于 0，即 t → 1，永不越过目标。
   *   **实测**（_vsmooth.cjs 穷举得到，不是估的）：
   *     全域最大误差 0.069 @ rate·dt ≈ 2.6
   *     实用区间 rate·dt ≤ 0.5 内最大误差 0.0088
   *     典型工作点 rate=8 @60fps 误差 3.1e-4（肉眼完全无差）
   *   （对比：一阶版 k/(1+k) 在 rate·dt=0.4 处相对偏 13.3%，二阶只有 1.6%。）
   *
   * ⚠️ 但先想清楚你是否需要它：现代引擎里 Math.exp 是一次 CPU 指令级的调用，
   *   几千次/帧完全无压力。**真正的优化不是换公式，而是别重复算** ——
   *   同一帧里 rate 和 dt 都一样，那个插值系数 t 对所有实体是同一个值：
   *     var t = 1 - Math.exp(-rate * dt);            // 每帧算一次
   *     for (...) x[i] += (target[i] - x[i]) * t;    // 循环里只做乘加
   *   这才是把 N 次 exp 降成 1 次。换公式省的是常数，这个是改数量级。
   */
  function approachFast(cur, target, rate, dt) {
    if (!(dt > 0)) return cur;
    var k = rate * dt;
    return cur + (target - cur) * (1 - 1 / (1 + k + k * k * 0.5));
  }

  /**
   * 角度版 —— 走最短弧，不绕远路。
   * 直接 approach(2.8, 0.1) 会让朝向从 160° 倒着转 320° 回到 6°，
   * 玩家看到的是"敌人突然开始大风车"。追朝向必须用这个。
   * @param {number} cur,target 弧度
   */
  function approachAngle(cur, target, rate, dt) {
    if (!(dt > 0)) return cur;
    var d = ((target - cur + Math.PI) % TAU + TAU) % TAU - Math.PI; // 归一到 (-π, π]
    return cur + d * (1 - Math.exp(-rate * dt));
  }

  /**
   * 二维版 —— 一次求两个分量，省一次 exp。
   * @returns {Array} [x, y]，复用 out 数组可避免每帧分配（见 Out pool 注释）
   */
  function approach2(curX, curY, tgtX, tgtY, rate, dt, out) {
    if (!(dt > 0)) { if (out) { out[0] = curX; out[1] = curY; return out; } return [curX, curY]; }
    var t = 1 - Math.exp(-rate * dt);
    if (out) { out[0] = curX + (tgtX - curX) * t; out[1] = curY + (tgtY - curY) * t; return out; }
    return [curX + (tgtX - curX) * t, curY + (tgtY - curY) * t];
  }

  // ==========================================================================
  // 2. 缓动曲线
  // ==========================================================================
  // 全部接收 t ∈ [0,1]，返回 eased ∈ [0,1] 附近（back/elastic 会冲出边界，
  // 这正是它们要的效果）。分类依据是"该用在什么场合"，抄自 feedback-recipes。

  var ease = {
    linear: function (t) { return t; },

    /** 减速停下 —— 万物WEEN 的默认答案，"到达并静止"用它 */
    cubicOut: function (t) { t = 1 - t; return 1 - t * t * t; },
    quadOut: function (t) { return 1 - (1 - t) * (1 - t); },

    /** 预备 —— 大动作前的蓄力，慢起 */
    cubicIn: function (t) { return t * t * t; },

    /** 两端都缓 —— 相机位移、菜单滑入 */
    sineInOut: function (t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); },

    /** 过冲回弹 —— UI 元素 pop 出来。比 cubicOut 多一点"存在感" */
    backOut: function (t, s) {
      s = s === undefined ? 1.70158 : s;
      t = t - 1;
      return 1 + (s + 1) * t * t * t + s * t * t;
    },

    /** 弹性 —— 更有卡通味，慎用；禅意向建议优先 backOut，elastic 太跳 */
    elasticOut: function (t) {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
    },

    /** 落地弹两下 —— 有重量感的着地 */
    bounceOut: function (t) {
      if (t < 1 / 2.75) return 7.5625 * t * t;
      if (t < 2 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
      if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
      t -= 2.625 / 2.75; return 7.5625 * t * t + 0.984375;
    }
  };

  // ==========================================================================
  // 3. 屏幕抖动（trauma 模型）
  // ==========================================================================
  // 原实现用了常量频率 11/23 Hz。这里改成三档分层正弦，并把 roll 单独降频：
  //   · 位移用高频（"碎"），旋转用低频（"摇"）—— 旋转跟着一起抖会像信号不良
  //   · 三个频率互不通约，相位循环周期极长，不会出现肉眼可见的重复节
  //
  // ★ 绝对不要在每帧调 Math.random() 当抖动源：那不是抖动，是静电噪音。
  //   跟 codex/bayer-dither.js 里"Bayer 有序抖动优于随机噪点"是同一条原则 ——
  //   **要能被眼睛融掉的空间/时间颗粒，就得用确定性序列。**

  function _noise(t, seed) {
    return 0.55 * Math.sin(t * 18.0 + seed) +
           0.30 * Math.sin(t * 31.0 + seed * 2.0) +
           0.15 * Math.sin(t * 47.0 + seed * 3.0);
  }

  function _noiseSlow(t, seed) {
    return Math.sin(t * 7.0 + seed) * 0.7 + Math.sin(t * 13.0 + seed * 2.0) * 0.3;
  }

  /**
   * @param {object} opts
   *   maxOffset 最大位移 px。桌面 8..16 手感明显；**禅意向建议 3..6**
   *   maxRoll   最大旋转 rad。原推荐 0.05..0.12；禅意向建议 0.01..0.03
   *   decay     trauma 每秒衰减量，1.0..1.5。越大收得越快
   *   scale     总强度乘数 0..1。**无障碍开关接这里**，默认 0.8 而非 1.0
   */
  function Shake(opts) {
    opts = opts || {};
    this.maxOffset = num(opts.maxOffset, 10);
    this.maxRoll = num(opts.maxRoll, 0.06);
    this.decay = num(opts.decay, 1.2);
    this.scale = num(opts.scale, 0.8);
    this._trauma = 0;
    this._t = 0;
    this.offsetX = 0;
    this.offsetY = 0;
    this.roll = 0;
  }

  /**
   * 事件触发。**是累加不是赋值** —— 连续小命中会叠出一次大震，这正是想要的。
   * @param {number} amount 挡位：small 0.10-0.20 / medium 0.30-0.50 / large 0.70-1.00
   */
  Shake.prototype.add = function (amount) {
    this._trauma = Math.min(1, this._trauma + amount);
  };

  Shake.prototype.update = function (dt) {
    this._t += dt;
    if (this._trauma > 0) {
      this._trauma -= this.decay * dt;
      if (this._trauma < 0) this._trauma = 0;
    }
    // ★ 核心：输出是 trauma 的平方。小事件几乎不动，大事件才有 punch。
    var s = this._trauma * this._trauma * this.scale;
    if (s <= 0.0001) { this.offsetX = this.offsetY = this.roll = 0; return; }
    this.offsetX = this.maxOffset * s * _noise(this._t, 0);
    this.offsetY = this.maxOffset * s * _noise(this._t, 137.13);
    this.roll = this.maxRoll * s * _noiseSlow(this._t, 271.77);
  };

  /**
   * 直接把抖动套到 ctx 上。**前提是它叠在相机平滑之后**，不能参与相机的
   * 平滑目标计算 —— 否则平滑会试图"追上"抖动，两者互相拉扯，画面发糊。
   */
  Shake.prototype.apply = function (ctx) {
    if (this.offsetX === 0 && this.offsetY === 0 && this.roll === 0) return;
    ctx.translate(this.offsetX, this.offsetY);
    if (this.roll !== 0) ctx.rotate(this.roll);
  };

  Shake.prototype.reset = function () {
    this._trauma = 0; this.offsetX = this.offsetY = this.roll = 0;
  };

  // ==========================================================================
  // 4. 命中停顿（hit-stop）
  // ==========================================================================
  // ⚠️ 致命坑：必须喂**真实时间**。
  //   如果主循环用 timeScale 缩放后的 dt 来走 hit-stop 的倒计时，
  //   timeScale=0 时倒计时自己也停了 → 永远出不来 → 游戏卡死。
  //   引擎里的同类事故是 WaitForSeconds 在 timeScale=0 下永不唤醒。
  //   Canvas 2D 里正确做法是记录 performance.now() 差值，绝不用累加的 dt。

  function HitStop() {
    this._left = 0;
  }

  /** @param {number} dur 秒。small 不用 / medium 0.04-0.06 / large 0.10-0.15 */
  HitStop.prototype.trigger = function (dur) {
    if (dur > this._left) this._left = dur;
  };

  /**
   * @param {number} realDt **真实**秒数（未乘 timeScale）
   * @returns {number} 时间流速：0 = 冻结，1 = 正常
   */
  HitStop.prototype.tick = function (realDt) {
    if (this._left <= 0) return 1;
    this._left -= realDt;
    return 0;
  };

  HitStop.prototype.active = function () { return this._left > 0; };

  // ==========================================================================

  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }

  var API = {
    approach: approach,
    approachHalf: approachHalf,
    approachFast: approachFast,
    approachAngle: approachAngle,
    approach2: approach2,
    ease: ease,
    Shake: Shake,
    HitStop: HitStop,
    _noise: _noise
  };

  return API;
});
