/* 299-tiltshelf —— WebAudio 合成音效（零外部资源） */
(function (root) {
  'use strict';
  var A = { ctx: null, master: null, muted: false, nodes: 0, ready: false, padTimer: 0 };

  function ensure() {
    if (A.ctx) { if (A.ctx.state === 'suspended') A.ctx.resume(); return A.ctx; }
    var C = root.AudioContext || root.webkitAudioContext;
    if (!C) return null;
    A.ctx = new C();
    A.master = A.ctx.createGain();
    A.master.gain.value = A.muted ? 0 : 0.5;
    A.master.connect(A.ctx.destination);
    A.ready = true;
    return A.ctx;
  }

  function noiseBuf(ctx, dur) {
    var n = Math.floor(ctx.sampleRate * dur);
    var b = ctx.createBuffer(1, n, ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function tone(freq, dur, type, vol, delay, slideTo) {
    var ctx = ensure(); if (!ctx || A.muted) return;
    var t0 = ctx.currentTime + (delay || 0);
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(A.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
    A.nodes++;
  }

  function noise(dur, freq, q, vol, delay, type) {
    var ctx = ensure(); if (!ctx || A.muted) return;
    var t0 = ctx.currentTime + (delay || 0);
    var s = ctx.createBufferSource(); s.buffer = noiseBuf(ctx, dur + 0.05);
    var f = ctx.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1.2;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(A.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
    A.nodes++;
  }

  // 五声音阶（宫商角徵羽）
  var PENT = [261.63, 293.66, 329.63, 392.00, 440.00];

  var SFX = {
    // 落板：木音（低频三角 + click）
    place: function (k) {
      var base = [210, 168, 132][k] || 180;
      tone(base, 0.16, 'triangle', 0.26, 0, base * 0.72);
      noise(0.05, 1400, 1.0, 0.10, 0);
    },
    pick: function () { tone(430, 0.09, 'triangle', 0.16, 0, 520); },
    hold: function () { tone(660, 0.045, 'sine', 0.07, 0); },
    // 滑动：擦音
    slide: function () { noise(0.24, 900, 3.2, 0.13, 0, 'bandpass'); tone(150, 0.2, 'sine', 0.05, 0, 110); },
    // 掉落：闷响
    fall: function () {
      tone(88, 0.34, 'sine', 0.3, 0, 52);
      noise(0.22, 320, 0.8, 0.16, 0.02, 'lowpass');
    },
    deny: function () { tone(150, 0.1, 'square', 0.07, 0, 110); },
    // 收工：宫→角→徵 上行
    clear: function () {
      [0, 2, 3].forEach(function (i, k) { tone(PENT[i], 0.7, 'sine', 0.22, k * 0.16); });
      [0, 2, 3].forEach(function (i, k) { tone(PENT[i] * 2, 0.5, 'triangle', 0.09, k * 0.16 + 0.02); });
    },
    end: function () { tone(196, 0.5, 'sine', 0.18, 0, 147); },
    star: function (n) { for (var i = 0; i < n; i++) tone(PENT[i + 1] * 2, 0.4, 'sine', 0.16, 0.1 + i * 0.13); }
  };

  function play(name, arg) {
    if (A.muted) return;
    var f = SFX[name];
    if (f) { try { f(arg); } catch (e) { /* 忽略 */ } }
  }

  // 环境垫音：两层缓慢正弦 + 偶尔一记暖音
  function pad() {
    var ctx = ensure(); if (!ctx || A.muted) return;
    var t0 = ctx.currentTime;
    [130.81, 196.00].forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.035, t0 + 2.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 9.5);
      o.connect(g); g.connect(A.master);
      o.start(t0); o.stop(t0 + 9.6);
      A.nodes++;
    });
  }

  function setMuted(m) {
    A.muted = !!m;
    if (A.master) A.master.gain.value = A.muted ? 0 : 0.5;
    if (!A.muted) { ensure(); pad(); }
  }

  A.ensure = ensure; A.play = play; A.setMuted = setMuted; A.pad = pad; A.PENT = PENT; A.tone = tone;
  root.SC299A = A;
})(typeof window !== 'undefined' ? window : globalThis);
