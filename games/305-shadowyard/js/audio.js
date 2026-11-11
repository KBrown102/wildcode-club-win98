/* 305-shadowyard · audio.js —— WebAudio 合成：五声音阶 + 环境垫音，零外部资源 */
(function () {
  'use strict';
  var ac = null, master = null, muted = false, started = false;
  var PENT = [0, 2, 4, 7, 9];        // 宫商角徵羽
  var BASE = 220;

  function ensure() {
    if (ac) return ac;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
    } catch (e) { ac = null; }
    return ac;
  }
  function resume() { var a = ensure(); if (a && a.state === 'suspended') a.resume(); }
  function hz(n) { return BASE * Math.pow(2, n / 12); }

  function tone(freq, t0, dur, type, vol, detune) {
    var a = ensure(); if (!a || muted) return;
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, freq, q, vol) {
    var a = ensure(); if (!a || muted) return;
    var len = Math.max(1, Math.floor(a.sampleRate * dur));
    var buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = a.createBufferSource(); src.buffer = buf;
    var bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq || 900; bp.Q.value = q || 1.2;
    var g = a.createGain(); g.gain.value = vol || 0.12;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t0);
  }

  var pad = null;
  function startPad() {
    var a = ensure(); if (!a || pad) return;
    pad = a.createGain(); pad.gain.value = 0; pad.connect(master);
    pad.gain.linearRampToValueAtTime(0.045, a.currentTime + 2.5);
    [0, 7, 12].forEach(function (n, i) {
      var o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = hz(PENT[i % 5] - 12) * (n === 12 ? 2 : 1);
      g.gain.value = 0.34 / (i + 1);
      var lfo = a.createOscillator(), lg = a.createGain();
      lfo.frequency.value = 0.045 + i * 0.017; lg.gain.value = 0.9;
      lfo.connect(lg); lg.connect(o.detune); lfo.start();
      o.connect(g); g.connect(pad); o.start();
    });
    started = true;
  }
  function duck(v) { if (pad && ac) pad.gain.linearRampToValueAtTime(v, ac.currentTime + 0.4); }

  function scaleNote(i, oct) {
    var n = PENT[((i % 5) + 5) % 5] + 12 * (oct || 0) + 12 * Math.floor(i / 5);
    return hz(n);
  }

  var API = {
    init: function () { ensure(); },
    resume: resume,
    startPad: startPad,
    setMuted: function (m) { muted = m; if (master && ac) master.gain.linearRampToValueAtTime(m ? 0 : 0.5, ac.currentTime + 0.15); },
    isMuted: function () { return muted; },
    // 拿起 / 放下
    pick: function () { var a = ensure(); if (!a) return; noise(a.currentTime, 0.09, 1500, 1.4, 0.07); tone(hz(4), a.currentTime, 0.12, 'sine', 0.07); },
    place: function () { var a = ensure(); if (!a) return; var t = a.currentTime; noise(t, 0.14, 520, 1.0, 0.13); tone(hz(-5), t, 0.2, 'sine', 0.11); },
    deny: function () { var a = ensure(); if (!a) return; tone(hz(-9), a.currentTime, 0.16, 'triangle', 0.09); },
    rot: function () { var a = ensure(); if (!a) return; noise(a.currentTime, 0.07, 2400, 2.0, 0.05); },
    // 时辰更迭
    bell: function (k) { var a = ensure(); if (!a) return; var t = a.currentTime; tone(scaleNote(k, 1), t, 0.9, 'sine', 0.13); tone(scaleNote(k, 1) * 2, t, 0.5, 'sine', 0.05); },
    // 庇格达成
    good: function (i) { var a = ensure(); if (!a) return; var t = a.currentTime; tone(scaleNote(i, 1), t, 0.7, 'sine', 0.15); tone(scaleNote(i, 1) * 1.5, t + 0.05, 0.5, 'sine', 0.06); },
    // 晒格被遮
    bad: function () { var a = ensure(); if (!a) return; var t = a.currentTime; tone(hz(-12), t, 0.35, 'triangle', 0.13); noise(t, 0.2, 300, 0.8, 0.07); },
    // 开演 / 收场
    go: function () { var a = ensure(); if (!a) return; var t = a.currentTime; [0, 2, 4].forEach(function (n, i) { tone(hz(PENT[n]), t + i * 0.09, 0.7, 'sine', 0.11); }); duck(0.075); },
    winMelody: function (n) {
      var a = ensure(); if (!a) return; var t = a.currentTime, i;
      for (i = 0; i < Math.max(3, n); i++) tone(scaleNote(i, 1), t + i * 0.26, 0.85, 'sine', 0.15);
      tone(hz(0), t + Math.max(3, n) * 0.26, 1.6, 'sine', 0.13);
      duck(0.05);
    },
    lose: function () { var a = ensure(); if (!a) return; var t = a.currentTime; [4, 2, 0].forEach(function (n, i) { tone(hz(PENT[n] - 5), t + i * 0.18, 0.7, 'sine', 0.11); }); duck(0.05); }
  };
  window.SC305A = API;
})();
