/* 295-bentopress《便当 · 压格子》 — 渲染层
 * 孔版印刷 Risograph × 触感颗粒 × 迪士尼十二原则（挤压拉伸 + 预备动作）
 * 性能纪律：背景（纸底 + 颗粒 + 盒体 + 隔板 + 网格）一次烘焙进离屏 canvas，
 *           每帧只做 1 次全屏 drawImage + 十几个食材 + 少量粒子。
 */
(function (root, factory) {
  var R = factory(root && root.BENTO);
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
  if (root) root.BENTO_R = R;
})(typeof window !== 'undefined' ? window : null, function (B) {
  'use strict';

  var W = 480, H = 648, CELL = 46;

  var C = {
    paper: '#EFE7D8',
    lacquer: '#8E3B2E', lacquerD: '#6E2A21', lacquerL: '#A94B39',
    board: '#EDE3CE', grid: '#D9CBA9',
    wall: '#B58A57', wallD: '#8E6839',
    inkMis: '#2E4A7D',
    text: '#3A3226',
  };

  var ctx = null, cv = null, dpr = 1, SC = 1;
  var bg = null, bgKey = '';
  var grainPat = null;

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function bakeGrain() {
    var n = document.createElement('canvas');
    n.width = n.height = 96;
    var g = n.getContext('2d');
    var im = g.createImageData(96, 96);
    var s = 20260910;
    for (var i = 0; i < 96 * 96; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      var v = (s >>> 24) & 255;
      im.data[i * 4] = 40; im.data[i * 4 + 1] = 34; im.data[i * 4 + 2] = 26;
      im.data[i * 4 + 3] = v < 26 ? 26 : (v > 232 ? 16 : 0);
    }
    g.putImageData(im, 0, 0);
    return n;
  }

  function boardRect(st) {
    var bw = st.cols * CELL, bh = st.rows * CELL;
    return { x: Math.round((W - bw) / 2), y: 30, w: bw, h: bh };
  }
  function queueTop(st) { return boardRect(st).y + boardRect(st).h + 26; }

  function bake(st) {
    var key = st.li + '|' + st.seed + '|' + st.cols + 'x' + st.rows;
    if (bg && bgKey === key) return;
    bgKey = key;
    if (!bg) { bg = document.createElement('canvas'); bg.width = W; bg.height = H; }
    var g = bg.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);

    // 纸底
    g.fillStyle = C.paper; g.fillRect(0, 0, W, H);

    // 盒体（漆器）
    var B0 = boardRect(st), pad = 11;
    g.save();
    g.shadowColor = 'rgba(60,40,25,0.22)'; g.shadowBlur = 12; g.shadowOffsetY = 4;
    g.fillStyle = C.lacquer;
    rr(g, B0.x - pad, B0.y - pad, B0.w + pad * 2, B0.h + pad * 2, 15); g.fill();
    g.restore();
    g.strokeStyle = C.lacquerD; g.lineWidth = 2;
    rr(g, B0.x - pad, B0.y - pad, B0.w + pad * 2, B0.h + pad * 2, 15); g.stroke();
    g.fillStyle = C.lacquerL;
    rr(g, B0.x - pad + 3, B0.y - pad + 3, B0.w + pad * 2 - 6, 7, 5); g.fill();

    // 盒内（木纸色）
    g.fillStyle = C.board;
    rr(g, B0.x - 3, B0.y - 3, B0.w + 6, B0.h + 6, 7); g.fill();
    g.strokeStyle = '#CDBB92'; g.lineWidth = 1.5;
    rr(g, B0.x - 3, B0.y - 3, B0.w + 6, B0.h + 6, 7); g.stroke();

    // 网格
    g.strokeStyle = C.grid; g.lineWidth = 1;
    g.beginPath();
    for (var i = 1; i < st.cols; i++) { g.moveTo(B0.x + i * CELL + .5, B0.y); g.lineTo(B0.x + i * CELL + .5, B0.y + B0.h); }
    for (var j = 1; j < st.rows; j++) { g.moveTo(B0.x, B0.y + j * CELL + .5); g.lineTo(B0.x + B0.w, B0.y + j * CELL + .5); }
    g.stroke();

    // 隔板（木条）
    for (var k = 0; k < st.walls.length; k++) {
      var wl = st.walls[k];
      var x = B0.x + wl.x * CELL, y = B0.y + wl.y * CELL;
      var w = wl.w * CELL, h = wl.h * CELL;
      g.fillStyle = C.wall;
      rr(g, x + 2, y + 2, w - 4, h - 4, 5); g.fill();
      g.strokeStyle = C.wallD; g.lineWidth = 1.4;
      rr(g, x + 2, y + 2, w - 4, h - 4, 5); g.stroke();
      // 木纹
      g.save();
      rr(g, x + 2, y + 2, w - 4, h - 4, 5); g.clip();
      g.strokeStyle = 'rgba(120,86,45,0.42)'; g.lineWidth = 1;
      var along = w >= h;
      var n2 = Math.max(2, Math.floor((along ? h : w) / 9));
      for (var t = 1; t < n2; t++) {
        g.beginPath();
        if (along) {
          var yy = y + 4 + t * (h - 8) / n2;
          g.moveTo(x + 3, yy);
          g.bezierCurveTo(x + w * .3, yy + 2.2, x + w * .68, yy - 2.2, x + w - 3, yy + .8);
        } else {
          var xx = x + 4 + t * (w - 8) / n2;
          g.moveTo(xx, y + 3);
          g.bezierCurveTo(xx + 2.2, y + h * .3, xx - 2.2, y + h * .68, xx + .8, y + h - 3);
        }
        g.stroke();
      }
      g.restore();
    }

    // 颗粒（一次性烘焙进背景，零每帧开销）
    if (!grainPat) grainPat = g.createPattern(bakeGrain(), 'repeat');
    g.save();
    g.globalAlpha = 0.5;
    g.fillStyle = grainPat;
    g.fillRect(0, 0, W, H);
    g.restore();
  }

  /* ---------- 动画 ---------- */
  function animOf(it) {
    var a = it.anim;
    if (!a) return { sx: 1, sy: 1, dx: 0, sel: 0 };
    var p = Math.min(1, a.t / a.dur);
    if (a.k === 'refuse') {
      return { sx: 1, sy: 1, dx: Math.sin(a.t * 58) * 7 * Math.exp(-9 * a.t), sel: 0 };
    }
    var s = Math.cos(p * 13) * Math.exp(-5.2 * p);
    var A = a.k === 'press' ? 0.19 : 0.24;
    return { sx: 1 + A * s, sy: 1 - A * s, dx: 0, sel: 0 };
  }

  /* ---------- 食材 ---------- */
  function drawItem(g, it, px, py, pw, ph, opt) {
    opt = opt || {};
    var ins = 3;
    var x = px + ins, y = py + ins, w = pw - ins * 2, h = ph - ins * 2;
    if (w <= 0 || h <= 0) return;
    g.save();
    if (opt.alpha !== undefined) g.globalAlpha = opt.alpha;

    // 落影
    g.fillStyle = 'rgba(70,50,30,0.14)';
    rr(g, x + 2.5, y + 3.5, w, h, 7); g.fill();

    // 孔版套色错位：先印一层偏移的深版
    g.fillStyle = it.ink2;
    g.globalAlpha = (opt.alpha !== undefined ? opt.alpha : 1) * 0.9;
    rr(g, x + 2.2, y + 1.8, w, h, 7); g.fill();

    // 主版
    g.globalAlpha = (opt.alpha !== undefined ? opt.alpha : 1);
    g.fillStyle = it.ink;
    rr(g, x, y, w, h, 7); g.fill();
    g.strokeStyle = it.ink2; g.lineWidth = 1.6;
    rr(g, x, y, w, h, 7); g.stroke();

    // 内部纹理小点
    g.fillStyle = it.ink2; g.globalAlpha = (opt.alpha !== undefined ? opt.alpha : 1) * 0.34;
    for (var d = 0; d < it.dots; d++) {
      var a = (d * 2.399 + it.id * 1.7);
      var dx2 = x + 7 + ((Math.sin(a) * 0.5 + 0.5) * (w - 14));
      var dy2 = y + 7 + ((Math.cos(a * 1.3) * 0.5 + 0.5) * (h - 14));
      g.beginPath(); g.arc(dx2, dy2, 1.5, 0, 6.2832); g.fill();
    }

    // 名字（带错印重影）
    if (w > 26 && h > 20) {
      g.globalAlpha = (opt.alpha !== undefined ? opt.alpha : 1) * 0.85;
      g.font = '600 12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = it.ink2;
      g.fillText(it.name, x + w / 2 + 1.3, y + h / 2 + 1.1);
      g.fillStyle = 'rgba(38,32,24,0.62)';
      g.fillText(it.name, x + w / 2, y + h / 2);
    }

    // 软食材：揉捏配额点
    if (it.soft && w > 30) {
      g.globalAlpha = (opt.alpha !== undefined ? opt.alpha : 1) * 0.75;
      var n = it.quota, r = 2.1, gap = 6.4;
      var sx0 = x + w / 2 - (n - 1) * gap / 2;
      for (var q = 0; q < n; q++) {
        g.beginPath();
        g.arc(sx0 + q * gap, y + h - 7, r, 0, 6.2832);
        g.fillStyle = q < it.used ? 'rgba(255,255,255,0.85)' : 'rgba(40,32,22,0.42)';
        g.fill();
      }
    }
    g.restore();
  }

  /* ---------- 主绘制 ---------- */
  function draw(st, view) {
    if (!ctx) return;
    bake(st);
    var g = ctx;
    g.setTransform(SC, 0, 0, SC, 0, 0);
    g.clearRect(0, 0, W, H);
    g.drawImage(bg, 0, 0);

    var B0 = boardRect(st);

    // 已放置食材
    for (var i = 0; i < st.items.length; i++) {
      var it = st.items[i];
      if (!it.placed) continue;
      var an = animOf(it);
      var cx = B0.x + (it.gx + it.w / 2) * CELL;
      var cy = B0.y + (it.gy + it.h / 2) * CELL;
      var pw = it.w * CELL * an.sx, ph = it.h * CELL * an.sy;
      drawItem(g, it, cx - pw / 2 + an.dx, cy - ph / 2, pw, ph);
      if (st.sel && st.sel.kind === 'placed' && st.sel.id === it.id) {
        g.save();
        g.strokeStyle = C.lacquer; g.lineWidth = 2.6; g.setLineDash([6, 4]);
        g.lineDashOffset = -(st.t * 22) % 10;
        rr(g, B0.x + it.gx * CELL - 1, B0.y + it.gy * CELL - 1, it.w * CELL + 2, it.h * CELL + 2, 9);
        g.stroke();
        g.restore();
      }
    }

    // 落点预览
    if (view && view.cell && st.sel && st.sel.kind === 'queue') {
      var it2 = B.itemById(st, st.sel.id);
      if (it2) {
        var okp = B.canPlace(st, view.cell.x, view.cell.y, it2.w, it2.h, -1);
        g.save();
        g.globalAlpha = 0.32;
        g.fillStyle = okp ? '#6E8B5B' : '#B23A2A';
        rr(g, B0.x + view.cell.x * CELL + 3, B0.y + view.cell.y * CELL + 3,
          it2.w * CELL - 6, it2.h * CELL - 6, 7); g.fill();
        g.globalAlpha = 0.9;
        g.strokeStyle = okp ? '#4E6B3B' : '#8E2A1E'; g.lineWidth = 2; g.setLineDash([5, 4]);
        rr(g, B0.x + view.cell.x * CELL + 3, B0.y + view.cell.y * CELL + 3,
          it2.w * CELL - 6, it2.h * CELL - 6, 7); g.stroke();
        g.restore();
      }
    }

    // 合盖
    if (st.lid) {
      var p = Math.min(1, st.lid.t / st.lid.dur);
      var e = 1 - Math.pow(1 - p, 3);
      var lh = (B0.h + 22) * e;
      g.save();
      g.globalAlpha = 0.94;
      g.fillStyle = C.lacquer;
      rr(g, B0.x - 11, B0.y - 11 + (B0.h + 22 - lh), B0.w + 22, lh, 15); g.fill();
      g.strokeStyle = C.lacquerD; g.lineWidth = 2;
      rr(g, B0.x - 11, B0.y - 11 + (B0.h + 22 - lh), B0.w + 22, lh, 15); g.stroke();
      g.fillStyle = C.lacquerL;
      var hy = B0.y - 11 + (B0.h + 22 - lh);
      rr(g, B0.x - 8, hy + 4, B0.w + 16, 6, 4); g.fill();
      g.restore();
    }

    // 队列
    drawQueue(g, st, view);
  }

  function drawQueue(g, st, view) {
    var top = queueTop(st);
    var per = 6, cw = 68, gap = 8;
    var rows = Math.ceil(st.queue.length / per);
    var x0 = Math.round((W - (Math.min(per, Math.max(1, st.queue.length)) * cw + (Math.min(per, Math.max(1, st.queue.length)) - 1) * gap)) / 2);

    g.save();
    g.font = '600 12px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillStyle = 'rgba(58,50,38,0.55)';
    g.fillText('食材 · ' + st.queue.length + ' 件待放', 20, top - 8);
    g.restore();

    for (var i = 0; i < st.queue.length; i++) {
      var id = st.queue[i], it = B.itemById(st, id);
      var r = Math.floor(i / per), c = i % per;
      var x = x0 + c * (cw + gap), y = top + r * (cw + gap);
      var sel = st.sel && st.sel.kind === 'queue' && st.sel.id === id;
      g.save();
      // 卡底
      g.fillStyle = sel ? '#FBF5E8' : 'rgba(255,252,244,0.62)';
      rr(g, x, y, cw, cw, 8); g.fill();
      g.strokeStyle = sel ? C.lacquer : 'rgba(140,120,90,0.45)';
      g.lineWidth = sel ? 2.4 : 1.2;
      rr(g, x, y, cw, cw, 8); g.stroke();

      // 迷你形状
      var pad = 12, aw = cw - pad * 2, ah = cw - pad * 2 - 10;
      var s = Math.min(aw / it.w, ah / it.h);
      var pw = it.w * s, ph = it.h * s;
      drawItem(g, it, x + (cw - pw) / 2, y + 8 + (ah - ph) / 2, pw, ph);

      // 名称 + 尺寸
      g.font = '600 10px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      g.textAlign = 'center'; g.fillStyle = 'rgba(58,50,38,0.7)';
      g.fillText(it.name + ' ' + it.w + '×' + it.h, x + cw / 2, y + cw - 6);
      g.restore();
    }

    // 手牌条
    var handY = top + rows * (cw + gap) + 12;
    handY = Math.min(handY, H - 88);
    drawHand(g, st, handY, view);
  }

  function drawHand(g, st, y, view) {
    var h = 76;
    g.save();
    g.fillStyle = 'rgba(255,252,244,0.72)';
    rr(g, 16, y, W - 32, h, 10); g.fill();
    g.strokeStyle = 'rgba(140,120,90,0.42)'; g.lineWidth = 1.2;
    rr(g, 16, y, W - 32, h, 10); g.stroke();

    var it = B.selected(st);
    if (!it) {
      g.font = '600 13px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      g.textAlign = 'center'; g.fillStyle = 'rgba(58,50,38,0.55)';
      g.fillText('点一张食材卡 → 再点盒子里的空格放下', W / 2, y + 33);
      g.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
      g.fillStyle = 'rgba(58,50,38,0.4)';
      g.fillText('W/↑ 压扁（宽+1 高−1） · S/↓ 压长（宽−1 高+1）', W / 2, y + 54);
      g.restore(); return;
    }

    // 手上这块（放大展示）
    var s = Math.min(52 / it.w, 52 / it.h);
    var pw = it.w * s, ph = it.h * s;
    drawItem(g, it, 28, y + (h - ph) / 2, pw, ph);

    g.textAlign = 'left';
    g.font = '600 14px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    g.fillStyle = C.text;
    g.fillText(it.name + '  ' + it.w + ' × ' + it.h, 92, y + 26);

    g.font = '11px "PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    g.fillStyle = 'rgba(58,50,38,0.6)';
    if (it.soft) {
      g.fillText('可揉 ' + (it.quota - it.used) + ' / ' + it.quota + ' 次', 92, y + 44);
    } else {
      g.fillText('硬食材 · 形状锁死', 92, y + 44);
    }
    g.fillStyle = 'rgba(58,50,38,0.42)';
    g.fillText(it.placed ? 'Q / 收回 键可拿回' : 'W 压扁 · S 压长 · 空格 自动落位', 92, y + 62);
    g.restore();
  }

  /* ---------- 初始化 ---------- */
  function init(canvas) {
    cv = canvas;
    ctx = cv.getContext('2d');
    resize();
  }
  function resize() {
    if (!cv) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.4);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px';
    cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    SC = dpr;
  }
  function cellAt(st, cssX, cssY) {
    var B0 = boardRect(st);
    var x = Math.floor((cssX - B0.x) / CELL), y = Math.floor((cssY - B0.y) / CELL);
    if (x < 0 || y < 0 || x >= st.cols || y >= st.rows) return null;
    return { x: x, y: y };
  }
  function queueHit(st, cssX, cssY) {
    var top = queueTop(st), per = 6, cw = 68, gap = 8;
    var n = st.queue.length;
    if (n === 0) return -1;
    var cols = Math.min(per, n);
    var x0 = Math.round((W - (cols * cw + (cols - 1) * gap)) / 2);
    for (var i = 0; i < n; i++) {
      var r = Math.floor(i / per), c = i % per;
      var x = x0 + c * (cw + gap), y = top + r * (cw + gap);
      if (cssX >= x && cssX <= x + cw && cssY >= y && cssY <= y + cw) return st.queue[i];
    }
    return -1;
  }

  return {
    W: W, H: H, CELL: CELL, C: C,
    init: init, resize: resize, draw: draw,
    cellAt: cellAt, queueHit: queueHit, boardRect: boardRect, queueTop: queueTop,
    invalidate: function () { bgKey = ''; },
  };
});
