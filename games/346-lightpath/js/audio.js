/**
 * audio.js —— 五声音阶轻音效（WebAudio，离线可用，零依赖）
 * 静音状态持久化到 localStorage。无音频环境时静默降级。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AudioMod = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 五声音阶（C 大调五声）频率，单位 Hz
  var SCALE = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33];
  var MUTE_KEY = 'lightpath_muted';

  function AudioMod() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    try { this.muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) {}
  }
  AudioMod.prototype._ensure = function () {
    if (this.ctx) return true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch (e) { return false; }
  };
  AudioMod.prototype.resume = function () {
    if (this._ensure() && this.ctx.state === 'suspended') this.ctx.resume();
  };
  AudioMod.prototype._tone = function (freq, dur, type, when, gainPeak) {
    if (this.muted || !this._ensure()) return;
    var ctx = this.ctx, t0 = (when || ctx.currentTime);
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak || 0.25, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (dur || 0.4));
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + (dur || 0.4) + 0.02);
  };
  // 放置：清亮上行
  AudioMod.prototype.place = function () { this._tone(SCALE[2], 0.35, 'triangle'); };
  // 旋转：短促木质
  AudioMod.prototype.rotate = function () { this._tone(SCALE[3], 0.18, 'square', undefined, 0.16); };
  // 拾回：轻落
  AudioMod.prototype.remove = function () { this._tone(SCALE[1], 0.22, 'sine', undefined, 0.18); };
  // 提示：柔和双音
  AudioMod.prototype.hint = function () { this._tone(SCALE[4], 0.3, 'sine'); this._tone(SCALE[5], 0.3, 'sine', (this.ctx ? this.ctx.currentTime : 0) + 0.08); };
  // 非法：闷响
  AudioMod.prototype.deny = function () { this._tone(110, 0.16, 'sine', undefined, 0.12); };
  // 点亮目标：琶音和弦
  AudioMod.prototype.win = function () {
    if (this.muted || !this._ensure()) return;
    var base = this.ctx ? this.ctx.currentTime : 0;
    var arp = [SCALE[0], SCALE[2], SCALE[4], SCALE[5], SCALE[6]];
    for (var i = 0; i < arp.length; i++) this._tone(arp[i], 0.6, 'triangle', base + i * 0.09, 0.22);
  };
  AudioMod.prototype.toggleMute = function () {
    this.muted = !this.muted;
    try { localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0'); } catch (e) {}
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  };
  AudioMod.prototype.isMuted = function () { return this.muted; };

  return AudioMod;
});
