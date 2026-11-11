/* 302 雪径 · 开路 — WebAudio 合成音（零外部资源） */
(function (g) {
  'use strict';
  var ac = null, master = null, windGain = null, windSrc = null, muted = false, started = false;
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

  function ensure() {
    if (ac) return ac;
    var AC = g.AudioContext || g.webkitAudioContext;
    if (!AC) return null;
    ac = new AC();
    master = ac.createGain(); master.gain.value = muted ? 0 : 0.5; master.connect(ac.destination);
    return ac;
  }
  function noiseBuf(sec) {
    var n = Math.floor(ac.sampleRate * sec), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function start() {
    if (started || !ensure()) return;
    if (ac.state === 'suspended') ac.resume();
    started = true;
    // 风：白噪声 → 低通（缓慢摆动）
    var src = ac.createBufferSource(); src.buffer = noiseBuf(4); src.loop = true;
    var lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.6;
    windGain = ac.createGain(); windGain.gain.value = 0.10;
    var lfo = ac.createOscillator(); lfo.frequency.value = 0.07;
    var lg = ac.createGain(); lg.gain.value = 190;
    lfo.connect(lg); lg.connect(lp.frequency);
    src.connect(lp); lp.connect(windGain); windGain.connect(master);
    src.start(); lfo.start(); windSrc = src;
    // 低频垫音
    var o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 55;
    var og = ac.createGain(); og.gain.value = 0.05;
    o.connect(og); og.connect(master); o.start();
  }
  function env(node, a, d, peak) {
    var t = ac.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }
  function tone(freq, dur, type, vol, detune) {
    if (!ac || muted) return;
    var o = ac.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    var gn = ac.createGain(); o.connect(gn); gn.connect(master);
    env(gn, 0.012, dur, vol || 0.16);
    o.start(); o.stop(ac.currentTime + dur + 0.08);
  }
  function noise(dur, freq, q, vol, type) {
    if (!ac || muted) return;
    var s = ac.createBufferSource(); s.buffer = noiseBuf(Math.max(0.12, dur + 0.05));
    var f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
    var gn = ac.createGain(); s.connect(f); f.connect(gn); gn.connect(master);
    env(gn, 0.008, dur, vol || 0.09);
    s.start(); s.stop(ac.currentTime + dur + 0.08);
  }
  // 五声音阶：宫商角徵羽
  function penta(i, dur, vol) {
    var st = PENTA[Math.max(0, Math.min(PENTA.length - 1, i))];
    tone(261.63 * Math.pow(2, st / 12), dur || 0.5, 'triangle', vol || 0.14);
    tone(261.63 * Math.pow(2, st / 12) * 2.01, (dur || 0.5) * 0.6, 'sine', (vol || 0.14) * 0.35);
  }

  var API = {
    start: start,
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; },
    step: function (firm) {
      // 深雪嘎吱：越深越闷、越响
      var deep = 1 - firm;
      noise(0.07 + deep * 0.05, 700 + firm * 900, 1.4, 0.030 + deep * 0.045);
    },
    hiss: function (v) { noise(0.16, 2100, 0.7, 0.045, 'highpass'); },
    pick: function (n) { penta((n - 1) % PENTA.length, 0.55, 0.16); tone(880, 0.18, 'sine', 0.05); },
    deliver: function (n) {
      penta(n % PENTA.length, 0.7, 0.15);
      setTimeout(function () { penta((n + 2) % PENTA.length, 0.7, 0.11); }, 90);
      noise(0.3, 300, 0.8, 0.05, 'lowpass');
    },
    bump: function () { noise(0.09, 180, 1.6, 0.05, 'lowpass'); },
    wear: function () { noise(0.22, 1400, 0.9, 0.05, 'highpass'); },
    slideon: function () { noise(0.28, 2600, 0.6, 0.05, 'highpass'); },
    win: function () {
      var seq = [0, 2, 4, 7, 9];
      seq.forEach(function (s, i) { setTimeout(function () { penta(s, 1.1, 0.15); }, i * 130); });
    },
    timeout: function () { tone(196, 0.9, 'sine', 0.10); tone(146.8, 1.1, 'sine', 0.08); },
    ui: function () { tone(660, 0.07, 'sine', 0.06); }
  };
  g.SC302A = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
