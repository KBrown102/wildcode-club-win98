/* 291-papercollage《拼贴 · 撕纸局》—— 渲染层（只读状态，不写状态；消费 st.events 生成粒子/飘字）
 * 世界用 Canvas：手撕毛边纸片（相邻格共享同一条边的扰动 → 严丝合缝咬合）
 * 界面用 DOM：见 index.html
 */
(function (g) {
  'use strict';

  var W = 480, H = 800;
  var CELL = 52, COLS = 8, ROWS = 9;
  var BX = 32, BY = 152, BW = CELL * COLS, BH = CELL * ROWS;
  var INSET = 1.7, JIT = 2.7;

  // 中国传统色 · 七级纸阶（暖 → 冷 → 墨）
  var PAPER = ['', '#E2B95C', '#D08B45', '#C85A3C', '#A63E58', '#6E4670', '#3E5C8A', '#34353F'];
  var NUM = ['', '一', '二', '三', '四', '五', '六', '七'];
  var BG = '#F5EFE3', TRAY = '#EDE2CF', TRAY2 = '#E4D6BE';

  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function buildEdges() {
    var rnd = mulberry(20260908);
    var he = [], ve = [], r, c;
    for (r = 0; r <= ROWS; r++) { he[r] = []; for (c = 0; c < COLS; c++) he[r][c] = (rnd() * 2 - 1) * JIT; }
    for (r = 0; r < ROWS; r++) { ve[r] = []; for (c = 0; c <= COLS; c++) ve[r][c] = (rnd() * 2 - 1) * JIT; }
    return { he: he, ve: ve };
  }

  function cellPath(pth, c, r, pad, E) {
    var x0 = BX + c * CELL + pad, y0 = BY + r * CELL + pad;
    var x1 = BX + (c + 1) * CELL - pad, y1 = BY + (r + 1) * CELL - pad;
    var mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    pth.moveTo(x0, y0);
    pth.quadraticCurveTo(mx, y0 + 2 * E.he[r][c], x1, y0);
    pth.quadraticCurveTo(x1 + 2 * E.ve[r][c + 1], my, x1, y1);
    pth.quadraticCurveTo(mx, y1 + 2 * E.he[r + 1][c], x0, y1);
    pth.quadraticCurveTo(x0 + 2 * E.ve[r][c], my, x0, y0);
    pth.closePath();
    return pth;
  }

  function buildPaths(E) {
    var out = [];
    for (var r = 0; r < ROWS; r++) {
      out[r] = [];
      for (var c = 0; c < COLS; c++) {
        out[r][c] = [
          cellPath(new Path2D(), c, r, INSET, E),
          cellPath(new Path2D(), c, r, INSET + 5, E),
          cellPath(new Path2D(), c, r, INSET + 10, E)
        ];
      }
    }
    return out;
  }

  function layerCount(L) { return L <= 3 ? 1 : (L <= 6 ? 2 : 3); }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var E = buildEdges();
    var PATHS = buildPaths(E);
    var anims = new Map();     // id -> {vr, pop, born}
    var parts = [];            // 纸屑
    var floats = [];           // 飘字
    var bg = null, bgEff = -1;
    var R = { canvas: canvas, ctx: ctx, anims: anims, parts: parts, PAPER: PAPER };

    function buildBG(eff) {
      var oc = document.createElement('canvas');
      oc.width = Math.ceil(W * eff); oc.height = Math.ceil(H * eff);
      var o = oc.getContext('2d');
      o.setTransform(eff, 0, 0, eff, 0, 0);
      o.fillStyle = BG; o.fillRect(0, 0, W, H);
      // 宣纸纤维：一次性烘焙的极淡噪点
      var rnd = mulberry(778811);
      for (var i = 0; i < 2600; i++) {
        var x = rnd() * W, y = rnd() * H, s = rnd();
        o.fillStyle = s > 0.5 ? 'rgba(120,100,70,0.045)' : 'rgba(255,255,255,0.05)';
        o.fillRect(x, y, 1 + (s > 0.9 ? 1 : 0), 1);
      }
      // 拼贴托盘
      var rr = 10;
      o.save();
      o.fillStyle = 'rgba(90,70,45,0.10)';
      roundRect(o, BX - 8 + 2, BY - 8 + 3, BW + 16, BH + 16, rr); o.fill();
      o.fillStyle = TRAY2;
      roundRect(o, BX - 8, BY - 8, BW + 16, BH + 16, rr); o.fill();
      o.fillStyle = TRAY;
      roundRect(o, BX - 6, BY - 6, BW + 12, BH + 12, rr - 2); o.fill();
      o.restore();
      // 格位浅痕
      o.strokeStyle = 'rgba(120,95,60,0.10)'; o.lineWidth = 1;
      for (var c = 1; c < COLS; c++) {
        o.beginPath(); o.moveTo(BX + c * CELL + 0.5, BY + 4); o.lineTo(BX + c * CELL + 0.5, BY + BH - 4); o.stroke();
      }
      for (var r2 = 1; r2 < ROWS; r2++) {
        o.beginPath(); o.moveTo(BX + 4, BY + r2 * CELL + 0.5); o.lineTo(BX + BW - 4, BY + r2 * CELL + 0.5); o.stroke();
      }
      bg = oc; bgEff = eff;
    }
    function roundRect(o, x, y, w, h, r) {
      o.beginPath();
      o.moveTo(x + r, y); o.lineTo(x + w - r, y); o.quadraticCurveTo(x + w, y, x + w, y + r);
      o.lineTo(x + w, y + h - r); o.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      o.lineTo(x + r, y + h); o.quadraticCurveTo(x, y + h, x, y + h - r);
      o.lineTo(x, y + r); o.quadraticCurveTo(x, y, x + r, y); o.closePath();
    }

    R.setScale = function (eff) { if (eff !== bgEff) buildBG(eff); };

    /* —— 事件消费：只在这里产生粒子 / 飘字 —— */
    R.consume = function (st) {
      var ev = st.events;
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i];
        if (e.t === 'merge') {
          var L = e.level, col = PAPER[Math.min(L, 7)];
          for (var k = 0; k < e.cells.length; k++) {
            var ci = e.cells[k], cc = ci % COLS, cr = (ci - cc) / COLS;
            var cx = BX + cc * CELL + CELL / 2, cy = BY + cr * CELL + CELL / 2;
            var n = Math.min(6, 3 + (e.n >= 5 ? 3 : 0));
            for (var p = 0; p < n && parts.length < 220; p++) {
              var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 150;
              parts.push({
                x: cx + (Math.random() - 0.5) * 22, y: cy + (Math.random() - 0.5) * 22,
                vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 70,
                rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 9,
                s: 2.5 + Math.random() * 5, life: 0.55 + Math.random() * 0.5, max: 1.05, col: col
              });
            }
            var an = anims.get(e.ids[k]); if (an) an.pop = 0;
          }
          var ai = e.anchor, ac = ai % COLS, ar = (ai - ac) / COLS;
          floats.push({
            x: BX + ac * CELL + CELL / 2, y: BY + ar * CELL + CELL / 2,
            txt: '+' + e.score, life: 0.95, max: 0.95,
            col: e.capped ? '#B03A2E' : '#6B5B45', big: e.cascade > 1 || e.n >= 5
          });
          if (e.cascade > 1) {
            floats.push({
              x: BX + ac * CELL + CELL / 2, y: BY + ar * CELL + CELL / 2 - 26,
              txt: '连锁 ×' + e.cascade, life: 1.05, max: 1.05, col: '#B07A2A', big: true
            });
          }
        } else if (e.t === 'place') {
          anims.set(e.id, { vr: -1.25, pop: 1 });
        }
      }
      ev.length = 0;
    };

    // vr 允许是小数（下落 / 重力补间）：取最接近的整数行取烘焙路径，再整体平移
    function drawPaper(c, vr, L) {
      var ri = Math.round(vr);
      if (ri < 0) ri = 0; else if (ri > ROWS - 1) ri = ROWS - 1;
      var dy = (vr - ri) * CELL;
      var pth = PATHS[ri][c], col = PAPER[Math.min(L, 7)];
      var lc = layerCount(L);
      var ox = BX + c * CELL, oy = BY + ri * CELL;
      ctx.save();
      if (dy) ctx.translate(0, dy);
      // 纸片投影
      ctx.save(); ctx.translate(1.5, 2.5);
      ctx.fillStyle = 'rgba(92,70,40,0.16)'; ctx.fill(pth[0]); ctx.restore();
      // 本体
      ctx.fillStyle = col; ctx.fill(pth[0]);
      // 裱贴叠层（等级越高层数越多）
      for (var k = 1; k < lc; k++) {
        ctx.fillStyle = 'rgba(255,252,244,' + (0.16 + 0.05 * k) + ')';
        ctx.fill(pth[k]);
      }
      // 上缘高光 / 下缘压暗，做出纸的厚度
      ctx.save(); ctx.clip(pth[0]);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(ox, oy, CELL, 7);
      ctx.fillStyle = 'rgba(70,50,25,0.13)';
      ctx.fillRect(ox, oy + CELL - 8, CELL, 8);
      ctx.restore();
      // 面值：汉字数字
      ctx.fillStyle = L >= 4 ? 'rgba(255,250,240,0.92)' : 'rgba(80,60,30,0.72)';
      ctx.font = '600 19px "Songti SC","SimSun","STSong",serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(NUM[Math.min(L, 7)], ox + CELL / 2 + 0.5, oy + CELL / 2 + 1);
      ctx.restore();
    }

    R.draw = function (st, dt) {
      if (!(dt > 0)) dt = 0;
      if (dt > 0.05) dt = 0.05;
      R._t = (R._t || 0) + dt;
      if (bg) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(bg, 0, 0); ctx.restore(); }
      else { ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H); }

      var sh = st.shake || 0;
      ctx.save();
      if (sh > 0.001) ctx.translate((Math.random() - 0.5) * sh * 4.5, (Math.random() - 0.5) * sh * 4.5);

      // —— 落点指示 ——
      if (st.phase === 'aim' || st.phase === 'fall') {
        var lc2 = st.col;
        ctx.save();
        ctx.fillStyle = 'rgba(176,140,80,0.10)';
        ctx.fillRect(BX + lc2 * CELL, BY, CELL, BH);
        var lr = Math.max(0, st.phase === 'fall' ? st.land : G.landRow(st, lc2));
        ctx.strokeStyle = 'rgba(150,115,60,0.55)'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 5]);
        ctx.strokeRect(BX + lc2 * CELL + 3, BY + lr * CELL + 3, CELL - 6, CELL - 6);
        ctx.restore();
      }

      // —— 盘面 ——
      var kk = 1 - Math.pow(1e-7, dt);  // 视觉行插值：约 0.19s 收敛到 5% 以内
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          var i = r * COLS + c, L = st.grid[i];
          if (!L) continue;
          var id = st.ids[i];
          var a = anims.get(id);
          if (!a) { a = { vr: r, pop: 1 }; anims.set(id, a); }
          a.vr += (r - a.vr) * kk;
          if (a.pop < 1) a.pop = Math.min(1, a.pop + dt * 4.5);
          if (a.vr < -0.35) continue;
          drawPaper(c, a.vr, L);
        }
      }
      if (anims.size > 260) { // 防止 Map 无限增长
        anims.forEach(function (v, key) { if (v.pop >= 1) anims.delete(key); });
      }

      // —— 下落中的纸片 ——
      if (st.phase === 'fall' && st.fallY > -0.35) drawPaper(st.col, st.fallY, st.cur);

      // —— 手上的那张（悬在板顶）——
      if (st.phase === 'aim' && st.cur) {
        var bob = Math.sin((R._t || 0) * 3.2) * 2.2;
        ctx.save();
        ctx.translate(0, -CELL * 1.3 + bob);
        drawPaper(st.col, 0, st.cur);
        ctx.restore();
      }

      // —— 纸屑 ——
      for (var p = parts.length - 1; p >= 0; p--) {
        var q = parts[p];
        q.life -= dt;
        if (q.life <= 0) { parts.splice(p, 1); continue; }
        q.vy += 520 * dt; q.vx *= (1 - 1.6 * dt);
        q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, q.life / q.max));
        ctx.translate(q.x, q.y); ctx.rotate(q.rot);
        ctx.fillStyle = q.col;
        ctx.fillRect(-q.s / 2, -q.s / 2, q.s, q.s * 0.72);
        ctx.restore();
      }

      // —— 飘字 ——
      for (var f = floats.length - 1; f >= 0; f--) {
        var z = floats[f];
        z.life -= dt;
        if (z.life <= 0) { floats.splice(f, 1); continue; }
        var pr = 1 - z.life / z.max;
        ctx.save();
        ctx.globalAlpha = Math.max(0, z.life / z.max);
        ctx.fillStyle = z.col;
        ctx.font = (z.big ? '700 21px' : '600 17px') + ' "Songti SC","SimSun",serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(z.txt, z.x, z.y - 22 - pr * 26);
        ctx.restore();
      }

      ctx.restore();
    };

    R.reset = function () { anims.clear(); parts.length = 0; floats.length = 0; };
    R.geom = { W: W, H: H, BX: BX, BY: BY, CELL: CELL, BW: BW, BH: BH, COLS: COLS, ROWS: ROWS };
    R.PAPER = PAPER; R.NUM = NUM;
    return R;
  }

  var G = g.PaperGame;
  var API = { create: create, PAPER: PAPER, NUM: NUM, geom: { W: W, H: H, BX: BX, BY: BY, CELL: CELL, BW: BW, BH: BH, COLS: COLS, ROWS: ROWS } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  g.PaperRender = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
