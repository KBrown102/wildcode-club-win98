/* 赶海 · 潮退的一程 — 渲染层（Canvas 2D · 浮世绘平涂）
 * 只读游戏状态，不改状态；消费 events 生成粒子/飘字。
 */
(function (g) {
  'use strict';

  var W = 480, H = 800;
  var SHORE_Y = 686, HIGH_Y = 724;

  // 浮世绘五色套色
  var C = {
    seaDeep: '#16304E',
    seaMid: '#244F7C',
    seaNear: '#3A7099',
    foam: '#E8E2D4',
    ink: '#171717',
    vermilion: '#C7452E',
    mustard: '#D9A441',
    bone: '#EFEADD',
    sandDry: '#DCCBA6',
    sandWet: '#B59B6C',
    sandShore: '#C9B38C',
    teal: '#4E7C78'
  };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function create(canvas) {
    var ctx = canvas.getContext('2d');
    var bg = document.createElement('canvas');
    var bgx = bg.getContext('2d');
    var scale = 1, eff = 1;
    var parts = [], floats = [], ripples = [];
    var shakeMag = 0, flash = 0, breathGlow = 0, hitT = 0;
    var lastPX = 0, lastPY = 0, stepAcc = 0;
    var MAXP = 240;

    function buildBG(efficiency) {
      bg.width = Math.round(W * efficiency);
      bg.height = Math.round(H * efficiency);
      bgx.setTransform(efficiency, 0, 0, efficiency, 0, 0);
      var rnd = mulberry32(20260901);

      // 干滩底
      bgx.fillStyle = C.sandDry;
      bgx.fillRect(0, 0, W, H);

      // 沙纹（横向波状细线）
      bgx.lineWidth = 1;
      for (var i = 0; i < 46; i++) {
        var y = 120 + rnd() * (SHORE_Y - 100);
        bgx.strokeStyle = 'rgba(140,116,78,' + (0.05 + rnd() * 0.10).toFixed(3) + ')';
        bgx.beginPath();
        for (var x = 0; x <= W; x += 12) {
          var yy = y + Math.sin(x * 0.021 + i * 1.7) * 3.2 + Math.sin(x * 0.06 + i) * 1.2;
          if (x === 0) bgx.moveTo(x, yy); else bgx.lineTo(x, yy);
        }
        bgx.stroke();
      }
      // 散落的碎石与贝壳碎片
      for (var k = 0; k < 130; k++) {
        var px = rnd() * W, py = 110 + rnd() * (SHORE_Y - 100);
        var r = 0.7 + rnd() * 1.9;
        bgx.fillStyle = rnd() < 0.5 ? 'rgba(120,100,70,0.20)' : 'rgba(240,232,214,0.34)';
        bgx.beginPath(); bgx.ellipse(px, py, r * 1.5, r, rnd() * 3, 0, 6.283); bgx.fill();
      }
      // 滩上的几道旧水痕
      for (var j = 0; j < 5; j++) {
        var ty = 170 + j * 92 + rnd() * 30;
        bgx.strokeStyle = 'rgba(126,104,68,0.16)';
        bgx.lineWidth = 2.4;
        bgx.beginPath();
        for (var xx = 0; xx <= W; xx += 10) {
          var y2 = ty + Math.sin(xx * 0.014 + j * 2.1) * 5;
          if (xx === 0) bgx.moveTo(xx, y2); else bgx.lineTo(xx, y2);
        }
        bgx.stroke();
      }

      // ── 岸带 ──
      bgx.fillStyle = C.sandShore;
      bgx.fillRect(0, SHORE_Y, W, H - SHORE_Y);
      // 岸线上沿一条墨线
      bgx.strokeStyle = 'rgba(23,23,23,0.34)';
      bgx.lineWidth = 2;
      bgx.beginPath();
      for (var sx = 0; sx <= W; sx += 8) {
        var sy = SHORE_Y + Math.sin(sx * 0.03) * 2.2;
        if (sx === 0) bgx.moveTo(sx, sy); else bgx.lineTo(sx, sy);
      }
      bgx.stroke();
      // 岸带上的干草丛
      for (var hI = 0; hI < 26; hI++) {
        var gx = rnd() * W, gy = SHORE_Y + 12 + rnd() * 76;
        bgx.strokeStyle = 'rgba(110,120,66,0.42)';
        bgx.lineWidth = 1.3;
        for (var b = -1; b <= 1; b++) {
          bgx.beginPath(); bgx.moveTo(gx, gy);
          bgx.quadraticCurveTo(gx + b * 3, gy - 5, gx + b * 6, gy - 11);
          bgx.stroke();
        }
      }
      // 岸带底部一条朱红布带（安全区标识）
      bgx.fillStyle = 'rgba(199,69,46,0.20)';
      bgx.fillRect(0, H - 26, W, 26);
    }

    function resize(s) {
      scale = s || 1;
      var dpr = window.devicePixelRatio || 1;
      eff = Math.min(dpr * scale, 3);
      if (eff < 1) eff = 1;
      canvas.width = Math.round(W * eff);
      canvas.height = Math.round(H * eff);
      // CSS 尺寸固定为逻辑尺寸；整体缩放交给外层 #stage 的 transform，
      // 否则会出现「canvas 自己缩放一次 + stage 再缩放一次」的双缩放
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(eff, 0, 0, eff, 0, 0);
      buildBG(eff);
    }

    function push(p) { if (parts.length < MAXP) parts.push(p); }

    function burst(x, y, color, n, spd, life, size) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * 6.283;
        var v = spd * (0.35 + Math.random() * 0.85);
        push({
          x: x, y: y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spd * 0.35,
          life: life * (0.7 + Math.random() * 0.6), max: life, c: color,
          r: size * (0.6 + Math.random() * 0.8), g: 120
        });
      }
    }
    function foamLine(y, n) {
      for (var i = 0; i < n; i++) {
        var x = Math.random() * W;
        push({
          x: x, y: y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 70,
          life: 0.5 + Math.random() * 0.5, max: 1, c: C.foam,
          r: 1.4 + Math.random() * 2.6, g: 60
        });
      }
    }
    function float(x, y, text, color, big) {
      floats.push({ x: x, y: y, text: text, c: color || C.ink, life: 1.15, max: 1.15, big: !!big });
    }

    function pump(evts) {
      for (var i = 0; i < evts.length; i++) {
        var e = evts[i];
        if (e.type === 'pick') {
          burst(e.x, e.y - 6, e.sp.color, 12, 120, 0.62, 3);
          burst(e.x, e.y - 6, C.bone, 5, 80, 0.5, 2);
          float(e.x, e.y - 26, '+' + e.gain, e.mult > 1.05 ? C.vermilion : C.ink, e.mult > 1.6);
          if (e.combo >= 3) float(e.x + 26, e.y - 44, '×' + e.mult.toFixed(1), C.mustard);
          hitT = 0.09;
        } else if (e.type === 'discover') {
          burst(e.sp ? 240 : 240, 200, C.mustard, 20, 150, 0.9, 3);
        } else if (e.type === 'wash') {
          burst(e.x, e.y, C.foam, 8, 70, 0.5, 2.4);
          push({ x: e.x, y: e.y, vx: 0, vy: -20, life: 0.6, max: 0.6, c: C.seaNear, r: 6, g: 0, ring: true });
        } else if (e.type === 'surge') {
          foamLine(e.y, 46); shakeMag = Math.max(shakeMag, 5);
        } else if (e.type === 'swept') {
          burst(lastPX, lastPY, C.foam, 26, 190, 0.85, 3.4);
          shakeMag = Math.max(shakeMag, 9); flash = 0.5;
          float(lastPX, lastPY - 40, e.lost ? ('浪带走了' + e.lost.name) : '浪把你送回岸上', C.seaDeep, true);
        } else if (e.type === 'unload') {
          var cx = 240, cy = SHORE_Y + 40;
          burst(cx, cy, C.mustard, 16, 110, 0.8, 3);
          float(cx, cy - 20, '入篓 +' + (e.sum + e.bonus) + (e.bonus ? '（满载 +' + e.bonus + '）' : ''), C.vermilion, e.bonus > 0);
        } else if (e.type === 'unlock') {
          float(240, 300, '得到 · ' + e.name, C.vermilion, true);
          burst(240, 300, C.mustard, 18, 130, 0.9, 3);
        } else if (e.type === 'bagfull') {
          float(e.x, e.y - 24, '桶满了', C.ink);
        } else if (e.type === 'spawn') {
          // 静默
        }
      }
    }

    // ── 海 ──
    function waveAt(x, t, base) {
      return base + Math.sin(x * 0.017 + t * 0.9) * 3.4 + Math.sin(x * 0.045 - t * 0.62) * 1.7;
    }
    function drawSea(s, t) {
      var wy = s.waterY;
      // 深海带
      var grd = ctx.createLinearGradient(0, -60, 0, Math.max(wy, 1));
      grd.addColorStop(0, C.seaDeep);
      grd.addColorStop(0.62, C.seaMid);
      grd.addColorStop(1, C.seaNear);
      ctx.fillStyle = grd;
      ctx.fillRect(0, -60, W, Math.max(wy + 60, 60));

      // 海面白浪纹（程式化短弧，浮世绘感）
      ctx.lineCap = 'round';
      var rows = Math.max(2, Math.floor(wy / 52));
      for (var r = 0; r < rows; r++) {
        var yy = -20 + r * 50 + ((t * 8 + r * 13) % 50);
        if (yy > wy - 12) continue;
        ctx.strokeStyle = 'rgba(232,226,212,' + (0.10 + 0.05 * Math.sin(r + t * 0.4)).toFixed(3) + ')';
        ctx.lineWidth = 2;
        for (var x = 0; x < W; x += 46) {
          var ph = (x * 0.03 + t * 0.55 + r * 1.3);
          var off = Math.sin(ph) * 8;
          ctx.beginPath();
          ctx.moveTo(x - 14, yy + off * 0.4);
          ctx.quadraticCurveTo(x, yy - 5 - off * 0.3, x + 14, yy + off * 0.4);
          ctx.stroke();
        }
      }

      // 潮线：波浪路径
      ctx.beginPath();
      ctx.moveTo(-4, -60);
      ctx.lineTo(-4, waveAt(-4, t, wy));
      for (var xx = 0; xx <= W + 4; xx += 6) ctx.lineTo(xx, waveAt(xx, t, wy));
      ctx.lineTo(W + 4, -60);
      ctx.closePath();
      ctx.fillStyle = C.seaNear;
      ctx.fill();

      // 潮线泡沫
      ctx.beginPath();
      for (var x2 = 0; x2 <= W + 4; x2 += 6) {
        var y2 = waveAt(x2, t, wy);
        if (x2 === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2);
      }
      ctx.strokeStyle = C.foam; ctx.lineWidth = 3.2; ctx.stroke();
      ctx.strokeStyle = 'rgba(23,23,23,0.22)'; ctx.lineWidth = 1; ctx.stroke();

      // 浪爪（北斋式小勾）
      ctx.strokeStyle = 'rgba(239,234,221,0.85)';
      ctx.lineWidth = 2;
      for (var c = 0; c < 9; c++) {
        var cxp = ((c * 61 + t * 9) % (W + 40)) - 20;
        var cyp = waveAt(cxp, t, wy);
        ctx.beginPath();
        ctx.moveTo(cxp - 9, cyp - 2);
        ctx.quadraticCurveTo(cxp, cyp - 11, cxp + 9, cyp - 4);
        ctx.stroke();
      }
    }

    function drawWet(s, t) {
      var wy = s.waterY, h = 46;
      ctx.beginPath();
      ctx.moveTo(0, waveAt(0, t, wy));
      for (var x = 0; x <= W; x += 6) ctx.lineTo(x, waveAt(x, t, wy));
      for (var x2 = W; x2 >= 0; x2 -= 6) {
        ctx.lineTo(x2, waveAt(x2, t, wy + h) + Math.sin(x2 * 0.03 - t * 0.4) * 4);
      }
      ctx.closePath();
      ctx.fillStyle = C.sandWet;
      ctx.fill();
      ctx.strokeStyle = 'rgba(23,23,23,0.16)'; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // ── 生物 ──
    function strokeInk(lw) { ctx.strokeStyle = C.ink; ctx.lineWidth = lw || 1.6; ctx.stroke(); }

    function drawCreature(sp, x, y, t, wob, state, s) {
      var r = 7 + sp.tier * 1.6;
      var bob = Math.sin(t * 2.2 + wob) * (state === 'flee' ? 2.4 : 1.1);
      ctx.save();
      ctx.translate(x, y + bob);

      // 稀有物光晕
      if (sp.tier >= 3) {
        var g2 = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2.6);
        g2.addColorStop(0, 'rgba(217,164,65,0.30)');
        g2.addColorStop(1, 'rgba(217,164,65,0)');
        ctx.fillStyle = g2;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.6, 0, 6.283); ctx.fill();
      }
      // 影
      ctx.fillStyle = 'rgba(90,72,46,0.20)';
      ctx.beginPath(); ctx.ellipse(0, r * 0.82, r * 0.95, r * 0.34, 0, 0, 6.283); ctx.fill();

      ctx.fillStyle = sp.color;
      switch (sp.id) {
        case 'pebble':
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.82, wob * 0.3, 0, 6.283); ctx.fill(); strokeInk();
          break;
        case 'clam':
          ctx.beginPath();
          ctx.moveTo(-r, r * 0.5);
          ctx.quadraticCurveTo(0, -r * 1.25, r, r * 0.5);
          ctx.closePath(); ctx.fill(); strokeInk();
          ctx.beginPath(); ctx.moveTo(-r * 0.6, r * 0.5); ctx.lineTo(r * 0.6, r * 0.5); strokeInk(1.1);
          break;
        case 'snail':
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); strokeInk();
          ctx.beginPath();
          for (var a = 0; a < 12; a += 0.2) {
            var rr = r * 0.78 * (1 - a / 13);
            var px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          strokeInk(1.2);
          break;
        case 'sanddollar':
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); strokeInk();
          ctx.strokeStyle = 'rgba(23,23,23,0.55)'; ctx.lineWidth = 1;
          for (var k = 0; k < 5; k++) {
            var an = -1.57 + k * 1.2566;
            ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(an) * r * 0.72, Math.sin(an) * r * 0.72);
            ctx.stroke();
          }
          break;
        case 'hermit':
          ctx.fillStyle = '#C98C4E';
          ctx.beginPath(); ctx.arc(0, -r * 0.2, r * 0.86, 0, 6.283); ctx.fill(); strokeInk();
          ctx.fillStyle = sp.color;
          ctx.beginPath(); ctx.ellipse(r * 0.5, r * 0.5, r * 0.44, r * 0.3, -0.5, 0, 6.283); ctx.fill(); strokeInk(1.1);
          break;
        case 'crab':
          ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.72, 0, 0, 6.283); ctx.fill(); strokeInk();
          ctx.beginPath();
          ctx.moveTo(-r * 0.9, -r * 0.3); ctx.lineTo(-r * 1.5, -r * 0.85);
          ctx.moveTo(r * 0.9, -r * 0.3); ctx.lineTo(r * 1.5, -r * 0.85);
          strokeInk(1.4);
          ctx.fillStyle = C.ink;
          ctx.beginPath(); ctx.arc(-r * 0.28, -r * 0.3, 1.5, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.28, -r * 0.3, 1.5, 0, 6.283); ctx.fill();
          break;
        case 'mudskip':
          ctx.beginPath(); ctx.ellipse(0, 0, r * 1.15, r * 0.7, 0, 0, 6.283); ctx.fill(); strokeInk();
          ctx.beginPath();
          ctx.moveTo(-r * 1.05, 0); ctx.lineTo(-r * 1.75, -r * 0.55);
          ctx.lineTo(-r * 1.75, r * 0.55); ctx.closePath();
          ctx.fillStyle = sp.color; ctx.fill(); strokeInk(1.2);
          ctx.fillStyle = C.ink;
          ctx.beginPath(); ctx.arc(r * 0.6, -r * 0.16, 1.6, 0, 6.283); ctx.fill();
          break;
        case 'starfish':
          ctx.beginPath();
          for (var i = 0; i < 10; i++) {
            var rr2 = (i % 2 === 0) ? r * 1.25 : r * 0.5;
            var an2 = -1.57 + i * 0.6283;
            var px2 = Math.cos(an2) * rr2, py2 = Math.sin(an2) * rr2;
            if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
          }
          ctx.closePath(); ctx.fill(); strokeInk();
          break;
        case 'abalone':
          ctx.beginPath();
          ctx.moveTo(-r * 1.15, r * 0.45);
          ctx.quadraticCurveTo(0, -r * 1.35, r * 1.15, r * 0.45);
          ctx.closePath(); ctx.fill(); strokeInk();
          ctx.fillStyle = 'rgba(23,23,23,0.6)';
          for (var q = 0; q < 4; q++) {
            var qx = -r * 0.6 + q * r * 0.42;
            ctx.beginPath(); ctx.arc(qx, -r * 0.16, 1.3, 0, 6.283); ctx.fill();
          }
          break;
        case 'anemone':
          ctx.strokeStyle = sp.color; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
          for (var m = 0; m < 9; m++) {
            var am = -3.0 + m * 0.42 + Math.sin(t * 1.6 + m) * 0.12;
            ctx.beginPath(); ctx.moveTo(0, r * 0.5);
            ctx.quadraticCurveTo(Math.cos(am) * r * 0.8, Math.sin(am) * r * 0.8,
              Math.cos(am) * r * 1.25, Math.sin(am) * r * 1.25);
            ctx.stroke();
          }
          ctx.fillStyle = sp.color;
          ctx.beginPath(); ctx.ellipse(0, r * 0.45, r * 0.75, r * 0.42, 0, 0, 6.283); ctx.fill(); strokeInk();
          break;
        case 'octopus':
          ctx.strokeStyle = sp.color; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
          for (var n = 0; n < 5; n++) {
            var an3 = 0.4 + n * 0.62 + Math.sin(t * 2 + n) * 0.16;
            ctx.beginPath(); ctx.moveTo(0, r * 0.35);
            ctx.quadraticCurveTo(Math.cos(an3) * r * 1.0, r * 0.9 + Math.sin(an3) * r * 0.5,
              Math.cos(an3) * r * 1.5, r * 0.9 + Math.sin(an3) * r * 0.8);
            ctx.stroke();
          }
          ctx.fillStyle = sp.color;
          ctx.beginPath(); ctx.ellipse(0, -r * 0.1, r * 0.92, r * 0.95, 0, 0, 6.283); ctx.fill(); strokeInk();
          ctx.fillStyle = C.bone;
          ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.2, 2.4, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.2, 2.4, 0, 6.283); ctx.fill();
          ctx.fillStyle = C.ink;
          ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.2, 1.2, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(r * 0.32, -r * 0.2, 1.2, 0, 6.283); ctx.fill();
          break;
        case 'moonbell':
          ctx.beginPath();
          ctx.moveTo(-r * 1.2, r * 0.5);
          ctx.quadraticCurveTo(0, -r * 1.5, r * 1.2, r * 0.5);
          ctx.closePath(); ctx.fill(); strokeInk();
          ctx.strokeStyle = 'rgba(23,23,23,0.35)'; ctx.lineWidth = 1;
          for (var v = -2; v <= 2; v++) {
            ctx.beginPath(); ctx.moveTo(v * r * 0.3, r * 0.5);
            ctx.quadraticCurveTo(v * r * 0.42, -r * 0.2, 0, -r * 0.9);
            ctx.stroke();
          }
          break;
        default:
          ctx.beginPath(); ctx.arc(0, 0, r, 0, 6.283); ctx.fill(); strokeInk();
      }

      // 警觉状态提示
      if (state === 'flee') {
        ctx.strokeStyle = 'rgba(199,69,46,0.55)';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, 6.283); ctx.stroke();
      } else if (state === 'curious') {
        ctx.strokeStyle = 'rgba(78,124,120,0.55)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([3, 4]);
        ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // ── 玩家 ──
    function drawPlayer(s, t) {
      var x = s.px, y = s.py;
      var walk = s.moving ? Math.sin(s.walkPhase) : 0;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s.pdir >= 0 ? 1 : -1, 1);

      ctx.fillStyle = 'rgba(90,72,46,0.26)';
      ctx.beginPath(); ctx.ellipse(0, 15, 11, 4, 0, 0, 6.283); ctx.fill();

      // 腿
      ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-2, 3); ctx.lineTo(-2 + walk * 5, 14);
      ctx.moveTo(2, 3); ctx.lineTo(2 - walk * 5, 14);
      ctx.stroke();

      // 身体（朱红短褂）
      ctx.fillStyle = C.vermilion;
      ctx.beginPath();
      ctx.moveTo(-7, -6); ctx.lineTo(7, -6); ctx.lineTo(6, 5); ctx.lineTo(-6, 5);
      ctx.closePath(); ctx.fill(); strokeInk(1.6);

      // 头
      ctx.fillStyle = C.bone;
      ctx.beginPath(); ctx.arc(0, -12, 6.4, 0, 6.283); ctx.fill(); strokeInk(1.6);

      // 斗笠
      ctx.fillStyle = C.mustard;
      ctx.beginPath();
      ctx.moveTo(-12, -15);
      ctx.quadraticCurveTo(0, -27, 12, -15);
      ctx.quadraticCurveTo(0, -11.5, -12, -15);
      ctx.closePath(); ctx.fill(); strokeInk(1.5);

      // 桶（右后方）
      var fill = Math.min(s.bag.length / Math.max(1, s.bagCap || 6), 1);
      ctx.save();
      ctx.translate(10, 0);
      ctx.fillStyle = '#8A6A44';
      ctx.beginPath();
      ctx.moveTo(-4, -4); ctx.lineTo(4, -4); ctx.lineTo(3.2, 7); ctx.lineTo(-3.2, 7);
      ctx.closePath(); ctx.fill(); strokeInk(1.3);
      if (fill > 0) {
        ctx.fillStyle = C.mustard;
        var hh = 10 * fill;
        ctx.fillRect(-3.6, 7 - hh, 7.2, hh);
      }
      ctx.restore();
      ctx.restore();

      // 屏息圈
      if (s.breath) {
        breathGlow = Math.min(1, breathGlow + 0.12);
      } else breathGlow = Math.max(0, breathGlow - 0.16);
      if (breathGlow > 0.01) {
        var pr = 30 + Math.sin(t * 3.2) * 5;
        ctx.save();
        ctx.strokeStyle = 'rgba(239,234,221,' + (0.55 * breathGlow).toFixed(3) + ')';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 6]);
        ctx.beginPath(); ctx.arc(x, y - 6, pr, 0, 6.283); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = 'rgba(78,124,120,' + (0.35 * breathGlow).toFixed(3) + ')';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y - 6, pr - 8, 0, 6.283); ctx.stroke();
        ctx.restore();
      }
    }

    // ── 岸上的篓子（卸货点）──
    function drawBasket(t) {
      var x = 240, y = SHORE_Y + 62;
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = 'rgba(90,72,46,0.22)';
      ctx.beginPath(); ctx.ellipse(0, 20, 26, 7, 0, 0, 6.283); ctx.fill();
      ctx.fillStyle = '#A98453';
      ctx.beginPath();
      ctx.moveTo(-24, -12); ctx.lineTo(24, -12); ctx.lineTo(18, 20); ctx.lineTo(-18, 20);
      ctx.closePath(); ctx.fill(); strokeInk(1.8);
      ctx.strokeStyle = 'rgba(23,23,23,0.35)'; ctx.lineWidth = 1.2;
      for (var i = -2; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 8, -12); ctx.lineTo(i * 6.4, 20); ctx.stroke();
      }
      ctx.beginPath(); ctx.ellipse(0, -12, 24, 6.5, 0, 0, 6.283);
      ctx.fillStyle = '#C79A62'; ctx.fill(); strokeInk(1.6);
      ctx.restore();
    }

    // ── 浪涌预警 ──
    function drawSurgeWarn(s, t) {
      if (!s.surgeWarn) return;
      var y = s.surgeWarnY;
      var a = 0.35 + Math.sin(t * 12) * 0.25;
      ctx.save();
      ctx.strokeStyle = 'rgba(239,234,221,' + a.toFixed(3) + ')';
      ctx.lineWidth = 2.4;
      ctx.setLineDash([9, 7]);
      ctx.beginPath();
      for (var x = 0; x <= W; x += 8) {
        var yy = y + Math.sin(x * 0.05 + t * 5) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(199,69,46,' + (a * 0.9).toFixed(3) + ')';
      ctx.font = '600 13px "PingFang SC","Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('浪', 240, y - 9);
      ctx.restore();
    }

    // ── 粒子 / 飘字 ──
    function stepParts(dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.x += p.vx * dt; p.y += p.vy * dt;
        p.vy += (p.g || 0) * dt;
        p.vx *= 0.985; p.vy *= 0.985;
      }
      for (var j = floats.length - 1; j >= 0; j--) {
        var f = floats[j];
        f.life -= dt;
        if (f.life <= 0) { floats.splice(j, 1); continue; }
        f.y -= 26 * dt;
      }
    }
    function drawParts() {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        var a = Math.max(0, Math.min(1, p.life / p.max));
        ctx.globalAlpha = a;
        if (p.ring) {
          ctx.strokeStyle = p.c; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 2), 0, 6.283); ctx.stroke();
        } else {
          ctx.fillStyle = p.c;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + a * 0.6), 0, 6.283); ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (var j = 0; j < floats.length; j++) {
        var f = floats[j];
        var a2 = Math.max(0, Math.min(1, f.life / f.max));
        ctx.globalAlpha = a2;
        ctx.font = (f.big ? '700 20px ' : '700 15px ') + '"PingFang SC","Microsoft YaHei",sans-serif';
        ctx.lineWidth = 3.4; ctx.strokeStyle = 'rgba(239,234,221,0.9)';
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.c;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    // ── 主绘制 ──
    function draw(s, dt) {
      var t = s.time;
      dt = Math.min(dt, 0.05);

      // 脚步沙粒
      if (s.moving && s.py > s.waterY) {
        stepAcc += dt;
        if (stepAcc > 0.13) {
          stepAcc = 0;
          push({
            x: s.px - s.pdir * 4, y: s.py + 13,
            vx: -s.pdir * 18, vy: -14, life: 0.4, max: 0.4,
            c: 'rgba(150,126,88,0.8)', r: 1.8, g: 40
          });
        }
      }
      stepParts(dt);

      ctx.save();
      if (shakeMag > 0.1) {
        ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
        shakeMag *= Math.pow(0.02, dt);
        if (shakeMag < 0.1) shakeMag = 0;
      }

      // 背景（干滩 + 岸）
      ctx.setTransform(eff, 0, 0, eff, 0, 0);
      ctx.drawImage(bg, 0, 0, W, H);

      drawWet(s, t);
      drawBasket(t);

      // 生物（只画已露出的）
      for (var i = 0; i < s.items.length; i++) {
        var it = s.items[i];
        if (it.y < s.waterY - 2) continue;
        drawCreature(it.sp, it.x, it.y, t, it.wob, it.state, s);
      }

      s.bagCap = s.bagCap || 6;
      drawPlayer(s, t);
      drawSea(s, t);
      drawSurgeWarn(s, t);
      drawParts();

      // 屏息时的暗角
      if (breathGlow > 0.01) {
        var vg = ctx.createRadialGradient(s.px, s.py - 6, 60, s.px, s.py - 6, 330);
        vg.addColorStop(0, 'rgba(16,26,42,0)');
        vg.addColorStop(1, 'rgba(16,26,42,' + (0.34 * breathGlow).toFixed(3) + ')');
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, W, H);
      }

      // 被卷到时的白闪
      if (flash > 0.01) {
        ctx.fillStyle = 'rgba(239,234,221,' + (flash * 0.55).toFixed(3) + ')';
        ctx.fillRect(0, 0, W, H);
        flash -= dt * 1.9;
      }
      ctx.restore();

      lastPX = s.px; lastPY = s.py;
    }

    return {
      resize: resize,
      draw: draw,
      pump: pump,
      shake: function (m) { shakeMag = Math.max(shakeMag, m); },
      float: float,
      get partCount() { return parts.length; }
    };
  }

  g.TFRender = { create: create, COLORS: C, W: W, H: H };
})(typeof globalThis !== 'undefined' ? globalThis : this);
