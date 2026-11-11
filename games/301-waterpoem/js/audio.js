/* 301《合字 · 水诗》音频层：WebAudio 合成，零外部资源
   彩蛋：合成顺序 = 音序，一路合成就是玩家自己即兴的一段五声调子 */
(function () {
  'use strict';
  var ac = null, master = null, muted = false, ready = false;
  // 五声音阶 宫商角徵羽（D 宫）+ 上八度
  var PENT = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99, 880.00];

  function init() {
    if (ready) return;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = 0.5;
      master.connect(ac.destination);
      ready = true;
    } catch (e) { ready = false; }
  }
  function resume() { if (ac && ac.state === 'suspended') ac.resume(); }
  function setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; }
  function now() { return ac.currentTime; }

  function tone(freq, dur, vol, type, detune) {
    if (!ready || muted) return;
    var t = now();
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    if (detune) o.detune.value = detune;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  function noise(dur, vol, freq, q) {
    if (!ready || muted) return;
    var t = now();
    var n = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, n, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ac.createBufferSource(); src.buffer = buf;
    var bp = ac.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = freq || 900; bp.Q.value = q || 1.1;
    var g = ac.createGain(); g.gain.value = vol;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start(t);
  }

  // 划水：低频水声脉冲
  var lastStroke = 0;
  function stroke(spd) {
    if (!ready || muted) return;
    var t = now();
    if (t - lastStroke < 0.26) return;
    lastStroke = t;
    noise(0.20, 0.055 + Math.min(0.05, spd / 6000), 420 + spd * 0.6, 0.8);
  }
  // 撞：闷响
  function bump() { noise(0.13, 0.07, 240, 0.9); tone(98, 0.12, 0.05, 'sine'); }
  // 拆回
  function split() { noise(0.16, 0.05, 640, 1.4); tone(392, 0.16, 0.045, 'triangle'); }
  // 成字：按合成顺序取音（宫商角徵羽…）
  function merge(idx, bonus) {
    if (!ready || muted) return;
    var f = PENT[Math.min(PENT.length - 1, idx % PENT.length)];
    if (bonus) f *= 0.5;
    tone(f, 0.85, bonus ? 0.11 : 0.16, 'sine');
    tone(f * 2, 0.55, 0.045, 'sine', 4);
    tone(f * 3, 0.35, 0.022, 'sine', -6);
    noise(0.22, 0.03, 1800, 1.6);
  }
  // 通关：上行三音
  function win() {
    [0, 2, 4, 7].forEach(function (k, i) {
      setTimeout(function () { tone(PENT[k % PENT.length] * (k > 5 ? 1 : 1), 1.3, 0.14, 'sine'); }, i * 190);
    });
  }
  // 时间到：柔和下行
  function timeup() {
    [4, 2, 0].forEach(function (k, i) {
      setTimeout(function () { tone(PENT[k] * 0.5, 1.1, 0.10, 'sine'); }, i * 240);
    });
  }
  function click() { tone(660, 0.07, 0.05, 'triangle'); }

  window.WP301A = {
    init: init, resume: resume, setMuted: setMuted,
    stroke: stroke, bump: bump, split: split, merge: merge,
    win: win, timeup: timeup, click: click,
    isMuted: function () { return muted; }
  };
})();
