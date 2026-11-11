/* 308-stonestack · 音频层：WebAudio 合成，零外部资源 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SSA308 = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ac = null, master = null, muted = false, started = false;
  var streamGain = null, streamSrc = null, streamFilter = null;
  // 五声音阶（宫商角徵羽）
  var PENTA = [261.63, 293.66, 329.63, 392.00, 440.00];

  function ctx() {
    if (ac) return ac;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ac.destination);
    return ac;
  }

  function noiseBuffer(c, sec) {
    var n = Math.floor(c.sampleRate * sec);
    var b = c.createBuffer(1, n, c.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function env(g, t0, a, d, peak) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  function tone(freq, dur, type, peak, delay, glideTo) {
    var c = ctx(); if (!c || muted) return;
    var t0 = c.currentTime + (delay || 0);
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    env(g, t0, Math.min(0.03, dur * 0.25), dur, peak == null ? 0.20 : peak);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.06);
  }

  function noise(dur, f0, f1, peak, q) {
    var c = ctx(); if (!c || muted) return;
    var t0 = c.currentTime;
    var s = c.createBufferSource(); s.buffer = noiseBuffer(c, Math.max(0.08, dur));
    var bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.setValueAtTime(f0, t0);
    bp.frequency.exponentialRampToValueAtTime(Math.max(60, f1), t0 + dur);
    bp.Q.value = q || 1.1;
    var g = c.createGain();
    env(g, t0, 0.008, dur, peak == null ? 0.22 : peak);
    s.connect(bp); bp.connect(g); g.connect(master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  // 溪水底噪：持续带通白噪
  function startStream() {
    var c = ctx(); if (!c || started) return;
    started = true;
    var s = c.createBufferSource();
    s.buffer = noiseBuffer(c, 2.4); s.loop = true;
    var lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 760; lp.Q.value = 0.6;
    var hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
    streamGain = c.createGain(); streamGain.gain.value = 0.055;
    s.connect(hp); hp.connect(lp); lp.connect(streamGain); streamGain.connect(master);
    s.start();
    streamSrc = s; streamFilter = lp;
  }

  function setFlow(f) {
    if (!streamFilter || !ac) return;
    try { streamFilter.frequency.setTargetAtTime(620 + f * 900, ac.currentTime, 0.4); } catch (e) { }
  }

  var API = {
    init: function () { var c = ctx(); if (c && c.state === 'suspended') c.resume(); startStream(); },
    setMuted: function (m) { muted = !!m; if (master) master.gain.value = muted ? 0 : 0.5; },
    isMuted: function () { return muted; },
    setFlow: setFlow,
    // 落石：闷响 + 一声五声音阶（层数越高音越高 → 塔本身就是一段旋律）
    place: function (layer) {
      noise(0.16, 420, 120, 0.30, 0.9);
      var i = layer % 5, oct = Math.floor(layer / 5);
      tone(PENTA[i] * Math.pow(2, oct), 0.42, 'sine', 0.16, 0.02);
      tone(PENTA[i] * Math.pow(2, oct) * 2, 0.20, 'triangle', 0.05, 0.02);
    },
    slip: function () { noise(0.34, 900, 180, 0.26, 0.7); tone(150, 0.24, 'sine', 0.10, 0, 90); },
    collapse: function (n) {
      noise(0.5, 700, 90, 0.34, 0.6);
      for (var i = 0; i < Math.min(5, n); i++) tone(220 - i * 22, 0.26, 'triangle', 0.12, i * 0.045);
    },
    undo: function () { tone(330, 0.14, 'sine', 0.10); },
    select: function () { tone(520, 0.07, 'sine', 0.07); },
    tick: function () { tone(880, 0.05, 'sine', 0.05); },
    win: function () {
      for (var i = 0; i < 6; i++) tone(PENTA[i % 5] * Math.pow(2, Math.floor(i / 5)), 0.62, 'sine', 0.18, i * 0.11);
      noise(0.7, 1600, 300, 0.10, 0.8);
    },
    over: function () { tone(196, 0.7, 'sine', 0.14); tone(147, 0.9, 'sine', 0.10, 0.14); },
    // 通关时按塔的层数回整段旋律（音律彩蛋）
    playTower: function (n) {
      for (var i = 0; i < n; i++) {
        var oct = Math.floor(i / 5);
        tone(PENTA[i % 5] * Math.pow(2, oct), 0.34, 'sine', 0.15, i * 0.15);
      }
    }
  };
  return API;
});
