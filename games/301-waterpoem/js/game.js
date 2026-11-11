/* 301《合字 · 水诗》逻辑层 —— 零 DOM 零 Canvas，纯逻辑，供 Node 冒烟 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WP301 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ============ 常量 ============
  var W = 900, H = 620, PAD = 16;
  var POOL = { x0: PAD, y0: PAD, x1: W - PAD, y1: H - PAD };

  var C = {
    R_RAD: 26,          // 偏旁木牌半径
    SWIM_R: 15,         // 泳者半径
    ACC: 960,           // 泳者加速度
    S_DAMP: 3.4,        // 泳者水阻
    V_MAX: 340,
    // 尾流推力：字块顺着泳者的前进方向被带走（不是背离泳者）
    PUSH_FRONT: 128,    // 泳者前方作用距离
    PUSH_BACK: 70,      // 身后尾流长度（掠过之后还在推）
    PUSH_W: 72,         // 尾流侧向半宽
    PUSH_K: 4.6,        // 推力系数（严格乘 |v| → 静止不推 = noop 恒 0 的物理保证）
    R_DAMP: 2.1,        // 偏旁阻尼
    C_MASS: 3.4,        // 已成字质量（更沉）
    C_DAMP: 3.8,        // 已成字阻尼（更粘）
    COLL: 52,           // 接触判定 = 2*R_RAD
    SNAP_R: 84,         // 合法对互相吸附半径
    SNAP_A: 320,        // 吸附加速度
    WALL: 0.55,         // 池壁反弹系数
    PAD_DRAG: 0.10,     // 泳者进入荷叶的减速（每帧比例）
    QI_MAX: 100,
    QI_COST: 3.4,       // 连续划水 ≈ 29s 见底
    QI_REGEN: 12.0,     // 浮着换气 ≈ 8s 回满 → 占空比约 4:1，调度而非卡死
    QI_FLOOR: 0.16,     // 气尽软兜底（不完全锁死）
    QI_WORD: 9,         // 成字回气（充电宝）
    QI_BONUS: 5,
    PT_WORD: 120,
    PT_BONUS: 45,
    PT_CLEAR: 260,
    PT_QI: 300,
    PT_TIME: 240,
    SPLIT_GAP: 56,       // 拆回后两块的半距：2×56=112 必须 > SNAP_R(84)，否则立刻又吸回去
    SPLIT_COOL: 0.5      // 拆回后短暂禁止再次合并
  };

  // ============ 字库：每 3 字一组 = 左部件 + 右部件 + 合成字 ============
  var DICT_SRC = ('日生星,火丁灯,氵也池,木公松,氵工江,禾火秋,日寸时,氵皮波,木木林,火山灿,氵少沙,女马妈,'
    + '氵木沐,木目相,木寸村,木乔桥,日月明,亻木休,亻言信,女子好,禾口和,禾中种,禾少秒,氵可河,氵胡湖,'
    + '氵青清,氵羊洋,氵目泪,氵干汗,火土灶,火少炒,火户炉,口丁叮,口牙呀,口马吗,口巴吧,口十叶,口力加,'
    + '女口如,女少妙,女古姑,女且姐,女未妹,亻山仙,亻半伴,亻门们,亻寸付,亻中仲,亻火伙,亻子仔,亻也他,'
    + '木圭桂,木白柏,木反板,木兆桃,木卯柳,木华桦,木由柚,虫工虹,虫马蚂,虫圭蛙,虫下虾,虫它蛇,虫文蚊,'
    + '石马码,石少砂,石开研,石皮破,石欠砍,纟工红,纟少纱,纟氏纸,纟只织,纟田细,纟且组,钅丁钉,钅中钟,'
    + '钅失铁,钅同铜,钅艮银,鱼羊鲜,鱼里鲤,鱼尤鱿,鱼包鲍,贝才财,贝反贩,王元玩,王朱珠,王见现,王求球,'
    + '王里理,土也地,土不坏,土止址,土皮坡,讠吾语,讠寺诗,讠司词,讠舌话,木子李,田力男,立日音,山风岚');

  var DICT = Object.create(null);      // 'a|b' -> ch
  var BY_CH = Object.create(null);     // ch -> {a,b}
  DICT_SRC.split(',').forEach(function (s) {
    if (s.length !== 3) return;
    var a = s[0], b = s[1], ch = s[2];
    DICT[a + '|' + b] = ch;
    if (!BY_CH[ch]) BY_CH[ch] = { a: a, b: b };
  });

  function lookup(x, y) {
    if (!DICT[x + '|' + y]) return null;
    return { ch: DICT[x + '|' + y], a: x, b: y };
  }
  // 左右顺序宽容：谁在左谁在右由字库定
  function pairOf(x, y) {
    return lookup(x, y) || lookup(y, x);
  }

  // ============ 关卡表 ============
  var LEVELS = [
    { name: '夜泳', words: ['星', '灯', '池'], decoys: [], pads: 0, qi: 100, tmax: 95 },
    { name: '江上', words: ['松', '江', '秋', '时'], decoys: [], pads: 0, qi: 100, tmax: 108 },
    { name: '水边', words: ['波', '林', '灿', '地'], decoys: [], pads: 1, qi: 98, tmax: 118 },
    { name: '人家', words: ['妈', '灯', '池', '松', '和'], decoys: ['少'], pads: 1, qi: 95, tmax: 140 },
    { name: '田野', words: ['种', '沐', '好', '灿', '叶'], decoys: ['马', '少'], pads: 2, qi: 92, tmax: 150 },
    { name: '夜色', words: ['星', '灯', '池', '松', '秋', '妈'], decoys: ['寸'], pads: 2, qi: 90, tmax: 175 },
    { name: '远行', words: ['桥', '江', '时', '如', '仙', '炒'], decoys: ['也', '马'], pads: 3, qi: 88, tmax: 185 },
    { name: '归处', words: ['明', '好', '河', '秋', '桂', '语'], decoys: ['也', '寸', '口'], pads: 4, qi: 85, tmax: 200 }
  ];

  // 三星阈值（由 AI 实测回填）
  var STAR = [
    [198, 539, 766], [264, 574, 817], [264, 518, 738], [330, 491, 698],
    [330, 591, 841], [396, 555, 790], [396, 551, 784], [396, 606, 862]
  ];

  function makeRng(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // ============ 关卡生成（固定种子可复盘） ============
  function genLevel(li, seed) {
    var L = LEVELS[li];
    var rng = makeRng(seed);
    var need = [];
    L.words.forEach(function (ch) {
      var e = BY_CH[ch];
      if (!e) throw new Error('字库缺字: ' + ch);
      need.push(e.a, e.b);
    });
    var glyphs = need.concat(L.decoys);

    // 荷叶
    var pads = [];
    for (var i = 0; i < L.pads; i++) {
      var p = null;
      for (var tr = 0; tr < 500; tr++) {
        var r = 32 + rng() * 20;
        var cand = {
          x: POOL.x0 + r + 26 + rng() * (POOL.x1 - POOL.x0 - 2 * r - 52),
          y: POOL.y0 + r + 26 + rng() * (POOL.y1 - POOL.y0 - 2 * r - 52),
          r: r
        };
        var ok = true;
        for (var k = 0; k < pads.length; k++) {
          if (Math.hypot(pads[k].x - cand.x, pads[k].y - cand.y) < pads[k].r + cand.r + 52) { ok = false; break; }
        }
        if (ok) { p = cand; break; }
      }
      if (p) pads.push(p);
    }

    // 泳者起点：离荷叶尽量远
    var sx = (POOL.x0 + POOL.x1) / 2, sy = POOL.y1 - 74;
    for (var t2 = 0; t2 < 300; t2++) {
      var cx = POOL.x0 + 70 + rng() * (POOL.x1 - POOL.x0 - 140);
      var cy = POOL.y0 + 70 + rng() * (POOL.y1 - POOL.y0 - 140);
      var near = false;
      for (var k2 = 0; k2 < pads.length; k2++) {
        if (Math.hypot(pads[k2].x - cx, pads[k2].y - cy) < pads[k2].r + 74) { near = true; break; }
      }
      if (!near) { sx = cx; sy = cy; break; }
    }

    // 部件撒点：互相不重叠、不压荷叶、离起点远
    // 硬约束：任何「能组成字」的一对，初始间距必须 > SNAP_R + 34
    //         —— 否则不操作也会自动吸合成字（noop 拿分 = 违反铁律）
    var parts = [];
    var R = C.R_RAD;
    var SAFE = C.SNAP_R + 34;
    for (var gi = 0; gi < glyphs.length; gi++) {
      var pos = null, bestPos = null, bestScore = -1;
      for (var tr2 = 0; tr2 < 1400; tr2++) {
        var x = POOL.x0 + R + 6 + rng() * (POOL.x1 - POOL.x0 - 2 * R - 12);
        var y = POOL.y0 + R + 6 + rng() * (POOL.y1 - POOL.y0 - 2 * R - 12);
        var good = true, worst = 1e9;
        for (var k3 = 0; k3 < pads.length; k3++) {
          if (Math.hypot(pads[k3].x - x, pads[k3].y - y) < pads[k3].r + R + 12) { good = false; break; }
        }
        if (good) for (var k4 = 0; k4 < parts.length; k4++) {
          var dd = Math.hypot(parts[k4].x - x, parts[k4].y - y);
          var legal = pairOf(glyphs[gi], parts[k4].g);
          if (legal) {
            worst = Math.min(worst, dd);
            if (dd < SAFE || dd > 430) { good = false; break; }   // 太近自动吸合 / 太远推不动
          } else if (dd < 2.5 * R) { good = false; break; }
        }
        if (good && Math.hypot(x - sx, y - sy) < 150) good = false;
        if (good) { pos = { x: x, y: y }; break; }
        // 记一个"最接近合格"的兜底
        if (worst > bestScore) { bestScore = worst; bestPos = { x: x, y: y }; }
      }
      if (!pos) pos = bestPos || {
        x: clamp(POOL.x0 + R + 6 + rng() * (POOL.x1 - POOL.x0 - 2 * R - 12), POOL.x0 + R + 6, POOL.x1 - R - 6),
        y: clamp(POOL.y0 + R + 6 + rng() * (POOL.y1 - POOL.y0 - 2 * R - 12), POOL.y0 + R + 6, POOL.y1 - R - 6)
      };
      parts.push({ id: parts.length, g: glyphs[gi], x: pos.x, y: pos.y, vx: 0, vy: 0, dead: false, inWord: -1, wake: 0, cool: 0 });
    }
    return { parts: parts, pads: pads, sx: sx, sy: sy, words: L.words.slice(), decoys: L.decoys.slice() };
  }

  // ============ 状态 ============
  function createGame() {
    var st = {
      li: 0, seed: 1, t: 0, over: false, win: false,
      phase: 'idle',            // idle | play | done
      swim: { x: 450, y: 500, vx: 0, vy: 0, ang: -Math.PI / 2, stroke: 0 },
      parts: [], pads: [], chars: [],
      words: [], done: [],      // done[i] = 第 i 个目标字是否已成
      bonus: [],                // 意外之字
      qi: 100, qiMax: 100, tmax: 80, tLeft: 80,
      score: 0, finalScore: 0,
      events: [], splits: 0, merges: 0, bumps: 0,
      input: { x: 0, y: 0 },
      target: null,             // 点击导航目标
      aiKind: null, aiT: 0, aiDir: { x: 1, y: 0 }
    };
    return st;
  }

  function start(st, li, seed) {
    st.li = li; st.seed = seed;
    var g = genLevel(li, seed);
    st.parts = g.parts; st.pads = g.pads;
    st.swim.x = g.sx; st.swim.y = g.sy; st.swim.vx = 0; st.swim.vy = 0; st.swim.ang = -Math.PI / 2; st.swim.stroke = 0;
    st.chars = [];
    st.words = g.words.slice();
    st.done = st.words.map(function () { return false; });
    st.bonus = [];
    st.qiMax = LEVELS[li].qi; st.qi = st.qiMax;
    st.tmax = LEVELS[li].tmax; st.tLeft = st.tmax;
    st.t = 0; st.over = false; st.win = false; st.phase = 'play';
    st.score = 0; st.finalScore = 0;
    st.events = []; st.splits = 0; st.merges = 0; st.bumps = 0;
    st.input.x = 0; st.input.y = 0; st.target = null;
    st.aiT = 0; st.aiCharge = 0; st.aiState = 0;
    return st;
  }

  function setInput(st, ax, ay) {
    var m = Math.hypot(ax, ay);
    if (m > 1) { ax /= m; ay /= m; }
    st.input.x = ax; st.input.y = ay;
  }

  function ev(st, e) { st.events.push(e); }

  // ============ 撤销：拆回（免费 · 试菜） ============
  function splitChar(st, ci) {
    if (st.over || !st.chars[ci]) return false;
    var ch = st.chars[ci];
    var nx = Math.cos(ch.ang || 0), ny = Math.sin(ch.ang || 0);
    if (!nx && !ny) { nx = 1; ny = 0; }
    var LX = POOL.x0 + C.R_RAD + 2, HX = POOL.x1 - C.R_RAD - 2;
    var LY = POOL.y0 + C.R_RAD + 2, HY = POOL.y1 - C.R_RAD - 2;
    function sepOf(ax, ay) {
      var p1 = { x: clamp(ch.x - ax * C.SPLIT_GAP, LX, HX), y: clamp(ch.y - ay * C.SPLIT_GAP, LY, HY) };
      var p2 = { x: clamp(ch.x + ax * C.SPLIT_GAP, LX, HX), y: clamp(ch.y + ay * C.SPLIT_GAP, LY, HY) };
      return { p1: p1, p2: p2, d: Math.hypot(p2.x - p1.x, p2.y - p1.y) };
    }
    // 主轴被池壁挤住时改用垂直轴，保证拆开后不会再被吸回去
    var best = sepOf(nx, ny);
    if (best.d < C.SNAP_R + 16) {
      var alt = sepOf(-ny, nx);
      if (alt.d > best.d) best = alt;
    }
    function mk(g, p, ox, oy) {
      st.parts.push({
        id: st.parts.length, g: g, x: p.x, y: p.y,
        vx: ox * 2.4, vy: oy * 2.4, dead: false, inWord: -1, cool: C.SPLIT_COOL, wake: 0
      });
    }
    mk(ch.a, best.p1, best.p1.x - ch.x, best.p1.y - ch.y);
    mk(ch.b, best.p2, best.p2.x - ch.x, best.p2.y - ch.y);
    st.chars.splice(ci, 1);
    st.splits++;
    if (!ch.bonus) {
      var wi = st.words.indexOf(ch.ch);
      if (wi >= 0) st.done[wi] = false;
    } else {
      var bi = st.bonus.indexOf(ch.ch);
      if (bi >= 0) st.bonus.splice(bi, 1);
    }
    st.score = Math.max(0, st.score - (ch.bonus ? C.PT_BONUS : C.PT_WORD));
    ev(st, { t: 'split', x: ch.x, y: ch.y, ch: ch.ch });
    return true;
  }

  // ============ 主更新 ============
  function update(st, dt) {
    if (!isFinite(dt) || dt <= 0) dt = 0;
    if (dt > 0.05) dt = 0.05;
    if (st.phase !== 'play' || st.over) return st;

    st.t += dt;
    st.tLeft = Math.max(0, st.tLeft - dt);

    var sw = st.swim;
    var ix = st.input.x, iy = st.input.y;

    // 点击/触摸导航
    if (st.target) {
      var dx = st.target.x - sw.x, dy = st.target.y - sw.y;
      var dd = Math.hypot(dx, dy);
      if (dd < 12) st.target = null;
      else { ix = dx / dd; iy = dy / dd; }
    }

    // 气：划水消耗、静止回复
    var load = Math.hypot(ix, iy);
    if (load > 0.05) {
      st.qi = Math.max(0, st.qi - C.QI_COST * load * dt);
    } else {
      st.qi = Math.min(st.qiMax, st.qi + C.QI_REGEN * dt);
    }
    var accScale = st.qi <= 0.5 ? C.QI_FLOOR : 1;

    // 泳者
    sw.vx += ix * C.ACC * accScale * dt;
    sw.vy += iy * C.ACC * accScale * dt;
    var damp = Math.pow(0.001, dt * (C.S_DAMP / 6.9));  // 与 dt 无关的指数阻尼
    sw.vx *= damp; sw.vy *= damp;
    // 荷叶减速（泳者可以扒开荷叶游过，但很费劲）
    for (var pi = 0; pi < st.pads.length; pi++) {
      var pd = st.pads[pi];
      if (Math.hypot(pd.x - sw.x, pd.y - sw.y) < pd.r + C.SWIM_R) {
        var k = Math.pow(1 - C.PAD_DRAG, dt * 60);
        sw.vx *= k; sw.vy *= k;
      }
    }
    var sp = Math.hypot(sw.vx, sw.vy);
    if (sp > C.V_MAX) { sw.vx = sw.vx / sp * C.V_MAX; sw.vy = sw.vy / sp * C.V_MAX; sp = C.V_MAX; }
    sw.x += sw.vx * dt; sw.y += sw.vy * dt;
    if (sp > 12) { sw.ang = Math.atan2(sw.vy, sw.vx); sw.stroke += dt * (2.2 + sp / 90); }
    if (sw.x < POOL.x0 + C.SWIM_R) { sw.x = POOL.x0 + C.SWIM_R; sw.vx = Math.abs(sw.vx) * C.WALL; }
    if (sw.x > POOL.x1 - C.SWIM_R) { sw.x = POOL.x1 - C.SWIM_R; sw.vx = -Math.abs(sw.vx) * C.WALL; }
    if (sw.y < POOL.y0 + C.SWIM_R) { sw.y = POOL.y0 + C.SWIM_R; sw.vy = Math.abs(sw.vy) * C.WALL; }
    if (sw.y > POOL.y1 - C.SWIM_R) { sw.y = POOL.y1 - C.SWIM_R; sw.vy = -Math.abs(sw.vy) * C.WALL; }

    // 物体（松散部件 + 已成字）统一积流体
    var bodies = [];
    for (var i = 0; i < st.parts.length; i++) if (!st.parts[i].dead) bodies.push(st.parts[i]);
    for (var j = 0; j < st.chars.length; j++) bodies.push(st.chars[j]);

    for (var b = 0; b < bodies.length; b++) {
      var o = bodies[b];
      var isChar = (o.a !== undefined);
      if (o.cool > 0) o.cool -= dt;
      var mass = isChar ? C.C_MASS : 1;
      var dmp = isChar ? C.C_DAMP : C.R_DAMP;

      // 尾流推力：沿泳者速度方向拖带；严格 ∝ |v|（静止不推 = noop 恒 0 的物理保证）
      if (sp > 1) {
        var vhx = sw.vx / sp, vhy = sw.vy / sp;
        var rx = o.x - sw.x, ry = o.y - sw.y;
        var along = rx * vhx + ry * vhy;              // 沿游向的投影
        var lx = rx - along * vhx, ly = ry - along * vhy;
        var lateral = Math.hypot(lx, ly);
        if (lateral < C.PUSH_W) {
          var lat = 1 - lateral / C.PUSH_W;
          var lon = along >= 0
            ? Math.max(0, 1 - along / C.PUSH_FRONT)
            : Math.max(0, 1 + along / C.PUSH_BACK);
          if (lon > 0) {
            var f = C.PUSH_K * sp * lat * lon / mass;
            o.vx += vhx * f * dt;
            o.vy += vhy * f * dt;
            o.wake = Math.max(o.wake || 0, lat * lon);
          }
        }
      }

      // 阻尼（与 dt 无关）
      var dk = Math.pow(0.001, dt * (dmp / 6.9));
      o.vx *= dk; o.vy *= dk;

      o.x += o.vx * dt; o.y += o.vy * dt;

      // 荷叶：偏旁弹开（荷叶是字块的围栏，不是人的墙）
      for (var q = 0; q < st.pads.length; q++) {
        var pp = st.pads[q];
        var ex = o.x - pp.x, ey = o.y - pp.y;
        var ed = Math.hypot(ex, ey) || 0.001;
        var min = pp.r + C.R_RAD;
        if (ed < min) {
          var ux = ex / ed, uy = ey / ed;
          o.x = pp.x + ux * min; o.y = pp.y + uy * min;
          var vn = o.vx * ux + o.vy * uy;
          if (vn < 0) { o.vx -= vn * ux * 1.5; o.vy -= vn * uy * 1.5; st.bumps++; }
        }
      }

      // 池壁
      if (o.x < POOL.x0 + C.R_RAD) { o.x = POOL.x0 + C.R_RAD; o.vx = Math.abs(o.vx) * C.WALL; }
      if (o.x > POOL.x1 - C.R_RAD) { o.x = POOL.x1 - C.R_RAD; o.vx = -Math.abs(o.vx) * C.WALL; }
      if (o.y < POOL.y0 + C.R_RAD) { o.y = POOL.y0 + C.R_RAD; o.vy = Math.abs(o.vy) * C.WALL; }
      if (o.y > POOL.y1 - C.R_RAD) { o.y = POOL.y1 - C.R_RAD; o.vy = -Math.abs(o.vy) * C.WALL; }
    }

    // 合法对互相吸附 + 合并判定
    var alive = st.parts.filter(function (p) { return !p.dead; });
    for (var m = 0; m < alive.length; m++) {
      for (var n = m + 1; n < alive.length; n++) {
        var A = alive[m], B = alive[n];
        if (A.dead || B.dead) continue;
        if (A.cool > 0 || B.cool > 0) continue;   // 刚拆开的先缓一缓，别马上又黏回去
        var dx2 = B.x - A.x, dy2 = B.y - A.y;
        var dist = Math.hypot(dx2, dy2) || 0.001;
        var pr = pairOf(A.g, B.g);
        if (pr && dist < C.SNAP_R && dist > 0.5) {
          // 吸附
          var pull = C.SNAP_A * (1 - dist / C.SNAP_R);
          var ux2 = dx2 / dist, uy2 = dy2 / dist;
          A.vx += ux2 * pull * dt; A.vy += uy2 * pull * dt;
          B.vx -= ux2 * pull * dt; B.vy -= uy2 * pull * dt;
        }
        if (dist < C.COLL) {
          if (pr) { doMerge(st, A, B, pr); }
          else {
            // 非法组合：弹性弹开
            var ov = (C.COLL - dist) / 2 + 0.5;
            var nx2 = dx2 / dist, ny2 = dy2 / dist;
            A.x -= nx2 * ov; A.y -= ny2 * ov;
            B.x += nx2 * ov; B.y += ny2 * ov;
            var rel = (B.vx - A.vx) * nx2 + (B.vy - A.vy) * ny2;
            if (rel < 0) {
              A.vx += rel * nx2 * 0.6; A.vy += rel * ny2 * 0.6;
              B.vx -= rel * nx2 * 0.6; B.vy -= rel * ny2 * 0.6;
              st.bumps++;
              ev(st, { t: 'bump', x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
            }
          }
        }
      }
    }

    // 已成字之间 / 成字与部件：只做软分离，不合并
    var all = bodies;
    for (var s1 = 0; s1 < all.length; s1++) {
      for (var s2 = s1 + 1; s2 < all.length; s2++) {
        var P = all[s1], Q = all[s2];
        var isCA = (P.a !== undefined), isCB = (Q.a !== undefined);
        if (!isCA && !isCB) continue;   // 部件之间已在上面处理
        var gx = Q.x - P.x, gy = Q.y - P.y;
        var gd = Math.hypot(gx, gy) || 0.001;
        if (gd < C.COLL) {
          var ovq = (C.COLL - gd) / 2 + 0.5;
          var vx2 = gx / gd, vy2 = gy / gd;
          P.x -= vx2 * ovq; P.y -= vy2 * ovq;
          Q.x += vx2 * ovq; Q.y += vy2 * ovq;
        }
      }
    }

    // 胜负
    var allDone = st.done.every(function (d) { return d; });
    if (allDone) {
      st.win = true;
      st.score = calcScore(st);      // 先置 win 再算分
      st.finalScore = st.score;
      st.over = true; st.phase = 'done';
      ev(st, { t: 'win' });
    } else if (st.tLeft <= 0) {
      st.win = false;
      st.finalScore = calcScore(st);
      st.score = st.finalScore;
      st.over = true; st.phase = 'done';
      ev(st, { t: 'timeup' });
    }
    return st;
  }

  function doMerge(st, A, B, pr) {
    A.dead = true; B.dead = true;
    var ci = st.chars.length;
    A.inWord = ci; B.inWord = ci;
    var isTarget = false;
    var wi = st.words.indexOf(pr.ch);
    if (wi >= 0 && !st.done[wi]) { st.done[wi] = true; isTarget = true; }
    var bonus = !isTarget;
    if (bonus && st.bonus.indexOf(pr.ch) < 0) st.bonus.push(pr.ch);
    st.chars.push({
      id: ci, ch: pr.ch, a: pr.a, b: pr.b,
      x: (A.x + B.x) / 2, y: (A.y + B.y) / 2,
      vx: (A.vx + B.vx) / 4, vy: (A.vy + B.vy) / 4,
      ang: Math.atan2(B.y - A.y, B.x - A.x) || 0,
      born: st.t, bonus: bonus
    });
    st.merges++;
    st.score += isTarget ? C.PT_WORD : C.PT_BONUS;
    st.qi = Math.min(st.qiMax, st.qi + (isTarget ? C.QI_WORD : C.QI_BONUS));
    ev(st, {
      t: 'merge', ch: pr.ch, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2,
      bonus: bonus, idx: isTarget ? wi : -1
    });
    // 清掉 dead 部件，保持数组整洁
    st.parts = st.parts.filter(function (p) { return !p.dead; });
  }

  function calcScore(st) {
    var s = 0;
    var nDone = st.done.filter(function (d) { return d; }).length;
    s += nDone * C.PT_WORD;
    s += st.bonus.length * C.PT_BONUS;
    if (st.win) {
      s += C.PT_CLEAR;
      s += C.PT_QI * (st.qi / st.qiMax);
      s += C.PT_TIME * (st.tLeft / st.tmax);
    }
    return Math.round(s);
  }
  function score(st) { return st.over ? st.finalScore : calcScore(st); }
  function stars(st, li) {
    var sc = st.over ? st.finalScore : calcScore(st);
    var th = STAR[li] || STAR[0];
    var n = 0;
    for (var i = 0; i < 3; i++) if (sc >= th[i]) n++;
    return n;
  }

  // ============ AI 对照（供冒烟验证机制必要性） ============
  function aiInput(st, kind) {
    var sw = st.swim;
    if (kind === 'noop') return { x: 0, y: 0 };

    if (kind === 'random') {
      st.aiT -= 1;
      if (st.aiT <= 0) {
        st.aiT = 46;
        st.aiSeed = ((st.aiSeed || 20260913) * 1664525 + 1013904223) >>> 0;
        var a = (st.aiSeed / 4294967296) * Math.PI * 2;
        st.aiDir = { x: Math.cos(a), y: Math.sin(a) };
      }
      return st.aiDir;
    }

    // 挑一个还缺部件的目标字；mid/strong 会挑「最省力」的那一对
    var live = st.parts.filter(function (p) { return !p.dead; });
    if (!live.length) return { x: 0, y: 0 };
    var smart = (kind === 'mid' || kind === 'strong');
    var cand = null, bestCost = Infinity;
    if (smart && (st._rescue = (st._rescue || 0) + 1) % 24 === 0) aiRescue(st);
    for (var i = 0; i < st.words.length; i++) {
      if (st.done[i]) continue;
      var e = BY_CH[st.words[i]];
      var As = [], Bs = [];
      // 注意：同部件字（如 林 = 木 + 木）必须用两个独立 if，不能用 else if
      for (var k = 0; k < live.length; k++) {
        if (live[k].g === e.a) As.push(live[k]);
        if (live[k].g === e.b) Bs.push(live[k]);
      }
      if (!As.length || !Bs.length) continue;
      for (var ia = 0; ia < As.length; ia++) {
        for (var ib = 0; ib < Bs.length; ib++) {
          if (As[ia] === Bs[ib]) continue;
          var cost = Math.hypot(Bs[ib].x - As[ia].x, Bs[ib].y - As[ia].y)
            + (smart ? 0.45 * Math.hypot(As[ia].x - sw.x, As[ia].y - sw.y) : 0);
          if (cost < bestCost) { bestCost = cost; cand = { A: As[ia], B: Bs[ib], e: e }; }
        }
      }
      if (!smart && cand) break;   // naive 不做选择，撞上哪个算哪个
    }
    if (!cand) return { x: 0, y: 0 };

    var dx = cand.B.x - cand.A.x, dy = cand.B.y - cand.A.y;
    var dist = Math.hypot(dx, dy) || 0.001;
    var dirx = dx / dist, diry = dy / dist;

    if (dist < C.COLL + 6) return { x: 0, y: 0 };   // 快贴上了，别再撞散

    if (kind === 'naive') {
      // 只会朝 A 冲（不看站位）→ 站位错时反而把 A 推离 B
      return norm(cand.A.x - sw.x, cand.A.y - sw.y);
    }

    // mid / strong：助跑（绕到 A 的上游）→ 冲刺（顺着 A→B 掠过 A，尾流把 A 带走）
    // 用状态机 + 滞回，避免在临界点上每帧翻转方向导致加速度互相抵消
    var front = (sw.x - cand.A.x) * dirx + (sw.y - cand.A.y) * diry;  // >0 = 已越过 A
    var up = kind === 'strong' ? 104 : 78;
    var aim = { x: cand.A.x - dirx * up, y: cand.A.y - diry * up };
    var tol = kind === 'strong' ? 46 : 84;
    var perp = Math.abs(perpDist(sw, cand.A, dirx, diry));

    if (st.aiCharge > 0) {
      st.aiCharge -= 1;
      if (front > 92) st.aiCharge = 0;                 // 冲过头了，收手
      else {
        var g2 = (dist < C.SNAP_R && kind === 'strong') ? 0.42 : 1;
        return { x: dirx * g2, y: diry * g2 };
      }
    }
    if (st.aiCharge <= 0) {
      if (front < -6 && front > -(up + 170) && perp < tol) {
        st.aiCharge = kind === 'strong' ? 30 : 24;     // 进入冲刺，锁定 0.5s / 0.4s
        return { x: dirx, y: diry };
      }
    }
    return norm(aim.x - sw.x, aim.y - sw.y);
  }
  // 救援：目标字缺件（多半是被「意外之字」吃掉了）→ 拆回一个已成字
  // 这是真实玩家会做的动作（点一下字块就拆开），AI 也必须有，否则死锁
  function aiRescue(st) {
    var live = st.parts.filter(function (p) { return !p.dead; });
    var need = false;
    for (var i = 0; i < st.words.length; i++) {
      if (st.done[i]) continue;
      var e = BY_CH[st.words[i]];
      // 同部件字（林 = 木 + 木）需要 2 个相同部件，同样必须独立计数
      var na = 0, nb = 0;
      for (var k = 0; k < live.length; k++) {
        if (live[k].g === e.a) na++;
        if (live[k].g === e.b) nb++;
      }
      if (e.a === e.b) { if (na < 2) { need = true; break; } }
      else if (!na || !nb) { need = true; break; }
    }
    if (!need) return false;
    for (var c = st.chars.length - 1; c >= 0; c--) {
      if (st.chars[c].bonus) { splitChar(st, c); return true; }
    }
    if (st.chars.length) { splitChar(st, st.chars.length - 1); return true; }
    return false;
  }

  function norm(x, y) { var m = Math.hypot(x, y) || 1; return { x: x / m, y: y / m }; }
  function perpDist(p, A, dx, dy) { return (p.x - A.x) * (-dy) + (p.y - A.y) * dx; }

  // 一步 AI 跑完整关（冒烟用）
  function runAI(li, seed, kind, maxSec) {
    var st = createGame();
    start(st, li, seed);
    maxSec = maxSec || LEVELS[li].tmax + 2;
    var dt = 1 / 60, steps = Math.ceil(maxSec * 60);
    for (var i = 0; i < steps && !st.over; i++) {
      var a = aiInput(st, kind);
      setInput(st, a.x, a.y);
      update(st, dt);
      st.events.length = 0;
    }
    return { score: st.over ? st.finalScore : calcScore(st), win: st.win, words: st.done.filter(Boolean).length };
  }

  return {
    W: W, H: H, POOL: POOL, C: C, DICT: DICT, BY_CH: BY_CH, LEVELS: LEVELS, STAR: STAR,
    lookup: lookup, pairOf: pairOf, makeRng: makeRng, clamp: clamp,
    genLevel: genLevel, createGame: createGame, start: start, setInput: setInput,
    update: update, splitChar: splitChar, score: score, stars: stars, calcScore: calcScore,
    aiInput: aiInput, runAI: runAI
  };
});
