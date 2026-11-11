/* 297-sandcat《落沙 · 引猫夜》音频层
 * ---------------------------------------------------------------
 * 双轨设计：
 *   ① 内置合成（默认，零文件）：WebAudio 现场合成夜城 BGM（drone + pad + 五声铃 + 风噪）
 *      与全部音效（落沙 / 地灯 / 喵 / 到家 / 过关 / 铲沙 / UI）
 *   ② 本地文件替换（可选）：把同名文件丢进 assets/audio/ 即自动接管，加载失败静默回退合成
 *
 * 想换成自己的音频？见 assets/audio/README.md
 * ---------------------------------------------------------------
 */
(function (root) {
  'use strict';

  /* 期望的外部音频文件（放进去就生效，没有就用合成音） */
  var FILES = {
    bgm: 'assets/audio/bgm.mp3',
    land: 'assets/audio/sfx/land.mp3',
    tap: 'assets/audio/sfx/tap.mp3',
    shovel: 'assets/audio/sfx/shovel.mp3',
    lamp: 'assets/audio/sfx/lamp.mp3',
    meow: 'assets/audio/sfx/meow.mp3',
    home: 'assets/audio/sfx/home.mp3',
    win: 'assets/audio/sfx/win.mp3'
  };

  var SCALE = [0, 2, 4, 7, 9];                 /* 五声音阶（宫商角徵羽） */
  var BASE = 262.63;                            /* C4 */

  var ac = null, master = null, sfxG = null, bgmG = null;
  var muted = false, started = false, unlocked = false;
  var samples = {};
  var bgmTimer = 0, nextBell = 0, nextPad = 0, chordI = 0;
  var VOL = { master: 0.55, bgm: 0.40, sfx: 0.90 };

  function ctx() {
    if (ac) return ac;
    try {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ac = new C();
      master = ac.createGain(); master.gain.value = muted ? 0 : VOL.master;
      master.connect(ac.destination);
      sfxG = ac.createGain(); sfxG.gain.value = VOL.sfx; sfxG.connect(master);
      bgmG = ac.createGain(); bgmG.gain.value = 0; bgmG.connect(master);
    } catch (e) { ac = null; }
    return ac;
  }
  function hz(semi) { return BASE * Math.pow(2, semi / 12); }

  /* ---------- 外部音频探测（失败即回退，不打扰玩家） ---------- */
  function tryLoad(name, url) {
    try {
      var a = new Audio();
      a.preload = 'auto';
      var done = false;
      a.addEventListener('canplaythrough', function () { if (!done) { done = true; samples[name] = a; } }, false);
      a.addEventListener('error', function () { done = true; }, false);
      setTimeout(function () { done = true; }, 4000);
      a.src = url;
      a.load();
    } catch (e) { /* 忽略：用合成音 */ }
  }
  function loadAll() {
    for (var k in FILES) if (Object.prototype.hasOwnProperty.call(FILES, k)) tryLoad(k, FILES[k]);
  }

  function playSample(name, vol) {
    var a = samples[name];
    if (!a) return false;
    try {
      var n = a.cloneNode(true);
      n.volume = (vol == null ? 1 : vol);
      n.currentTime = 0;
      var p = n.play();
      if (p && p.catch) p.catch(function () { });
      return true;
    } catch (e) { return false; }
  }

  /* ---------- 合成基元 ---------- */
  function tone(semi, dur, type, vol, delay) {
    var a = ctx(); if (!a || muted) return;
    var t = a.currentTime + (delay || 0);
    var o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(hz(semi), t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(sfxG);
    o.start(t); o.stop(t + dur + 0.04);
  }
  function noise(dur, freq, q, vol, type, decay) {
    var a = ctx(); if (!a || muted) return;
    var n = Math.max(1, Math.floor(a.sampleRate * dur));
    var b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay || 2.6);
    var s = a.createBufferSource(); s.buffer = b;
    var f = a.createBiquadFilter(); f.type = type || 'bandpass';
    f.frequency.value = freq; f.Q.value = q || 1;
    var g = a.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(sfxG);
    s.start();
  }

  /* ---------- 音效 ---------- */
  var SFX = {
    tap: function () {
      if (playSample('tap', 0.9)) return;
      noise(0.06, 2700, 0.9, 0.075, 'bandpass', 2.2);
      tone(14, 0.09, 'sine', 0.055);
    },
    land: function () {
      if (playSample('land', 0.8)) return;
      noise(0.07, 520, 0.7, 0.05, 'lowpass', 3.2);
    },
    shovel: function () {
      if (playSample('shovel', 0.8)) return;
      noise(0.11, 1500, 0.6, 0.05, 'bandpass', 1.6);
    },
    lamp: function (i) {
      if (playSample('lamp', 0.85)) return;
      var k = (i || 0) % 5;
      tone(SCALE[k] + 12, 0.5, 'sine', 0.09);
      tone(SCALE[k] + 24, 0.35, 'sine', 0.035, 0.02);
    },
    meow: function () {
      if (playSample('meow', 0.9)) return;
      var a = ctx(); if (!a || muted) return;
      var o = a.createOscillator(), g = a.createGain(), f = a.createBiquadFilter();
      o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 1500;
      var t = a.currentTime;
      o.frequency.setValueAtTime(620, t);
      o.frequency.exponentialRampToValueAtTime(430, t + 0.20);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.075, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0008, t + 0.30);
      o.connect(f); f.connect(g); g.connect(sfxG);
      o.start(t); o.stop(t + 0.34);
    },
    home: function (i) {
      if (playSample('home', 0.95)) return;
      var k = (i || 0) % 5;
      tone(SCALE[k], 0.7, 'triangle', 0.13);
      tone(SCALE[k] + 12, 0.9, 'sine', 0.08, 0.10);
    },
    win: function () {
      if (playSample('win', 1)) return;
      for (var i = 0; i < 5; i++) tone(SCALE[i] + (i > 2 ? 12 : 0), 1.1, 'sine', 0.10, i * 0.11);
      tone(0, 1.6, 'triangle', 0.07, 0.58);
      tone(12, 1.8, 'sine', 0.05, 0.62);
    },
    ui: function () { tone(7, 0.07, 'sine', 0.05); }
  };

  /* ---------- BGM：夜城环境（drone + pad + 铃 + 风） ---------- */
  var CHORDS = [[0, 7, 12], [-5, 2, 7], [-3, 4, 9], [2, 9, 14]];

  function schedule() {
    var a = ctx(); if (!a || muted) return;
    var t = a.currentTime, look = t + 1.6;
    while (nextPad < look) {
      var ch = CHORDS[chordI % CHORDS.length]; chordI++;
      for (var i = 0; i < ch.length; i++) {
        var o = a.createOscillator(), g = a.createGain();
        o.type = 'sine'; o.frequency.value = hz(ch[i] - 12);
        var s = Math.max(t, nextPad);
        g.gain.setValueAtTime(0, s);
        g.gain.linearRampToValueAtTime(0.016, s + 2.6);
        g.gain.linearRampToValueAtTime(0.0001, s + 8.6);
        o.connect(g); g.connect(bgmG);
        o.start(s); o.stop(s + 9.0);
      }
      nextPad += 8.0;
    }
    while (nextBell < look) {
      var semi = SCALE[Math.floor(Math.random() * 5)] + (Math.random() < 0.45 ? 12 : 0);
      var o2 = a.createOscillator(), g2 = a.createGain();
      o2.type = 'sine'; o2.frequency.value = hz(semi);
      var s2 = Math.max(t, nextBell);
      g2.gain.setValueAtTime(0, s2);
      g2.gain.linearRampToValueAtTime(0.045, s2 + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0006, s2 + 2.2);
      o2.connect(g2); g2.connect(bgmG);
      o2.start(s2); o2.stop(s2 + 2.4);
      nextBell += 3.2 + Math.random() * 4.2;
    }
  }

  function startBgm() {
    var a = ctx(); if (!a || started) return;
    started = true;
    var t = a.currentTime;

    [55, 55.35, 82.5].forEach(function (f, i) {
      var o = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
      o.type = i === 2 ? 'sine' : 'sawtooth';
      o.frequency.value = f;
      lp.type = 'lowpass'; lp.frequency.value = i === 2 ? 260 : 190; lp.Q.value = 0.6;
      g.gain.value = i === 2 ? 0.020 : 0.030;
      o.connect(lp); lp.connect(g); g.connect(bgmG);
      o.start(t);
    });

    var n = Math.floor(a.sampleRate * 2), b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1);
    var src = a.createBufferSource(); src.buffer = b; src.loop = true;
    var bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 460; bp.Q.value = 0.55;
    var wg = a.createGain(); wg.gain.value = 0.012;
    src.connect(bp); bp.connect(wg); wg.connect(bgmG);
    src.start(t);

    /* 有外部 bgm 就让位给它 */
    if (samples.bgm) {
      try {
        samples.bgm.loop = true; samples.bgm.volume = 1;
        var p = samples.bgm.play(); if (p && p.catch) p.catch(function () { });
      } catch (e) { }
      bgmG.gain.setValueAtTime(0, t);
      return;
    }

    bgmG.gain.setValueAtTime(0, t);
    bgmG.gain.linearRampToValueAtTime(VOL.bgm, t + 2.4);
    nextBell = t + 2.0; nextPad = t + 0.4;
    bgmTimer = setInterval(schedule, 380);
  }

  /* ---------- 对外 API ---------- */
  var SND = {
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      var a = ctx(); if (!a) return;
      if (a.state === 'suspended') { try { a.resume(); } catch (e) { } }
      startBgm();
    },
    load: loadAll,
    sfx: function (name, arg) {
      if (muted) return;
      var f = SFX[name];
      if (f) { try { f(arg); } catch (e) { } }
    },
    setMuted: function (m) {
      muted = !!m;
      var a = ctx(); if (!a) return;
      var t = a.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : VOL.master, t + 0.16);
    },
    isMuted: function () { return muted; },
    hasExternal: function (n) { return !!samples[n]; },
    externalCount: function () { var k = 0; for (var i in samples) if (Object.prototype.hasOwnProperty.call(samples, i)) k++; return k; },
    FILES: FILES
  };

  root.SANDA = SND;
})(typeof self !== 'undefined' ? self : globalThis);
